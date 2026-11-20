import { classificationCodes } from './classifications.js';
import { addDomainTotals } from './intake/statistics.js';
const normalized = value => String(value || '').toLocaleLowerCase('vi').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function duplicateCandidates(client, source, actor) {
  const roles = actor?.roles?.filter(role => role.role_code === 'PV01_COMPILER') || [];
  const global = roles.some(role => role.unit_id === null);
  const units = [...new Set([Number(source.unit_id), ...roles.map(role => Number(role.unit_id)).filter(Boolean)])];
  const { rows } = await client.query(`select c.*,
    coalesce((select jsonb_agg(jsonb_build_object('number',e.decision_number,'authority',e.decision_authority))
      from daily_report_case_events e where e.case_id=c.id and e.decision_number is not null),'[]') as decisions,
    coalesce((select jsonb_agg(distinct e.report_day) from daily_report_case_events e
      where e.case_id=c.id),'[]') as previous_report_days,
    coalesce((select jsonb_agg(distinct x.id) from daily_report_exports x,
      jsonb_array_elements(x.selection_snapshot) item
      where item->'source_snapshot'->>'case_id'=c.id::text),'[]') as previous_export_ids
    from daily_report_cases c where ($4::boolean or c.unit_id=any($5::bigint[]))
      and c.report_day <= $2 and c.id<>$3 and $1::bigint is not null
      and c.duplicate_state not in ('DUPLICATE_NO_RECOUNT','APPEND_EVENT_TO_EXISTING')
      and not exists(select 1 from daily_report_duplicate_decisions d
        where d.case_id=$3 and d.candidate_case_id=c.id)
    order by c.report_day desc`, [source.unit_id, source.report_day, source.id, global, units]);
  const { rows: decisions } = await client.query(`select decision_number,decision_authority
    from daily_report_case_events where case_id=$1 and decision_number is not null`, [source.id]);
  return rows.map(candidate => {
    const reasons = [];
    const matchingFields = [];
    let score = 0;
    const match = (field, reason, weight) => {
      matchingFields.push(field);
      reasons.push(reason);
      score += weight;
    };
    if (source.external_reference && normalized(source.external_reference) === normalized(candidate.external_reference)) {
      match('external_reference', 'Cùng số hồ sơ nguồn', 100);
    }
    if (decisions.some(decision => decision.decision_authority && candidate.decisions.some(other =>
      normalized(other.number) === normalized(decision.decision_number)
      && normalized(other.authority) === normalized(decision.decision_authority)))) {
      match('decisions', 'Cùng số quyết định và cơ quan ban hành', 90);
    }
    if (classificationCodes(source).some(code => classificationCodes(candidate).includes(code))
      && source.category_code === candidate.category_code) {
      match('business_code,category_code', 'Cùng hệ nghiệp vụ và loại vụ việc', 15);
    }
    if (source.location_general && normalized(source.location_general) === normalized(candidate.location_general)) {
      match('location_general', 'Địa điểm giống nhau', 20);
    }
    if (normalized(source.summary) === normalized(candidate.summary)) match('summary', 'Nội dung giống nhau', 50);
    if (source.occurred_at && candidate.occurred_at
      && Math.abs(new Date(source.occurred_at) - new Date(candidate.occurred_at)) <= 86400000) {
      match('occurred_at', 'Thời điểm cách nhau không quá 24 giờ', 10);
    }
    if ((source.persons || []).some(person => (candidate.persons || []).some(other =>
      normalized(person.name) === normalized(other.name)
      && (!(person.identity_number || person.reference)
        || (person.identity_number || person.reference) === (other.identity_number || other.reference))))) {
      match('persons', 'Thông tin đối tượng gần giống; không đủ căn cứ nếu đứng riêng', 10);
    }
    return { id: candidate.id, stable_code: candidate.stable_code, report_day: candidate.report_day,
      summary: candidate.summary, current_state: candidate.current_state, score, reasons,
      matching_fields: matchingFields, previous_report_days: candidate.previous_report_days,
      previous_export_ids: candidate.previous_export_ids, detection_version: 'evidence-v1',
      important: score >= 80 };
  }).filter(candidate => candidate.score >= 15).sort((first, second) => second.score - first.score).slice(0, 50);
}

export async function maintainNotifications(pool, now) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`update daily_report_unlock_requests set expired_notified_at=$1
      where status='APPROVED' and expires_at <= $1 and expired_notified_at is null returning *`, [now]);
    for (const item of rows) {
      await client.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id)
        values ($1,'UNLOCK_EXPIRED',$2,'UNLOCK_REQUEST',$3) on conflict(event_key) do nothing`,
      [`EXPIRED:${item.id}`, item.unit_id, item.id]);
      await client.query(`insert into daily_report_audit
        (actor_id,actor_unit_id,action,resource_type,resource_id,outcome,safe_metadata)
        values (null,$1,'UNLOCK_EXPIRED','UNLOCK_REQUEST',$2,'ALLOW',$3::jsonb)`,
      [item.unit_id, item.id, JSON.stringify({ expires_at: item.expires_at })]);
    }
    // The internal notification feed is the durable consumer. Delivery is idempotent;
    // failed transactions are retried by the next maintenance tick or feed request.
    await client.query(`update daily_report_outbox set delivered_at=$1 where delivered_at is null`, [now]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export function selectionStatistics(items) {
  const cases = new Set();
  const countedCases = new Set();
  const metrics = Object.create(null);
  const metricsByDomain = Object.create(null);
  let situations = 0;
  const watermark = [];
  for (const item of items.filter(value => value.included)) {
    const source = item.source_snapshot;
    watermark.push({ type: item.source_type, id: item.source_id, version: item.source_version });
    if (item.source_type === 'CASE_EVENT') {
      cases.add(source.case_id);
      if (source.counted_as_pphs && source.counted_day === source.report_day) countedCases.add(source.case_id);
    }
    if (item.source_type === 'SITUATION') situations += 1;
    if (item.source_type === 'WORK_RESULT') {
      addDomainTotals(metricsByDomain, source);
      const key = `${source.metric_code}:v${source.metric_version}`;
      metrics[key] ||= Object.create(null);
      for (const [field, value] of Object.entries(source.metric_values)) {
        metrics[key][field] = (metrics[key][field] || 0) + value;
      }
    }
  }
  return { selected_cases: cases.size, pphs_first_count: countedCases.size,
    selected_situations: situations, metrics, metrics_by_domain: metricsByDomain, watermark };
}
