import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { Document, Packer, Paragraph } from 'docx';
import { attachmentPdf } from './daily-reports-attachments.mjs';

const output = 'outputs/bcn-attachments-qa';
const pdfFile = { name: 'Báo cáo đơn vị.pdf', mimeType: 'application/pdf', buffer: attachmentPdf };

export async function prepareAttachmentEntry({ page, checks }) {
  await mkdir(output, { recursive: true });
  const form = page.locator('#dailyReportCaseForm');
  const input = form.locator('.bcn-attachment-picker input');
  const word = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Văn bản QA giả')] }] }));
  await input.setInputFiles([pdfFile,
    { name: 'Quyết định.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: word }]);
  await form.locator('.bcn-attachment-queue li').nth(1).waitFor();
  assert.equal(await form.locator('.bcn-attachment-queue li').count(), 2);
  await input.setInputFiles([{ ...pdfFile, name: 'Tệp chọn nhầm.pdf' }]);
  await form.getByRole('button', { name: 'Bỏ tệp Tệp chọn nhầm.pdf' }).click();
  assert.equal(await form.locator('.bcn-attachment-queue li').count(), 2);
  checks.push('entry supports multiple PDF/Word attachments and removing an accidental selection');
  for (let count = 0; count < 20; count += 1) {
    const close = page.locator('.notification-popup-close:visible:enabled').first();
    if (!await close.isVisible()) break;
    try {
      await close.click({ timeout: 1000 });
    } catch (error) {
      if (!error.message.includes('Timeout')) throw error;
      break;
    }
  }
  await form.locator('.bcn-attachment-picker').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/entry-desktop.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await form.locator('.bcn-attachment-picker').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/entry-mobile.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.setViewportSize(viewport);
  checks.push('attachment picker and file names fit mobile without horizontal overflow');
}

export async function verifyCaseAttachments({ page, base, caseId, checks }) {
  await page.locator('#bcnDetail').waitFor({ state: 'hidden' });
  await page.locator(`[data-detail="${caseId}"]`).click();
  const section = page.locator('#bcnCaseAttachments');
  await section.locator('[data-attachment-id]').nth(1).waitFor();
  assert.equal(await section.locator('[data-attachment-id]').count(), 2);
  const pdf = section.locator('[data-attachment-id]').filter({ hasText: 'Báo cáo đơn vị.pdf' });
  const [download] = await Promise.all([
    page.waitForEvent('download'), pdf.getByRole('link', { name: 'Tải về' }).click()
  ]);
  assert.equal(download.suggestedFilename(), 'Báo cáo đơn vị.pdf');
  assert.ok((await readFile(await download.path())).equals(attachmentPdf));
  const link = await pdf.getByRole('link', { name: 'Xem Báo cáo đơn vị.pdf' }).getAttribute('href');
  const preview = await page.request.get(base + link);
  assert.equal(preview.headers()['content-type'], 'application/pdf');
  assert.match(preview.headers()['content-disposition'], /^inline;/);
  assert.equal(preview.headers()['x-content-type-options'], 'nosniff');
  checks.push('saved file list restores names; download retains Vietnamese filename and exact original bytes');
  checks.push('PDF preview is authenticated, uses correct MIME, and blocks MIME sniffing');
  const extra = 'Văn bản bổ sung tại bản nháp.pdf';
  await section.locator('input[type="file"]').setInputFiles([{ ...pdfFile, name: extra }]);
  await section.getByRole('button', { name: 'Lưu văn bản bổ sung' }).click();
  await section.locator('[data-attachment-id]').filter({ hasText: extra }).waitFor();
  assert.equal(await section.locator('[data-attachment-id]').count(), 3);
  await section.locator('[data-attachment-id]').filter({ hasText: extra })
    .getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.locator('.bcn-action-dialog[open]').getByRole('button', { name: 'Xóa văn bản', exact: true }).click();
  await section.locator('[data-attachment-id]').filter({ hasText: extra }).waitFor({ state: 'hidden' });
  await section.locator('[data-attachment-id]').nth(1).waitFor();
  assert.equal(await section.locator('[data-attachment-id]').count(), 2);
  checks.push('reporter can add and delete a saved draft attachment through actual UI');
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/case-files-desktop.png` });
  await page.locator('#bcnDetail [data-case-close]').click();
}

export async function verifySealedAttachments({ page, caseId, checks }) {
  await page.locator(`[data-detail="${caseId}"]`).click();
  const section = page.locator('#bcnCaseAttachments');
  await section.locator('[data-attachment-id]').nth(1).waitFor();
  assert.equal(await section.locator('[data-delete-attachment]').count(), 0);
  assert.equal(await section.locator('input[type="file"]').count(), 0);
  assert.match(await section.innerText(), /Đã gửi · lưu đối chiếu/);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/submitted-files.png` });
  await page.locator('#bcnDetail [data-case-close]').click();
  checks.push('submitted file UI keeps download available and removes edit/delete controls');
}

export async function verifySourceAttachments({ page, adminPage, base, unitId, reporterId, checks }) {
  const api = '/api/bao-cao-ngay';
  async function call(context, path, body, method = 'post') {
    const response = await context.request[method](base + api + path, { data: body });
    const result = await response.json();
    assert.ok(response.ok(), `${path}: ${response.status()} ${JSON.stringify(result)}`);
    return result;
  }
  const scope = await (await page.request.get(base + api + '/scope')).json();
  const definition = (await call(adminPage, '/configuration/metrics', { code: 'GENERAL',
    label: 'Kết quả thử đính kèm', owner_groups: ['PHONG'], effective_from: scope.reportDay,
    fields: [{ code: 'activities', label: 'Số lượt công tác' }] })).definition;
  await call(adminPage, `/configuration/metrics/${definition.id}/publish`, {});
  await call(adminPage, '/user-roles', { user_id: reporterId, unit_id: unitId,
    role_code: 'UNIT_REPORTER', metric_code: 'GENERAL' }, 'put');
  await page.reload();
  await page.locator('#dailyReportNavToggle').click();
  await page.locator('[data-bcn-view="input"]').click();
  await page.locator('#bcnEntryClassifications[data-legal-state="ready"]').waitFor();
  for (const [resource, formId, kind, key] of [
    ['situations', 'bcnSituationForm', 'SITUATION', 'situation'],
    ['work-results', 'bcnMetricForm', 'WORK_RESULT', 'metric']
  ]) {
    if (resource === 'situations') {
      await page.locator('[data-classification-petition]').click();
      await page.locator('#bcnSituationForm [name="categories"]').selectOption(['DINH_CONG']);
      await page.locator('#bcnSituationForm [name="narrative"]').fill('Tình hình kèm văn bản kiểm thử');
    } else {
      await page.locator('[data-entry-mode="metric"]').click();
      await page.locator('#bcnMetricGroup').selectOption('GENERAL');
      await page.locator('#bcnMetricForm [name="value_activities"]').fill('2');
    }
    const form = page.locator('#' + formId);
    await form.locator('[name="report_day"]').fill(scope.reportDay);
    await form.locator('input[type="file"]').setInputFiles(pdfFile);
    const submit = async () => {
      const [response] = await Promise.all([
        page.waitForResponse(value => value.url().endsWith('/' + resource) && value.request().method() === 'POST'),
        form.locator('button.primary').click()
      ]);
      return response;
    };
    let response = await submit();
    if (response.status() === 423) {
      assert.equal(await form.locator('.bcn-attachment-queue li').count(), 1);
      const id = await form.getAttribute('data-source-id');
      const unlock = await call(page, '/unlock-requests', { report_day: scope.reportDay,
        scope: { kind, id }, reason: 'Bổ sung văn bản kiểm thử nguồn' });
      await call(adminPage, `/unlock-requests/${unlock.id}/decide`, { decision: 'APPROVED', reason: 'Duyệt thử' });
      response = await submit();
    }
    assert.equal(response.status(), 201);
    const source = (await response.json())[key];
    const row = page.locator(`[data-source-id="${source.id}"]`);
    await row.getByRole('button', { name: 'Văn bản đính kèm' }).click();
    const dialog = page.locator('dialog[open]').filter({ hasText: 'Văn bản đính kèm' });
    await dialog.getByText(pdfFile.name, { exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-attachment-id]').count(), 1);
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) >= 2) {
      console.error('Attachment dialog layout', await dialog.evaluate(element => {
        const style = getComputedStyle(element);
        return { rect: element.getBoundingClientRect().toJSON(), margin: style.margin,
          inset: style.inset, position: style.position, width: style.width, transform: style.transform };
      }));
      await page.screenshot({ path: `${output}/dialog-layout-failure.png` });
    }
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 2, 'document dialog is centered');
    await page.screenshot({ path: `${output}/${resource}-files.png` });
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    checks.push(`${resource} form saves an attached file, retains it across cutoff, and opens it from source list`);
  }
}
