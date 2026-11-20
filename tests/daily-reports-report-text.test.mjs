import test from 'node:test';
import assert from 'node:assert/strict';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { cleanReportText, reportDisplayPayload } from '../assets/js/daily-reports-report-text.mjs';
import { createDailyReportDocument } from '../server/daily-reports/docx.js';
import { formatDailyNotification } from '../server/daily-reports/notification-format.js';

const code = 'BCN-20261029-4fde4a52';
const marker = '[DỮ LIỆU TEST BCN-FORM-20261029-CB08-2]';
const narrative = 'Xã Bom Bo: Tiếp nhận tin báo giả lập về gói đồ nghi vấn.';

test('removes generated leading labels in all report lines, preserving normal references and wording', () => {
  assert.equal(cleanReportText(`${code} · ${marker} ${narrative}`), narrative);
  assert.equal(cleanReportText(`[TEST] Mâu thuẫn sinh hoạt\n${marker} ${narrative}`),
    `Mâu thuẫn sinh hoạt\n${narrative}`);
  for (const text of ['Quyết định số 123/QĐ', `Đối chiếu hồ sơ ${code}.`, '[TÀI LIỆU] Nội dung',
    '  Nội dung bình thường.\n  Đoạn thứ hai.']) assert.equal(cleanReportText(text), text);
});

test('display payload never changes original data, linkage IDs, person names, hashes or source codes', () => {
  const input = { case: { id: 'id-123', stable_code: code, summary: `${marker} ${narrative}`,
    title: '[TEST] Tên vụ việc', persons: [{ name: '[TEST] Người thử' }] },
  submissions: [{ snapshot: { summary: `${marker} ${narrative}` }, snapshot_sha256: 'hash123' }] };
  const original = structuredClone(input);
  const display = reportDisplayPayload(input);
  assert.equal(display.case.summary, narrative);
  assert.equal(display.submissions[0].snapshot.summary, narrative);
  assert.equal(display.case.stable_code, code);
  assert.equal(display.case.id, 'id-123');
  assert.equal(display.case.persons[0].name, '[TEST] Người thử');
  assert.equal(display.submissions[0].snapshot_sha256, 'hash123');
  assert.deepEqual(input, original);
});

test('notification hides codes and test labels while preserving navigation to the original case', () => {
  const notification = formatDailyNotification({ id: 7, stable_code: code, case_title: `${marker} ${narrative}`,
    case_id: 'case-1', resource_id: 'event-1', resource_type: 'CASE_EVENT', event_type: 'CASE_EVENT_UPDATED',
    report_day: '2026-10-29', unit_name: 'Xã Bom Bo', created_at: '2026-10-29T07:00:00Z' });
  assert.ok(notification.message.includes(narrative));
  assert.doesNotMatch(notification.message, /BCN-|DỮ LIỆU TEST/u);
  assert.equal(notification.dailyReportRef.caseId, 'case-1');
  assert.equal(notification.dailyReportRef.eventId, 'event-1');
});

test('notification dates retain the Vietnamese report day when payloads contain UTC timestamps', () => {
  for (const value of ['2026-11-10', '2026-11-09T17:00:00.000Z', new Date('2026-11-09T17:00:00Z')]) {
    const item = formatDailyNotification({ id: 8, case_id: 'case-2', resource_id: 'case-2',
      resource_type: 'CASE', event_type: 'CASE_SUBMITTED', created_at: '2026-11-10T04:00:00Z',
      report_day: new Date('2026-11-09T17:00:00Z'), safe_payload: { report_day: value } });
    assert.equal(item.dailyReportRef.reportDay, '2026-11-10');
    assert.match(item.message, /Ngày báo cáo 10\/11\/2026/);
  }
});

test('four Word templates remove prefixes from old and new selected report sources', async () => {
  for (const reportType of ['BANTIN_24H', 'BCN_PV01', 'BCN_BCA', 'BCN_TUUB']) {
    const document = createDailyReportDocument({ reportType, reportDay: '2026-10-29',
      signer: { full_name: 'Người ký kiểm thử', title: 'Trưởng phòng' },
      items: [{ section_code: 'NOI_DUNG', business_code: 'PPHS', edited_text: `${code} · ${marker} ${narrative}` }] });
    const archive = await JSZip.loadAsync(await Packer.toBuffer(document));
    const xml = await archive.file('word/document.xml').async('string');
    assert.ok(xml.includes(narrative), reportType);
    assert.ok(!xml.includes(code) && !xml.includes(marker), reportType);
  }
});
