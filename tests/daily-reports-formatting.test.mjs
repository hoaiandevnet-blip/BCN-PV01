import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { normalizeReportAlignment } from '../assets/js/daily-reports-document-format.mjs';
import { validateDocumentFields } from '../server/daily-reports/presentation-routes.js';
import { createDailyReportDocument } from '../server/daily-reports/docx.js';

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code });
};
const paragraphFor = (xml, text) => [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/gu)]
  .map(match => match[0]).find(paragraph => paragraph.includes(text));
const signer = { full_name: 'Người ký kiểm thử căn chỉnh', title: 'Trưởng phòng' };

test('old drafts retain the existing alignment; malformed values cannot become CSS or Word instructions', () => {
  const defaults = normalizeReportAlignment();
  assert.deepEqual(defaults, { title: 'center', subtitle: 'center', audience: 'left', heading: 'justify',
    body: 'justify', recipients: 'left', signature: 'center' });
  assert.deepEqual(normalizeReportAlignment(null), defaults);
  assert.equal(normalizeReportAlignment({ audience: 'position:absolute' }).audience, 'left');
  for (const alignment of [null, [], 'center', { unknown: 'left' }, { audience: 'invalid' }, { title: {} }]) {
    assert.throws(() => validateDocumentFields({ alignment }, fail), { status: 422 });
  }
  assert.deepEqual(validateDocumentFields({ audience: '  Kính gửi  ', alignment: { audience: 'center' } }, fail),
    { audience: 'Kính gửi', alignment: { audience: 'center' } });
});

for (const reportType of ['BANTIN_24H', 'BCN_PV01', 'BCN_BCA', 'BCN_TUUB']) {
  test(`${reportType}: every selectable region has matching DOCX alignment without changing page margins`, async () => {
    const options = { reportType, reportDay: '2026-10-29', signer,
      items: [{ section_code: 'NOI_DUNG', business_code: 'PPHS', text: 'NỘI DUNG KIỂM THỬ CĂN CHỈNH' }],
      documentFields: { audience: 'Kính gửi: Nơi nhận kiểm thử\nDòng thứ hai kiểm thử', recipients: 'Nhận thử;',
        alignment: { title: 'left', subtitle: 'right', audience: 'center', heading: 'right', body: 'center',
          recipients: 'right', signature: 'left' } } };
    const zip = await JSZip.loadAsync(await Packer.toBuffer(createDailyReportDocument(options)));
    const xml = await zip.file('word/document.xml').async('string');
    for (const [text, alignment] of [
      [reportType === 'BANTIN_24H' ? 'BẢN TIN 24H' : 'BÁO CÁO', 'left'], ['29/10/2026', 'right'],
      ['Kính gửi: Nơi nhận kiểm thử', 'center'], ['Dòng thứ hai kiểm thử', 'center'],
      ['NỘI DUNG KIỂM THỬ CĂN CHỈNH', 'center'],
      [reportType === 'BANTIN_24H' ? 'II. PHẠM PHÁP HÌNH SỰ' : '1.1. Tình hình an ninh quốc gia', 'right'],
      ...(reportType === 'BANTIN_24H' ? [] : [['Nhận thử;', 'right'], [signer.full_name, 'left']])
    ]) {
      const paragraph = paragraphFor(xml, text);
      assert.ok(paragraph, text);
      assert.ok(paragraph.includes(`<w:jc w:val="${alignment}"/>`), text);
      assert.doesNotMatch(paragraph, /w:firstLine=/u, text);
    }
    assert.match(xml, /<w:pgSz w:w="11906" w:h="16838"/u);
    assert.ok(xml.includes(`w:left="${reportType === 'BANTIN_24H' ? 1134 : 1701}"`));
  });
}

test('justified body keeps its first-line indentation and Word uses the both alignment value', async () => {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(createDailyReportDocument({
    reportType: 'BCN_PV01', reportDay: '2026-10-29', signer,
    documentFields: { alignment: { body: 'justify' }, conclusion: 'Đoạn kết kiểm thử căn đều' }
  })));
  const xml = await zip.file('word/document.xml').async('string');
  const paragraph = paragraphFor(xml, 'Đoạn kết kiểm thử căn đều');
  assert.match(paragraph, /<w:jc w:val="both"\/>/u);
  assert.match(paragraph, /w:firstLine="720"/u);
});
