import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runHistoryBrowser({ page, database, userId, checks }) {
  const output = 'outputs/bcn-history-pagination-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  await database.query(`insert into daily_report_audit
    (actor_id,actor_unit_id,action,resource_type,resource_id,outcome,created_at)
    select $1,(select team_id from users where id=$1),
      case index % 4 when 0 then 'GET:/api/bao-cao-ngay/cases' when 1 then 'CASE_UPDATED'
        when 2 then 'DOCX_EXPORTED' else 'ROLE_ASSIGNED' end,
      'CASE','QA-HISTORY-UI-' || lpad(index::text,3,'0'),
      case when index % 5=0 then 'DENY' else 'ALLOW' end,now() - (138-index) * interval '1 minute'
    from generate_series(1,137) as index`, [userId]);
  await page.locator('[data-bcn-view="history"]').click();
  const card = page.locator('#bcnAuditCard');
  const search = page.locator('#bcnAuditSearch');
  const rows = page.locator('#bcnAuditRows article');
  const waitFor = async (count, active = 1) => {
    await page.waitForFunction(({ count, active }) => {
      const card = document.querySelector('#bcnAuditCard');
      return card.getAttribute('aria-busy') === 'false'
        && card.querySelector('#bcnAuditCount').textContent.includes(`/ ${count} hoạt động`)
        && card.querySelector('[aria-current="page"]')?.dataset.auditPage === String(active);
    }, { count, active });
  };
  await search.fill('QA-HISTORY-UI-');
  await waitFor(137);
  assert.equal(await rows.count(), 10);
  assert.equal(await card.getByRole('button', { name: 'Trang trước', exact: true }).isDisabled(), true);
  const first = await rows.evaluateAll(elements => elements.map(element => element.dataset.auditId));
  await card.getByRole('button', { name: 'Trang 2', exact: true }).click();
  await waitFor(137, 2);
  const second = await rows.evaluateAll(elements => elements.map(element => element.dataset.auditId));
  assert.equal(second.some(id => first.includes(id)), false);
  await card.getByRole('button', { name: 'Trang 14', exact: true }).click();
  await waitFor(137, 14);
  assert.equal(await rows.count(), 7);
  assert.equal(await card.getByRole('button', { name: 'Trang sau', exact: true }).isDisabled(), true);
  checks.push('history numbered pages move through 137 records without duplicates; first and last boundaries work');

  await page.locator('#bcnAuditPageSize').selectOption('20');
  await waitFor(137);
  assert.equal(await rows.count(), 20);
  await page.locator('#bcnAuditGroup').selectOption('permissions');
  await waitFor(34);
  assert.equal(await rows.count(), 20);
  await page.locator('#bcnAuditOutcome').selectOption('DENY');
  await waitFor(7);
  assert.equal(await rows.count(), 7);
  assert.equal(await rows.locator('.is-denied').count(), 7);
  assert.ok((await rows.allTextContents()).every(text => text.includes('Cấp vai trò')));
  checks.push('history page size and combined action/outcome filters query the full dataset and reset to page one');

  await search.fill('QA-HISTORY-UI-001');
  await waitFor(0);
  assert.equal(await page.locator('.bcn-audit-empty').isVisible(), true);
  await page.locator('#bcnAuditClear').click();
  await page.waitForFunction(() => document.querySelector('#bcnAuditCard').getAttribute('aria-busy') === 'false');
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('#bcnAuditOutcome').inputValue(), '');
  assert.equal(await page.locator('#bcnAuditGroup').inputValue(), '');
  await search.fill('QA-HISTORY-UI-001');
  await waitFor(1);
  assert.match(await rows.innerText(), /QA-HISTORY-UI-001/);
  checks.push('empty state and clearing filters work; search finds old history outside the first page');

  // Fail the network request, not the API status, to verify retry without changing application data.
  const route = '**/api/bao-cao-ngay/audit?*';
  await page.route(route, handler => handler.abort('failed'));
  await page.locator('#bcnAuditLoad').click();
  await page.locator('#bcnAuditRows').getByText('Chưa tải được lịch sử', { exact: true }).waitFor();
  assert.equal(await page.locator('#bcnAuditPagination button').count(), 0);
  await page.unroute(route);
  await page.locator('#bcnAuditLoad').click();
  await waitFor(1);
  checks.push('history network failure clears stale rows and pagination; refresh retries successfully');
  const close = page.locator('.notification-popup-close:visible').first();
  if (await close.isVisible()) await close.click();

  await page.locator('#bcnAuditPageSize').selectOption('10');
  await waitFor(1);
  await search.fill('QA-HISTORY-UI-');
  await waitFor(137);
  const layout = [];
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await card.evaluate(element => element.scrollIntoView({ block: 'start' }));
    const bounds = await card.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const clipped = [...element.querySelectorAll('input,select,button,article,nav')].filter(child => {
        const box = child.getBoundingClientRect();
        return box.left < rect.left - 1 || box.right > rect.right + 1;
      }).map(child => child.id || child.tagName);
      return { width: innerWidth, clipped, documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert.deepEqual(bounds.clipped, []);
    assert.equal(bounds.documentOverflow, false);
    layout.push(bounds);
    await page.screenshot({ path: `${output}/history-${width}.png`, animations: 'disabled' });
    await page.locator('#bcnAuditPagination').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/pagination-${width}.png`, animations: 'disabled' });
    if (width === 390) {
      await card.getByRole('button', { name: 'Trang sau', exact: true }).click();
      await waitFor(137, 2);
      await card.getByRole('button', { name: 'Trang 14', exact: true }).click();
      await waitFor(137, 14);
      await card.getByRole('button', { name: 'Trang 1', exact: true }).click();
      await waitFor(137);
    }
  }
  checks.push('history filters, rows and numbered pagination fit desktop, tablet and phone without horizontal overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded') !== 'true') {
    await page.locator('#dailyReportNavToggle').click();
  }
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start), layout }, null, 2));
}
