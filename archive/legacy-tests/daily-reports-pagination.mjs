import { randomUUID } from 'node:crypto';

export async function runPaginationChecks({ database, ok, expect }) {
  const unit = 11;
  const day = '2026-10-20';
  const cases = Array.from({ length: 1005 }, (_, index) => ({ id: randomUUID(),
    code: `QA-PAGE-${index}`, summary: `Dữ liệu giả phân trang ${index}`, event: randomUUID() }));
  const client = await database.connect();
  try {
    await client.query('begin');
    for (const item of cases) {
      await client.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,created_by)
        values($1,$2,$3,'PPHS','QA-PAGE',$4,$5,'VERIFIED',3)`, [item.id, item.code, unit, day, item.summary]);
      await client.query(`insert into daily_report_case_events
        (id,case_id,report_day,event_kind,narrative,state,source_user_id)
        values($1,$2,$3,'INITIAL_REPORT',$4,'VERIFIED',3)`, [item.event, item.id, day, item.summary]);
    }
    await client.query('commit');
  } finally {
    client.release();
  }
  const first = await ok(4, `/cases?unit_id=${unit}&report_day=${day}`);
  const second = await ok(4, `/cases?unit_id=${unit}&report_day=${day}&offset=${first.next_offset}`);
  const third = await ok(4, `/cases?unit_id=${unit}&report_day=${day}&offset=${second.next_offset}`);
  expect([first.cases.length, second.cases.length, third.cases.length], [500, 500, 5],
    'case registry exposes all 1005 records through pagination');
  expect(new Set([...first.cases, ...second.cases, ...third.cases].map(item => item.id)).size, 1005,
    'stable registry pagination does not duplicate records');
  const pageOne = await ok(4, `/composer/items?unit_id=${unit}&report_day=${day}`);
  const pageTwo = await ok(4, `/composer/items?unit_id=${unit}&report_day=${day}&offset=${pageOne.next_offset}`);
  expect([pageOne.items.length, pageTwo.items.length, pageTwo.next_offset], [1000, 5, null],
    'composer can retrieve sources beyond the first 1000');
  expect((await ok(6, `/composer/items?report_day=${day}`)).items.length, 0,
    'pagination never expands a scoped compiler to another unit');
}
