import { randomUUID } from 'node:crypto';

export function createSupplementPermission({ fail, dateKey, audit }) {
  const purposes = new Set(['CASE_SUPPLEMENT', 'REPORT_SUPPLEMENT']);
  const isSupplement = purpose => purposes.has(purpose);
  async function validate(client, user, purpose, kind, id, day) {
    if (!isSupplement(purpose)) return;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
      fail(422, 'INVALID_SUPPLEMENT_SCOPE', 'Chọn đúng hồ sơ cần bổ sung.');
    }
    const isCase = purpose === 'CASE_SUPPLEMENT';
    if (kind !== (isCase ? 'CASE' : 'WORK_RESULT')) fail(422, 'INVALID_SUPPLEMENT_SCOPE', 'Sai loại hồ sơ.');
    const table = isCase ? 'daily_report_cases' : 'daily_report_metrics';
    const { rows: [item] } = await client.query(`select * from ${table} where id=$1 for update`, [id]);
    if (!item || String(item.unit_id) !== String(user.unitId) || dateKey(item.report_day) !== day) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hồ sơ trong đơn vị và ngày báo cáo.');
    }
    if (isCase && ['DRAFT', 'RETURNED'].includes(item.current_state)) {
      fail(409, 'SUPPLEMENT_NOT_REQUIRED', item.current_state === 'RETURNED'
        ? 'Hồ sơ đã được yêu cầu bổ sung. Mở Báo cáo bị trả lại để cập nhật.' : 'Hồ sơ chưa gửi.');
    }
    const pending = await client.query(`select id from daily_report_unlock_requests
      where purpose=$1 and scope_id=$2 and status='REQUESTED' limit 1`, [purpose, id]);
    if (pending.rowCount) fail(409, 'SUPPLEMENT_PENDING', 'Đã có yêu cầu bổ sung đang chờ Trung tâm duyệt.');
  }
  async function approve(client, req, permission) {
    if (permission.purpose !== 'CASE_SUPPLEMENT') return;
    const { rows: [item] } = await client.query('select * from daily_report_cases where id=$1 for update',
      [permission.scope_id]);
    if (!item || item.current_state === 'DRAFT' || String(item.unit_id) !== String(permission.unit_id)) {
      fail(409, 'CASE_STATE_CONFLICT', 'Hồ sơ không còn phù hợp để duyệt bổ sung.');
    }
    if (item.current_state === 'RETURNED') return;
    const { rows: [submission] } = await client.query(`select * from daily_report_submissions
      where case_id=$1 order by version desc limit 1`, [item.id]);
    if (!submission) fail(409, 'SUBMISSION_REQUIRED', 'Hồ sơ chưa có phiên bản gửi.');
    const returnId = randomUUID();
    await client.query(`insert into daily_report_returns(id,submission_id,reason,requested_fields,actor_id)
      values($1,$2,$3,'[]'::jsonb,$4)`, [returnId, submission.id,
      'Trung tâm duyệt đề nghị bổ sung: ' + permission.reason, req.dailyActor.id]);
    await client.query("update daily_report_submissions set state='RETURNED' where id=$1", [submission.id]);
    await client.query(`update daily_report_cases set current_state='RETURNED',version=version+1,
      updated_at=now() where id=$1`, [item.id]);
    await client.query(`insert into daily_report_outbox
      (event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
      values($1,'CASE_RETURNED',$2,'CASE',$3,$4::jsonb)`,
    [`CASE_RETURNED:${returnId}`, item.unit_id, item.id,
      JSON.stringify({ reason: 'Đề nghị bổ sung đã được duyệt. Cập nhật và gửi lại hồ sơ cho Trung tâm.' })]);
    await audit(client, req, 'CASE_RETURNED', 'CASE', item.id, 'ALLOW', { supplement_permission: permission.id });
  }
  async function assertReportEdit(client, unitId, id, now) {
    const permission = await client.query(`select id from daily_report_unlock_requests
      where purpose='REPORT_SUPPLEMENT' and scope_id=$1 and unit_id=$2 and status='APPROVED'
        and approved_at <= $3 and expires_at > $3 limit 1`, [id, unitId, now]);
    if (!permission.rowCount) {
      fail(423, 'SUPPLEMENT_APPROVAL_REQUIRED', 'Báo cáo đã gửi chỉ được sửa sau khi Trung tâm duyệt yêu cầu bổ sung.');
    }
  }
  return { isSupplement, validate, approve, assertReportEdit };
}
