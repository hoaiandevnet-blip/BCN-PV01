import { createHash, randomUUID } from 'node:crypto';
import { sealAttachments } from './attachments.js';
import { caseClassifications } from './classifications.js';
import { validatePersons } from './persons.js';
import { isBeforeCutoff, reportDay, validateCaseStateTransition } from './rules.js';

export function createCaseSubmission(services) {
  const { fail, hasRole, canAccessUnit, reportingScope, dateKey, clock, normalizeDates, cleanText, audit } = services;

  async function assertScope(client, user, item) {
    if (!canAccessUnit(user, item.unit_id)) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
    if (!hasRole(user, 'UNIT_REPORTER', item.unit_id)) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Không đủ quyền cập nhật và gửi hồ sơ.');
    }
    if (item.current_state === 'RETURNED') {
      const activeReturn = await client.query(`select r.id from daily_report_returns r
        join daily_report_submissions s on s.id=r.submission_id
        where s.case_id=$1 and s.state='RETURNED' and r.resubmitted_submission_id is null
          and s.version=(select max(version) from daily_report_submissions where case_id=$1)
        limit 1`, [item.id]);
      if (activeReturn.rowCount) return;
    }
    await reportingScope(user, item.unit_id, dateKey(item.report_day), 'CASE', item.id, clock(), client);
  }

  async function submit(client, req, expected) {
    const locked = await client.query('select * from daily_report_cases where id=$1 for update', [expected.id]);
    if (!locked.rows.length || locked.rows[0].version !== expected.version) {
      fail(409, 'STALE_VERSION', 'Hồ sơ vừa thay đổi, hãy tải lại trước khi xử lý.');
    }
    const item = { ...expected, ...locked.rows[0] };
    const user = req.dailyActor;
    const next = item.current_state === 'RETURNED' ? 'RESUBMITTED'
      : item.current_state === 'DRAFT' ? 'SUBMITTED' : null;
    if (!next) fail(409, 'CASE_STATE_CONFLICT', 'Hồ sơ hiện không ở trạng thái có thể gửi.');
    await assertScope(client, user, item);
    const now = clock();
    if (!item.reference_info && (!item.intake_report || item.persons.length)) {
      validatePersons(item.persons, item.persons.length, fail, reportDay(now));
    }
    validateCaseStateTransition(item.current_state, next);
    const submissionId = randomUUID();
    const snapshot = {
      id: item.id,
      stable_code: item.stable_code,
      business_code: item.business_code,
      classifications: caseClassifications(item),
      title: item.title,
      category_code: item.category_code,
      report_day: item.report_day,
      summary: item.summary,
      location_general: item.location_general,
      location_address: item.location_address,
      external_reference: item.external_reference,
      persons: item.persons,
      legal_article_id: item.legal_article_id,
      legal_reference: item.legal_reference,
      reference_info: item.reference_info,
      version: item.version + 1,
      attachments: await sealAttachments(client, 'cases', item.id)
    };
    const normalized = JSON.stringify(normalizeDates(snapshot));
    const checksum = createHash('sha256').update(normalized).digest('hex');
    const { rows } = await client.query(`insert into daily_report_submissions
      (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,late_flag,created_by)
      values ($1,$2,$3,$4,coalesce((select max(version)+1 from daily_report_submissions where case_id=$2),1),
        $5,$6::jsonb,$7,$8,$9) returning *`,
    [submissionId, item.id, item.unit_id, item.report_day, next, normalized, checksum,
      !isBeforeCutoff(now) || dateKey(item.report_day) !== reportDay(now), user.id]);
    await client.query(`update daily_report_cases set current_state='PENDING_REVIEW',
      version=version+1,updated_at=now() where id=$1`, [item.id]);
    if (item.current_state === 'RETURNED') {
      await client.query(`update daily_report_returns set response=$2,resubmitted_submission_id=$3
        where submission_id=(select id from daily_report_submissions where case_id=$1 and id<>$3
          order by version desc limit 1)`,
      [item.id, cleanText(req.body?.response, 2000, 'Phản hồi'), submissionId]);
    }
    const recipient = await client.query(`select user_id from daily_report_user_roles
      where role_code='PV01_COMPILER' and (unit_id is null or unit_id=$1)
      union select id from users where is_admin and not is_deleted and status='Hoạt động'`, [item.unit_id]);
    for (const row of recipient.rows) {
      await client.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_user_id,resource_type,resource_id,safe_payload)
        values ($1,$2,$3,'CASE',$4,$5::jsonb) on conflict (event_key) do nothing`,
      [`${next}:${submissionId}:${row.user_id}`, next === 'RESUBMITTED' ? 'CASE_RESUBMITTED' : 'CASE_SUBMITTED',
        row.user_id, item.id, JSON.stringify({ stable_code: item.stable_code, report_day: item.report_day })]);
    }
    await audit(client, req, next, 'CASE', item.id, 'ALLOW', { submission_version: rows[0].version });
    return rows[0];
  }

  return { assertScope, submit };
}
