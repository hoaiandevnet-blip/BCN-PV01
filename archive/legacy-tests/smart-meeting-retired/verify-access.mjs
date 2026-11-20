import assert from 'node:assert/strict';

const baseUrl = process.env.MEETING_TEST_URL || 'http://localhost:3101';
const checks = [
  ['/api/smart-meetings/nq57', 401],
  ['/api/smart-meetings/nq57/documents/report/download', 401],
  ['/server/.meeting-data/nq57/originals/report.docx', 404],
  ['/server/%2emeeting-data/nq57/originals/report.docx', 404],
  ['/SERVER/.MEETING-DATA/nq57/originals/report.docx', 404],
  ['/server/meeting-data/nq57/originals/report.docx', 404],
  ['/server/.meeting-data/nq57/blocks/report-001.json', 404],
  ['/server/.meeting-data/nq57/review/tablet-portrait.jpg', 404]
];
for (const [pathname, expected] of checks) {
  const response = await fetch(baseUrl + pathname, { redirect: 'manual' });
  assert.equal(response.status, expected, pathname);
  if (expected === 401) {
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  await response.body?.cancel();
  console.log('PASS ' + response.status + ' ' + pathname);
}
console.log('PASS anonymous access verification at ' + new Date().toISOString());
