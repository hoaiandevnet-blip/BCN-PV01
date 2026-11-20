import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

export async function runFormattingBrowser({ page, base, checks }) {
  const output = 'outputs/bcn-document-alignment-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const partSelect = page.locator('#bcnFormatPart');
  const alignmentButton = alignment => page.locator(`[data-format-align="${alignment}"]`);
  const part = key => page.locator(`#bcnPaperStack [data-format-part="${key}"]`).first();
  const waitAlignment = (key, alignment) => page.waitForFunction(({ key, alignment }) => {
    const nodes = [...document.querySelectorAll(`#bcnPaperStack [data-format-part="${key}"]`)];
    return nodes.length && nodes.every(node => getComputedStyle(node).textAlign === alignment);
  }, { key, alignment });
  const apply = async (key, alignment) => {
    await partSelect.selectOption(key);
    await alignmentButton(alignment).click();
    await waitAlignment(key, alignment);
  };
  const endpoint = '/api/bao-cao-ngay';
  const dismissPopups = async () => {
    for (let count = 0; count < 8; count += 1) {
      const close = page.locator('.notification-popup-close:visible').first();
      if (!await close.isVisible()) break;
      try {
        await close.click({ timeout: 1500 });
      } catch (error) {
        if (await close.isVisible()) throw error;
      }
    }
  };
  try {
    await waitAlignment('audience', 'left');
    await part('audience').click();
    assert.equal(await partSelect.inputValue(), 'audience');
    await alignmentButton('center').click();
    await waitAlignment('audience', 'center');
    await apply('subtitle', 'left');
    await page.locator('[data-format-default]').click();
    await waitAlignment('subtitle', 'center');
    await apply('subtitle', 'left');
    await apply('body', 'right');
    await apply('heading', 'left');
    await apply('recipients', 'right');
    await apply('signature', 'left');
    checks.push('preview click selects region; alignment and restore-to-template controls update actual paragraphs');

    const day = await page.locator('#bcnComposeDay').inputValue();
    const leaderResponse = await page.request.post(`${base}${endpoint}/leaders`, { data: {
      full_name: 'Người ký kiểm thử căn chỉnh', title: 'Trưởng phòng', signer_scope: 'PV01', effective_from: day
    } });
    assert.equal(leaderResponse.status(), 201, await leaderResponse.text());
    const leader = (await leaderResponse.json()).leader;
    const draftResponse = page.waitForResponse(response => response.url().endsWith(`${endpoint}/drafts`)
      && response.request().method() === 'POST');
    await page.locator('#bcnDraftNew').click();
    const draft = (await (await draftResponse).json()).draft;
    const saveResponse = page.waitForResponse(response => response.url().includes(`/drafts/${draft.id}/items`)
      && response.request().method() === 'PUT');
    await page.locator('#bcnDraftSave').click();
    const saved = await saveResponse;
    assert.equal(saved.status(), 200, await saved.text());
    const savedAlignment = (await saved.json()).draft.document_fields.alignment;
    assert.deepEqual(savedAlignment, { title: 'center', subtitle: 'left', audience: 'center', heading: 'left',
      body: 'right', recipients: 'right', signature: 'left' });

    await page.reload();
    await page.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
    await page.locator('#dailyReportNavToggle').click();
    await page.locator('[data-bcn-view="composer"]').click();
    await page.locator('#bcnComposeLoad').click();
    await page.locator(`#bcnDraftList option[value="${draft.id}"]`).waitFor({ state: 'attached' });
    await page.locator('#bcnDraftList').selectOption(draft.id);
    await page.locator('#bcnDraftOpen').click();
    for (const [key, alignment] of Object.entries(savedAlignment)) await waitAlignment(key, alignment);
    await page.locator(`#bcnSigner option[value="${leader.id}"]`).waitFor({ state: 'attached' });
    await page.locator('#bcnSigner').selectOption(leader.id);
    await page.waitForFunction(name => document.querySelector('#bcnPaperStack').textContent.includes(name),
      leader.full_name);
    checks.push('alignment survives save, full page reload and reopening the actual saved draft');

    await part('audience').press('Enter');
    assert.equal(await partSelect.inputValue(), 'audience');
    assert.equal(await alignmentButton('center').evaluate(element => document.activeElement === element), true);
    await page.locator('#bcnPaperViewport').evaluate(element => { element.scrollTop = 0; });
    await page.locator('.bcn-composer-columns').scrollIntoViewIfNeeded();
    await dismissPopups();
    await page.screenshot({ path: `${output}/desktop.png` });
    const exportResponse = page.waitForResponse(response => response.url().endsWith(`/drafts/${draft.id}/exports`)
      && response.request().method() === 'POST');
    await page.locator('#bcnExport').click();
    const exportedResponse = await exportResponse;
    assert.equal(exportedResponse.status(), 201, await exportedResponse.text());
    const exported = (await exportedResponse.json()).export;
    assert.deepEqual(exported.document_snapshot.alignment, savedAlignment);
    const download = await page.request.get(`${base}${endpoint}/exports/${exported.id}/download`);
    assert.equal(download.status(), 200);
    const buffer = await download.body();
    await writeFile(`${output}/aligned-report.docx`, buffer);
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string');
    const paragraphs = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/gu)].map(match => match[0]);
    const audience = await page.locator('[data-document="audience"]').inputValue();
    assert.ok(paragraphs.find(value => value.includes(audience)).includes('<w:jc w:val="center"/>'));
    assert.ok(paragraphs.find(value => value.includes('Tình hình, kết quả công tác Công an'))
      .includes('<w:jc w:val="left"/>'));
    checks.push('real Word download contains the saved alignment and immutable export metadata');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#bcnDocumentFormatting').scrollIntoViewIfNeeded();
    await apply('audience', 'right');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    assert.ok(await page.locator('#bcnDocumentFormatting').evaluate(element =>
      element.scrollWidth <= element.clientWidth + 1));
    await dismissPopups();
    await page.screenshot({ path: `${output}/mobile.png` });
    checks.push('alignment toolbar works by keyboard and fits 390px mobile without overflow');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#bcnReportType').selectOption('BANTIN_24H');
    await waitAlignment('audience', 'left');
    await page.waitForFunction(() => document.querySelector('#bcnFormatPart option[value="signature"]').disabled);
    await apply('subtitle', 'right');
    await page.locator('#bcnReportType').selectOption('BCN_PV01');
    await waitAlignment('subtitle', 'center');
    assert.equal(await partSelect.locator('option[value="signature"]').isDisabled(), false);
    checks.push('switching templates restores defaults and only offers available regions for the bulletin');
    await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
      checks: checks.slice(start) }, null, 2));
  } catch (error) {
    console.error('Alignment controls on failure:', await page.evaluate(() => ({
      type: document.querySelector('#bcnReportType').value,
      controls: document.querySelector('#bcnDocumentFormatting').innerHTML
    })));
    await page.screenshot({ path: `${output}/failure.png` });
    throw error;
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}
