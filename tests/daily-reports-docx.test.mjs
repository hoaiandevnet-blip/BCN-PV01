import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { createDailyReportDocument, dailyReportTemplate } from '../server/daily-reports/docx.js';

const reportTypes = ['BANTIN_24H', 'BCN_PV01', 'BCN_BCA', 'BCN_TUUB'];
const signer = { rank_name: 'Cấp bậc giả', full_name: 'Người ký thử nghiệm' };

test('each of four report templates creates a valid DOCX with its own recipient', async () => {
  const outputTexts = new Map();
  for (const reportType of reportTypes) {
    const template = dailyReportTemplate(reportType);
    const document = createDailyReportDocument({
      reportType,
      reportDay: '2026-10-28',
      items: [{ section_code: 'NOI_DUNG', text: 'DỮ LIỆU GIẢ KIỂM THỬ' }],
      signer: reportType === 'BANTIN_24H' ? null : signer
    });
    const buffer = await Packer.toBuffer(document);
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    const archive = await JSZip.loadAsync(buffer);
    const xml = await archive.file('word/document.xml').async('string');
    assert.ok(xml.includes(template.title));
    assert.ok(xml.includes(template.recipient));
    assert.ok(xml.includes('DỮ LIỆU GIẢ KIỂM THỬ'));
    if (template.signature) assert.ok(xml.includes(signer.full_name));
    outputTexts.set(reportType, template.recipient);
  }
  assert.equal(new Set(outputTexts.values()).size, 4);
});

test('signed reports require an explicit signer and bulletin does not', () => {
  for (const reportType of reportTypes.filter(type => type !== 'BANTIN_24H')) {
    assert.throws(() => createDailyReportDocument({ reportType, reportDay: '2026-10-28' }));
  }
  assert.doesNotThrow(() => createDailyReportDocument({
    reportType: 'BANTIN_24H', reportDay: '2026-10-28'
  }));
});
