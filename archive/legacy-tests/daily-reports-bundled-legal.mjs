import { createHash } from 'node:crypto';

export async function runBundledLegalChecks({ ok, call, expect, database, body }) {
  for (const endpoint of ['/legal/bundled', '/legal/bundled/articles',
    '/legal/bundled/source', '/legal/bundled/download']) {
    expect((await call(0, endpoint)).status, 401, `bundled law requires session: ${endpoint}`);
  }
  const versionsBefore = (await ok(2, '/legal/versions')).versions;
  const { version, articles } = await ok(2, '/legal/bundled/articles');
  expect(articles.length, 315, 'unit reporter can look up the complete bundled offence catalogue');
  expect((await ok(2, '/legal/bundled')).version.id, version.id, 'bundle metadata matches article list');
  const filtered = await ok(2, '/legal/bundled/articles?q=' + encodeURIComponent('Điều 173'));
  expect(filtered.articles.map(item => item.title), ['Tội trộm cắp tài sản'], 'API searches article number');
  expect((await ok(2, '/legal/bundled/articles?q=trom%20cap')).articles.length, 1,
    'API supports accent-free Vietnamese lookup');
  expect((await ok(2, '/legal/bundled/articles?q=173&business_code=MA_TUY')).articles.length, 0,
    'API combines keyword and business filter');
  expect((await call(2, '/legal/bundled/articles?business_code=UNKNOWN')).status, 422,
    'API rejects an unknown business category');
  const pdf = await ok(2, '/legal/bundled/source');
  expect(pdf.subarray(0, 4).toString(), '%PDF', 'bundled source opens as a real PDF');
  expect(createHash('sha256').update(pdf).digest('hex'), version.source_sha256,
    'downloaded source exactly matches the original government PDF');
  expect((await ok(2, '/legal/bundled/download')).articles.length, 315,
    'full JSON download is not limited by current lookup filters');
  expect((await ok(2, '/legal/versions')).versions, versionsBefore,
    'reference lookup leaves the existing reviewed catalogue unchanged');
  expect((await ok(2, '/legal/articles')).articles.length, 0,
    'reference bundle does not silently become approved case law');
  expect((await call(2, '/cases', { ...body, legal_article_id: filtered.articles[0].id })).status, 422,
    'case submission cannot bypass legal review using a reference entry ID');
  const count = await database.query('select count(*)::int as count from daily_report_legal_versions');
  expect(count.rows[0].count, 0, 'bundled lookup does not insert test or unreviewed versions into the database');
}
