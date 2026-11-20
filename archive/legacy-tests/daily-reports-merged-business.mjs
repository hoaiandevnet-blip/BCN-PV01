import { randomUUID } from 'node:crypto';
import { BUSINESS_CODES } from '../server/daily-reports/rules.js';

export async function runMergedBusinessChecks({ ok, call, expect, database, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const groups = {
    PPHS: ['PPHS', 'KHAC', 'PCCC_CNCH', 'TNGT', 'TTXH'],
    KINH_TE: ['KINH_TE', 'THAM_NHUNG']
  };
  const original = (await ok(2, '/legal/bundled/download')).articles;
  const legacy = [];
  for (const code of BUSINESS_CODES) {
    const id = randomUUID();
    await database.query(`insert into daily_report_cases
      (id,stable_code,unit_id,business_code,category_code,report_day,summary,created_by)
      values($1,$2,10,$3,'QA-MERGE','2026-10-28','QA-MERGE-LEGACY',2)`, [id, `MERGE-${id}`, code]);
    legacy.push({ id, code });
  }
  const before = (await database.query(`select * from daily_report_cases where category_code='QA-MERGE' order by id`)).rows;
  for (const [canonical, members] of Object.entries(groups)) {
    const filtered = (await ok(2, `/cases?business_code=${canonical}&q=QA-MERGE-LEGACY`)).cases;
    expect(filtered.map(item => item.id).sort(), legacy.filter(item => members.includes(item.code))
      .map(item => item.id).sort(), `${canonical} registry contains all merged legacy systems and no unrelated systems`);
    const lookup = (await ok(2, `/legal/bundled/articles?business_code=${canonical}`)).articles;
    const expected = original.filter(article => article.business_codes.some(code => members.includes(code)));
    expect(lookup.map(item => item.article_code), expected.map(item => item.article_code),
      `${canonical} law lookup includes every old group without duplicates`);
    const options = (await ok(2, `/legal/entry-options?effective_on=2026-10-28&business_code=${canonical}`)).articles;
    for (const code of members) {
      const reference = expected.find(article => article.business_codes.includes(code));
      expect(options.some(article => article.article_code === reference.article_code), true,
        `${canonical} entry options retain original ${code} articles`);
      const item = (await ok(2, '/cases', { ...body, business_code: code,
        legal_reference_id: `blhs-135-2025:${reference.article_code}` })).case;
      const detail = (await ok(2, `/cases/${item.id}`)).case;
      expect(detail.business_code, canonical, `${code} input is stored under ${canonical}`);
      expect(detail.legal_reference.article_code, reference.article_code,
        `${code} input retains its selected original law reference`);
    }
  }
  const merged = new Set(Object.values(groups).flat());
  for (const code of BUSINESS_CODES.filter(code => !merged.has(code))) {
    const item = (await ok(2, '/cases', { ...body, business_code: code,
      ...(code === 'TINH_HINH_KHAC' ? { title: 'Tình hình khác giữ riêng' } : {}) })).case;
    expect((await ok(2, `/cases/${item.id}`)).case.business_code, code, `${code} remains unchanged`);
    const filtered = (await ok(2, `/cases?business_code=${code}&q=QA-MERGE-LEGACY`)).cases;
    expect(filtered.map(item => item.id), legacy.filter(item => item.code === code).map(item => item.id),
      `${code} filter remains separate`);
  }
  expect((await database.query(`select * from daily_report_cases where category_code='QA-MERGE' order by id`)).rows,
    before, 'merged lookup never rewrites or deletes historical case rows');
  expect((await ok(2, '/legal/bundled/download')).articles, original,
    'source catalogue, article titles and original classifications remain intact');

  const version = (await ok(1, '/legal/import-drafts', { title: 'Danh mục giả kiểm thử gộp hệ',
    document_number: 'QA-MERGE-LAW', source_uri: 'https://example.invalid/merge', checksum: 'qa-merge',
    effective_from: '2026-01-01', articles: [
      { article_code: 'QA-MERGE-PPHS', title: 'Điều giả trật tự xã hội', business_codes: ['TTXH'] },
      { article_code: 'QA-MERGE-KT', title: 'Điều giả chức vụ', business_codes: ['THAM_NHUNG'] }
    ] })).version;
  await ok(5, `/legal/versions/${version.id}/review`, {});
  await ok(5, `/legal/versions/${version.id}/publish`, {});
  for (const code of ['PPHS', 'KINH_TE']) {
    const articles = (await ok(2, `/legal/articles?version_id=${version.id}&business_code=${code}`)).articles;
    expect(articles.length, 1, `${code} lookup finds approved articles mapped under the legacy code`);
    const entry = (await ok(2, `/legal/entry-options?effective_on=2026-10-28&business_code=${code}`)).articles;
    expect(entry.some(article => article.id === articles[0].id), true, `${code} offers the approved legacy article`);
    const item = (await ok(2, '/cases', { ...body, business_code: code, legal_article_id: articles[0].id })).case;
    expect((await ok(2, `/cases/${item.id}`)).case.legal_article_id, articles[0].id,
      `${code} saves the approved legacy article through the original foreign key`);
    expect((await call(2, '/cases', { ...body, business_code: 'MA_TUY', legal_article_id: articles[0].id })).status,
      422, 'merged article cannot be selected by an unrelated system');
  }
}
