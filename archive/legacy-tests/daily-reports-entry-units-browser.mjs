import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const forms = ['dailyReportCaseForm', 'bcnSituationForm', 'bcnMetricForm', 'dailyReportUnlockForm'];
const output = 'outputs/bcn-entry-units-qa';

export async function verifyAdminEntryUnits({ page, base, checks }) {
  await mkdir(output, { recursive: true });
  await page.waitForFunction(() => document.querySelector('#bcnStatsLoad') !== null);
  await page.locator('[data-bcn-view="input"]').click();
  const { units } = await (await page.request.get(`${base}/api/bao-cao-ngay/units`)).json();
  assert.ok(units.length > 1);
  for (const id of forms) {
    const label = page.locator(`[data-bcn-entry-unit="${id}"]`);
    const select = label.locator('select');
    assert.equal(await label.evaluate(element => element.hidden), false);
    assert.equal(await select.isEnabled(), true);
    assert.deepEqual(await select.locator('option').evaluateAll(options => options.slice(1).map(option => option.value)),
      units.map(unit => String(unit.id)));
    const fixed = page.locator(`[data-bcn-assigned-unit="${id}"]`);
    assert.equal(await fixed.evaluate(element => element.hidden), true);
  }
  const select = page.locator('#dailyReportCaseForm [name="unit_id"]');
  await select.selectOption(String(units[0].id));
  await select.selectOption(String(units.at(-1).id));
  assert.equal(await select.inputValue(), String(units.at(-1).id));
  await page.locator('[data-bcn-entry-unit="dailyReportCaseForm"]').screenshot({ path: `${output}/admin.png` });
  checks.push('only Admin gets all reporting-unit options on case, situation, metric and unlock forms');
}

export async function verifyAssignedEntryUnits({ page, base, checks }) {
  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  assert.equal(scope.isAdmin, false);
  for (const id of forms) {
    const fixed = page.locator(`[data-bcn-assigned-unit="${id}"]`);
    assert.equal(await fixed.evaluate(element => element.hidden), false);
    assert.equal(await fixed.locator('input').inputValue(), scope.unitName);
    assert.equal(await fixed.locator('input').isEditable(), false);
    const label = page.locator(`[data-bcn-entry-unit="${id}"]`);
    assert.equal(await label.evaluate(element => element.hidden), true);
    assert.equal(await label.locator('select').isDisabled(), true);
    assert.deepEqual(await label.locator('option').evaluateAll(options => options.map(option => option.value)),
      [String(scope.unitId)]);
  }
  await page.locator('#dailyReportCaseForm').evaluate(form => form.reset());
  assert.equal(await page.locator('#dailyReportCaseForm [name="unit_name"]').inputValue(), scope.unitName);
  await page.locator('[data-bcn-assigned-unit="dailyReportCaseForm"]')
    .screenshot({ path: `${output}/assigned.png` });
  checks.push('reporter sees the assigned unit locked on all four forms, with no foreign unit options even after reset');
}
