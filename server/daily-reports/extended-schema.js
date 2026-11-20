import { ensureConfigurationSchema } from './configuration.js';

export async function ensureExtendedSchema(pool) {
  await ensureConfigurationSchema(pool);
  await pool.query(`
    alter table daily_report_leaders add column if not exists deleted_at timestamptz;
    alter table daily_report_cases add column if not exists title text not null default '';
    alter table daily_report_cases add column if not exists location_address jsonb;
    alter table daily_report_legal_articles add column if not exists article_text text not null default '';
    alter table daily_report_drafts add column if not exists document_fields jsonb not null default '{}';
    alter table daily_report_exports add column if not exists document_snapshot jsonb not null default '{}';
    alter table daily_report_cases add column if not exists external_reference text not null default '';
    alter table daily_report_cases add column if not exists persons jsonb not null default '[]';
    alter table daily_report_cases add column if not exists legal_article_id uuid
      references daily_report_legal_articles(id);
    alter table daily_report_cases add column if not exists legal_reference jsonb;
    alter table daily_report_case_events add column if not exists decision_authority text;
    alter table daily_report_legal_articles add column if not exists chapter text not null default '';
    alter table daily_report_legal_articles add column if not exists amendment_note text not null default '';
    alter table daily_report_legal_versions add column if not exists diff jsonb not null default '{}';
    alter table daily_report_legal_versions add column if not exists supersedes_id uuid
      references daily_report_legal_versions(id);
    alter table daily_report_drafts add column if not exists statistics_snapshot jsonb not null default '{}';
    alter table daily_report_exports add column if not exists statistics_snapshot jsonb not null default '{}';
    alter table daily_report_exports add column if not exists profile_version text not null default 'technical-v1';
    alter table daily_report_statistic_rules add column if not exists version integer not null default 1;
    alter table daily_report_unlock_requests add column if not exists expired_notified_at timestamptz;
    alter table daily_report_user_roles add column if not exists submodules jsonb;
    alter table daily_report_user_roles add column if not exists effective_from date;
    alter table daily_report_user_roles add column if not exists effective_to date;
    create table if not exists daily_report_draft_history (
      draft_id uuid not null references daily_report_drafts(id), revision integer not null,
      snapshot jsonb not null, actor_id bigint not null references users(id),
      created_at timestamptz not null default now(), primary key(draft_id,revision)
    );
  `);
  await pool.query(`create or replace function daily_report_immutable_audit() returns trigger language plpgsql as $$
    begin raise exception 'Audit and snapshot records are append-only'; end $$`);
  for (const table of ['daily_report_audit', 'daily_report_draft_history', 'daily_report_exports']) {
    await pool.query(`create or replace trigger daily_report_immutable
      before update or delete on ${table} for each row execute function daily_report_immutable_audit()`);
  }
  await pool.query(`create or replace function daily_report_source_notification() returns trigger language plpgsql as $$
    declare topic text; owner_unit bigint; recipient record; kind text; payload jsonb;
    begin
      kind := TG_ARGV[0];
      payload := jsonb_build_object('report_day',NEW.report_day,'version',NEW.version);
      if kind='CASE_EVENT' then
        select unit_id into owner_unit from daily_report_cases where id=NEW.case_id;
        if NEW.state='SUPERSEDED' then return NEW; end if;
        topic := case when NEW.state='VERIFIED' then 'CASE_EVENT_VERIFIED'
          when NEW.event_kind<>'INITIAL_REPORT' and coalesce(NEW.decision_number,'')<>''
            then 'CASE_DECISION_ADDED' else 'CASE_EVENT_UPDATED' end;
        payload := payload || jsonb_build_object('decision_number',NEW.decision_number,
          'decision_type',NEW.decision_type,'source_user_id',NEW.source_user_id);
      else
        owner_unit := NEW.unit_id;
        if TG_OP='UPDATE' and OLD.state is not distinct from NEW.state then
          if OLD.version=NEW.version then return NEW; end if;
          topic := kind||'_UPDATED';
        else
          topic := kind||'_'||NEW.state;
        end if;
      end if;
      for recipient in select distinct user_id from daily_report_user_roles
        where role_code='PV01_COMPILER' and (unit_id is null or unit_id=owner_unit) loop
        insert into daily_report_outbox(event_key,event_type,recipient_user_id,resource_type,resource_id,safe_payload)
        values(topic||':'||NEW.id||':'||NEW.version||':'||recipient.user_id,
          topic,recipient.user_id,kind,NEW.id::text,payload) on conflict(event_key) do nothing;
      end loop;
      insert into daily_report_outbox(event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
      values(topic||':'||NEW.id||':'||NEW.version||':unit',topic,owner_unit,kind,NEW.id::text,payload)
      on conflict(event_key) do nothing;
      return NEW;
    end $$`);
  for (const [table, kind] of [['daily_report_case_events', 'CASE_EVENT'],
    ['daily_report_metrics', 'WORK_RESULT'], ['daily_report_situations', 'SITUATION']]) {
    await pool.query(`create or replace trigger daily_report_notify_source
      after insert or update on ${table} for each row execute function daily_report_source_notification('${kind}')`);
  }
}
