import { ensureApprovalSplit } from './approval-schema.js';
import { ensureIntakeSchema } from './intake/routes.js';
import { ensureReferenceCaseSchema } from './reference-case/routes.js';
import { ensureExtendedSchema } from './extended-schema.js';
import { ensureAttachmentSchema } from './attachment-schema.js';
import { ensureClassificationSchema } from './classifications.js';

export async function ensureDailyReportSchema(pool) {
  await pool.query(`
    create table if not exists daily_report_user_roles (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      role_code text not null check (role_code in (
        'UNIT_REPORTER', 'PV01_COMPILER', 'BCN_ADMIN', 'LEGAL_REVIEWER', 'AUDITOR'
      )),
      unit_id bigint references teams(id) on delete restrict,
      metric_code text,
      assigned_by bigint references users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_cases (
      id uuid primary key,
      stable_code text not null unique,
      unit_id bigint not null references teams(id) on delete restrict,
      business_code text not null,
      category_code text not null,
      occurred_at timestamptz,
      report_day date not null,
      location_general text not null default '',
      summary text not null,
      current_state text not null default 'DRAFT'
        check (current_state in ('DRAFT','SUBMITTED','PENDING_REVIEW','RETURNED','RESUBMITTED','VERIFIED')),
      version integer not null default 1 check (version > 0),
      counted_as_pphs boolean not null default false,
      duplicate_state text not null default 'UNRESOLVED',
      created_by bigint not null references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create unique index if not exists daily_report_user_roles_scope_idx
    on daily_report_user_roles
      (user_id, role_code, (coalesce(unit_id, 0)), (coalesce(metric_code, '')))
  `);
  await pool.query(`
    create table if not exists daily_report_case_events (
      id uuid primary key,
      case_id uuid not null references daily_report_cases(id) on delete restrict,
      report_day date not null,
      event_kind text not null,
      narrative text not null,
      state text not null default 'PENDING_REVIEW',
      decision_type text,
      decision_number text,
      decision_date date,
      source_user_id bigint not null references users(id),
      version integer not null default 1,
      late_flag boolean not null default false,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table daily_report_case_events
    add column if not exists state text not null default 'PENDING_REVIEW'`);
  await pool.query(`
    create table if not exists daily_report_submissions (
      id uuid primary key,
      case_id uuid not null references daily_report_cases(id) on delete restrict,
      unit_id bigint not null references teams(id) on delete restrict,
      report_day date not null,
      version integer not null,
      state text not null,
      snapshot jsonb not null,
      snapshot_sha256 text not null,
      late_flag boolean not null default false,
      created_by bigint not null references users(id),
      created_at timestamptz not null default now(),
      unique(case_id, version)
    )
  `);
  await pool.query(`
    create table if not exists daily_report_returns (
      id uuid primary key,
      submission_id uuid not null references daily_report_submissions(id) on delete restrict,
      reason text not null check (length(trim(reason)) > 0),
      requested_fields jsonb not null default '[]'::jsonb,
      response text,
      resubmitted_submission_id uuid references daily_report_submissions(id) on delete restrict,
      actor_id bigint not null references users(id),
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_situations (
      id uuid primary key,
      unit_id bigint not null references teams(id) on delete restrict,
      report_day date not null,
      category_codes jsonb not null,
      narrative text not null,
      linked_case_id uuid references daily_report_cases(id) on delete restrict,
      state text not null default 'DRAFT',
      created_by bigint not null references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_metrics (
      id uuid primary key,
      unit_id bigint not null references teams(id) on delete restrict,
      report_day date not null,
      metric_code text not null,
      metric_version integer not null default 1,
      metric_values jsonb not null,
      state text not null default 'DRAFT',
      version integer not null default 1,
      late_flag boolean not null default false,
      created_by bigint not null references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_unlock_requests (
      id uuid primary key,
      unit_id bigint not null references teams(id) on delete restrict,
      report_day date not null,
      scope_kind text not null,
      scope_id text not null,
      reason text not null check (length(trim(reason)) > 0),
      status text not null default 'REQUESTED'
        check (status in ('REQUESTED','APPROVED','REJECTED','CANCELLED')),
      requester_id bigint not null references users(id),
      decided_by bigint references users(id),
      decision_reason text,
      approved_at timestamptz,
      expires_at timestamptz,
      created_at timestamptz not null default now(),
      decided_at timestamptz
    )
  `);
  await pool.query(`
    alter table daily_report_unlock_requests add column if not exists purpose text not null default 'REPORTING_WINDOW'
  `);
  await pool.query(`
    create table if not exists daily_report_duplicate_decisions (
      id uuid primary key,
      case_id uuid not null references daily_report_cases(id) on delete restrict,
      candidate_case_id uuid not null references daily_report_cases(id) on delete restrict,
      action text not null check (action in (
        'APPEND_EVENT_TO_EXISTING','DUPLICATE_NO_RECOUNT','SEPARATE_CASE'
      )),
      reason text not null check (length(trim(reason)) > 0),
      reviewer_id bigint not null references users(id),
      created_at timestamptz not null default now(),
      check (case_id <> candidate_case_id)
    )
  `);
  await pool.query(`
    create table if not exists daily_report_leaders (
      id uuid primary key,
      full_name text not null,
      rank_name text not null default '',
      title text not null,
      signer_scope text not null check (signer_scope in ('PV01','CATP')),
      effective_from date not null,
      effective_to date,
      archived_at timestamptz,
      created_by bigint not null references users(id),
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_drafts (
      id uuid primary key,
      report_day date not null,
      report_type text not null check (report_type in ('BANTIN_24H','BCN_PV01','BCN_BCA','BCN_TUUB')),
      revision integer not null default 1,
      signer_id uuid references daily_report_leaders(id) on delete restrict,
      stale boolean not null default false,
      created_by bigint not null references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_draft_items (
      id uuid primary key,
      draft_id uuid not null references daily_report_drafts(id) on delete restrict,
      source_type text not null check (source_type in ('CASE_EVENT','WORK_RESULT','SITUATION')),
      source_id uuid not null,
      source_version integer not null,
      included boolean not null default true,
      section_code text not null,
      sort_index integer not null default 0,
      edited_text text,
      source_snapshot jsonb not null,
      created_at timestamptz not null default now(),
      unique(draft_id, source_type, source_id)
    )
  `);
  await pool.query(`
    create table if not exists daily_report_exports (
      id uuid primary key,
      draft_id uuid not null references daily_report_drafts(id) on delete restrict,
      revision integer not null,
      report_type text not null,
      signer_snapshot jsonb,
      selection_snapshot jsonb not null,
      sha256 text not null,
      file_name text not null,
      storage_key text not null unique,
      generated_by bigint not null references users(id),
      generated_at timestamptz not null default now(),
      unique(draft_id, revision, sha256)
    )
  `);
  await pool.query(`
    create table if not exists daily_report_legal_versions (
      id uuid primary key,
      title text not null,
      document_number text not null,
      source_uri text not null,
      checksum text not null,
      status text not null default 'DRAFT'
        check (status in ('DRAFT','REVIEWED','PUBLISHED','RETIRED')),
      imported_by bigint not null references users(id),
      reviewed_by bigint references users(id),
      published_by bigint references users(id),
      effective_from date,
      created_at timestamptz not null default now(),
      published_at timestamptz
    )
  `);
  await pool.query(`
    create table if not exists daily_report_legal_articles (
      id uuid primary key,
      version_id uuid not null references daily_report_legal_versions(id) on delete restrict,
      article_code text not null,
      clause_code text not null default '',
      title text not null,
      effective_from date,
      effective_to date,
      business_codes jsonb not null default '[]'::jsonb
    )
  `);
  await pool.query(`
    create table if not exists daily_report_audit (
      id bigserial primary key,
      actor_id bigint references users(id),
      actor_unit_id bigint references teams(id),
      action text not null,
      resource_type text not null,
      resource_id text,
      outcome text not null,
      request_id text,
      safe_metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_outbox (
      id bigserial primary key,
      event_key text not null unique,
      event_type text not null,
      recipient_user_id bigint references users(id) on delete cascade,
      recipient_unit_id bigint references teams(id) on delete cascade,
      resource_type text not null,
      resource_id text,
      safe_payload jsonb not null default '{}'::jsonb,
      delivered_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists daily_report_notification_reads (
      outbox_id bigint not null references daily_report_outbox(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      read_at timestamptz not null default now(),
      primary key(outbox_id,user_id)
    )
  `);
  await pool.query(`
    create index if not exists daily_report_cases_unit_day_state_idx
    on daily_report_cases(unit_id, report_day, current_state)
  `);
  await pool.query(`alter table daily_report_situations add column if not exists version integer not null default 1`);
  await pool.query(`alter table daily_report_situations add column if not exists review_reason text`);
  await pool.query(`alter table daily_report_metrics add column if not exists review_reason text`);
  await pool.query(`create table if not exists daily_report_source_history (
    id bigserial primary key, source_type text not null, source_id uuid not null,
    version integer not null, action text not null, snapshot jsonb not null,
    actor_id bigint not null references users(id), created_at timestamptz not null default now()
  )`);
  await pool.query(`create table if not exists daily_report_statistic_rules (
    id uuid primary key, title text not null, criteria text not null, effective_from date not null,
    approved_by bigint not null references users(id), created_at timestamptz not null default now()
  )`);
  await pool.query(`create table if not exists daily_report_count_records (
    case_id uuid primary key references daily_report_cases(id), report_day date not null,
    rule_id uuid not null references daily_report_statistic_rules(id), reason text not null,
    actor_id bigint not null references users(id), created_at timestamptz not null default now()
  )`);
  await pool.query(`create or replace function daily_report_mark_stale() returns trigger language plpgsql as $$
    declare affected record;
    begin
      for affected in update daily_report_drafts set stale=true,updated_at=now()
        where report_day=NEW.report_day and not stale returning id,created_by,revision loop
        insert into daily_report_outbox
          (event_key,event_type,recipient_user_id,resource_type,resource_id)
        values ('STALE:'||affected.id||':'||affected.revision,'LATE_DATA_CHANGED_DRAFT',
          affected.created_by,'DRAFT',affected.id::text) on conflict (event_key) do nothing;
      end loop;
      return NEW;
    end $$`);
  for (const table of ['daily_report_case_events', 'daily_report_metrics',
    'daily_report_situations', 'daily_report_cases']) {
    await pool.query(`create or replace trigger daily_report_stale_source
      after insert or update on ${table} for each row execute function daily_report_mark_stale()`);
  }
  await pool.query(`
    create index if not exists daily_report_events_case_day_idx
    on daily_report_case_events(case_id, report_day, created_at)
  `);
  await pool.query(`
    create index if not exists daily_report_unlock_active_idx
    on daily_report_unlock_requests(unit_id, report_day, scope_kind, scope_id, expires_at)
  `);
  await ensureExtendedSchema(pool);
  await ensureClassificationSchema(pool);
  await ensureAttachmentSchema(pool);
  await pool.query(`
    insert into modules (module_key, name, description, icon, visible, is_admin_only, is_custom)
    values ('dailyReports', 'Báo cáo ngày', 'Tiếp nhận, rà soát và tổng hợp báo cáo ngày.',
      'file-text', true, false, false)
    on conflict (module_key) do update set
      name = excluded.name, description = excluded.description, icon = excluded.icon,
      visible = excluded.visible, is_admin_only = excluded.is_admin_only
  `);
  // Rename the existing permission without changing any account assignments.
  await pool.query(`update permissions set name='Lịch sử đề nghị'
    where name='Đề nghị mở khóa'
      and module_id=(select id from modules where module_key='dailyReportUnlock')
      and not exists(select 1 from permissions where name='Lịch sử đề nghị')`);
  await pool.query(`update permissions set name='Kiểm tra trùng'
    where name='Kiểm tra trùng liên ngày'
      and module_id=(select id from modules where module_key='dailyReportDuplicates')
      and not exists(select 1 from permissions where name='Kiểm tra trùng')`);
  const dailyReportSubmodules = [
    ['dailyReportInput', 'Nhập báo cáo ngày', 'Ghi nhận vụ việc, tình hình và kết quả công tác.', 'file-plus-2'],
    ['dailyReportRegistry', 'Tra cứu vụ việc', 'Tra cứu hồ sơ, nội dung và tiến độ xử lý.', 'search'],
    ['dailyReportApproval', 'Phê duyệt vụ việc', 'Duyệt, trả lại và yêu cầu bổ sung hồ sơ.', 'badge-check'],
    ['dailyReportLegal', 'Danh mục pháp luật', 'Tra cứu và thẩm định danh mục pháp luật.', 'scale'],
    ['dailyReportReturned', 'Báo cáo bị trả lại', 'Xem, chỉnh sửa và gửi lại báo cáo bị trả lại.', 'corner-up-left'],
    ['dailyReportUpdates', 'Cập nhật / Bổ sung', 'Theo dõi và bổ sung diễn biến cho hồ sơ.', 'file-pen-line'],
    ['dailyReportUnlock', 'Lịch sử đề nghị', 'Theo dõi lịch sử và xử lý đề nghị đã gửi từ Nhập báo cáo ngày.', 'history'],
    ['dailyReportDuplicates', 'Kiểm tra trùng', 'Đối chiếu vụ việc trùng giữa các ngày.', 'copy-check'],
    ['dailyReportComposer', 'Tổng hợp báo cáo', 'Biên tập, tổng hợp và xuất báo cáo ngày.', 'files'],
    ['dailyReportPermissions', 'Phân quyền', 'Phân công vai trò, phạm vi và chỉ tiêu báo cáo.', 'shield-check'],
    ['dailyReportHistory', 'Lịch sử xử lý', 'Xem nhật ký và lịch sử xử lý báo cáo ngày.', 'history']
  ];
  for (const [moduleKey, name, description, icon] of dailyReportSubmodules) {
    await pool.query(`
      insert into modules (
        module_key,
        name,
        description,
        icon,
        visible,
        is_admin_only,
        is_custom,
        parent_module_key
      )
      values ($1, $2, $3, $4, true, false, false, 'dailyReports')
      on conflict (module_key) do update set
        name = excluded.name,
        description = excluded.description,
        icon = excluded.icon,
        visible = excluded.visible,
        is_admin_only = excluded.is_admin_only,
        is_custom = excluded.is_custom,
        parent_module_key = excluded.parent_module_key
    `, [moduleKey, name, description, icon]);
    await pool.query(`
      insert into permissions (module_id, name)
      select id, $2 from modules where module_key = $1
      on conflict (name) do update set module_id = excluded.module_id
    `, [moduleKey, name]);
  }
  await ensureApprovalSplit(pool);
  await pool.query(`
    insert into permissions (module_id, name)
    select id, 'Báo cáo ngày' from modules where module_key = 'dailyReports'
    on conflict (name) do update set module_id = excluded.module_id
  `);
  await ensureIntakeSchema(pool);
  await ensureReferenceCaseSchema(pool);
}
