export async function runAuditPaginationChecks({ database, ok, call, expect }) {
  await database.query(`insert into daily_report_audit
    (actor_id,actor_unit_id,action,resource_type,resource_id,outcome,created_at)
    select 2,10,case index % 4 when 0 then 'GET:/api/bao-cao-ngay/cases'
      when 1 then 'CASE_UPDATED' when 2 then 'DOCX_EXPORTED' else 'ROLE_ASSIGNED' end,
      'CASE','QA-HISTORY-A-' || lpad(index::text,3,'0'),
      case when index % 7=0 then 'DENY' else 'ALLOW' end,now() - index * interval '1 minute'
    from generate_series(0,304) as index;
    insert into daily_report_audit(actor_id,actor_unit_id,action,resource_type,resource_id,outcome)
    select 3,11,'CASE_UPDATED','CASE','QA-HISTORY-B-' || index,'ALLOW'
    from generate_series(1,12) as index;`);
  const first = await ok(6, '/audit?q=QA-HISTORY-&page_size=50');
  expect([first.pagination.total, first.pagination.total_pages, first.events.length], [305, 7, 50],
    'audit count and page count include all 305 allowed rows, beyond the former 300-row limit');
  expect(first.events.every(item => Number(item.actor_unit_id) === 10), true,
    'scoped compiler receives only permitted unit history');
  expect(first.events[0].actor_username, 'qa-a', 'history resolves account username');
  expect(first.events[0].actor_name, 'Nguyễn Văn An kiểm thử', 'history resolves account display name');
  expect(first.events[0].actor_unit_name, 'Xã thử A', 'history resolves historical actor unit');
  expect('safe_metadata' in first.events[0], false, 'audit response does not expose private audit metadata');
  const snapshot = first.pagination.snapshot;
  await database.query(`insert into daily_report_audit
    (actor_id,actor_unit_id,action,resource_type,resource_id,outcome)
    values(2,10,'CASE_UPDATED','CASE','QA-HISTORY-NEW','ALLOW')`);
  const events = [...first.events];
  for (let page = 2; page <= 7; page += 1) {
    const next = await ok(6, `/audit?q=QA-HISTORY-&page_size=50&page=${page}&snapshot=${snapshot}`);
    expect(next.pagination.total, 305, `audit page ${page} retains the snapshot count`);
    events.push(...next.events);
  }
  expect([events.length, new Set(events.map(item => item.id)).size], [305, 305],
    'numbered audit pages cover every allowed record exactly once while new events arrive');
  const again = await ok(6, `/audit?q=QA-HISTORY-&page_size=50&snapshot=${snapshot}`);
  expect(again.events.map(item => item.id), first.events.map(item => item.id),
    'returning to page one preserves the same snapshot rows');
  const refreshed = await ok(6, '/audit?q=QA-HISTORY-');
  expect([refreshed.pagination.total, refreshed.events[0].resource_id], [306, 'QA-HISTORY-NEW'],
    'refresh starts a new snapshot and includes newly created history');
  expect((await ok(1, '/audit?q=QA-HISTORY-')).pagination.total, 318,
    'system administrator can page the whole history without operational grants');
  expect((await ok(6, '/audit?q=QA-HISTORY-B')).pagination.total, 0,
    'search and totals cannot reveal out-of-scope activity');
  const old = await ok(6, '/audit?q=QA-HISTORY-A-000');
  expect(old.events.map(item => item.resource_id), ['QA-HISTORY-A-000'],
    'server-side search finds an event older than the former 300-row limit');
  expect((await ok(6, '/audit?q=Nguy%E1%BB%85n%20V%C4%83n%20An')).pagination.total >= 306, true,
    'search supports the account display name');
  const denied = await ok(6, '/audit?q=QA-HISTORY-A-&outcome=DENY&page_size=50');
  expect([denied.pagination.total, denied.events.every(item => item.outcome === 'DENY')], [44, true],
    'outcome filter counts and returns denied events across all pages');
  for (const [group, count] of [['lookup', 77], ['update', 76], ['export', 76], ['permissions', 76]]) {
    const result = await ok(6, `/audit?q=QA-HISTORY-A-&group=${group}`);
    expect([result.pagination.total, result.events.every(item => item.action_group === group)], [count, true],
      `action group ${group} is filtered before pagination`);
  }
  const last = await ok(6, `/audit?q=QA-HISTORY-A-&page=999&page_size=50`);
  expect([last.pagination.page, last.events.length], [7, 5], 'out-of-range page is clamped to the last page');
  expect((await ok(6, '/audit?q=%25')).pagination.total, 0, 'literal percent does not become a search wildcard');
  expect((await ok(6, '/audit?q=%27%20OR%201%3D1--')).pagination.total, 0,
    'search payload is parameterized and cannot broaden the history scope');
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page_size=300', 'snapshot=-1',
    'snapshot=9223372036854775808', 'outcome=ALL', 'group=admin', 'q[]=bad']) {
    expect((await call(6, `/audit?${query}`)).status, 422, `invalid audit query is rejected: ${query}`);
  }
  expect((await call(2, '/audit')).status, 403, 'reporter cannot access audit history');
  await database.query(`insert into daily_report_user_roles(user_id,role_code,unit_id) values(5,'AUDITOR',10)`);
  expect((await ok(5, '/audit?q=QA-HISTORY-')).pagination.total, 306,
    'a scoped auditor uses the same history boundary as a scoped compiler');
  const foreign = (await database.query(`select id,stable_code from daily_report_cases
    where unit_id=11 and stable_code='QA-PAGE-999'`)).rows[0];
  await database.query(`insert into daily_report_audit
    (actor_id,actor_unit_id,action,resource_type,resource_id,outcome)
    values(2,10,'CASE_UPDATED','CASE',$1,'ALLOW')`, [foreign.id]);
  expect((await ok(6, `/audit?q=${foreign.stable_code}`)).pagination.total, 0,
    'display-name enrichment cannot reveal a case code from an out-of-scope unit');
  expect((await ok(1, `/audit?q=${foreign.stable_code}`)).events[0].case_code, foreign.stable_code,
    'administrator can search an allowed case by its business code');
}
