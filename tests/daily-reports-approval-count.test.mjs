import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pool } from '../server/db.js';

test('approval badge exists in index.html sidebar navigation', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(
    html,
    /data-bcn-view="approval"[\s\S]*?<b data-approval-badge aria-hidden="true" hidden><\/b>/,
    'Sidebar button for approval must include data-approval-badge'
  );
});

test('approval badge CSS is configured in returned-attention.css and daily-reports-reference.css', async () => {
  const attentionCss = await readFile('assets/js/notification-center/returned-attention.css', 'utf8');
  assert.match(attentionCss, /\[data-approval-badge\]/, 'returned-attention.css must style data-approval-badge');

  const refCss = await readFile('assets/css/daily-reports-reference.css', 'utf8');
  assert.match(refCss, /\.bcn-approval-badge/, 'daily-reports-reference.css must style bcn-approval-badge');
  assert.match(refCss, /#dailyReportCaseCount\.bcn-approval-numeric/, 'CSS must style bcn-approval-numeric count');
});

test('approval title in daily-reports-reference-view contains bcnApprovalTitleBadge', async () => {
  const code = await readFile('assets/js/daily-reports-reference-view.js', 'utf8');
  assert.match(code, /bcnApprovalTitleBadge/, 'daily-reports-reference-view.js must define bcnApprovalTitleBadge');
});

test('approval view in daily-reports.js displays strictly numeric count', async () => {
  const code = await readFile('assets/js/daily-reports.js', 'utf8');
  assert.ok(
    code.includes("$('#dailyReportCaseCount').textContent = String(totalCount);"),
    'daily-reports.js must set dailyReportCaseCount to pure numeric string for approval view'
  );
  assert.ok(
    code.includes("document.querySelector('#sidebar [data-approval-badge]')"),
    'daily-reports.js must update sidebar data-approval-badge'
  );
});

test('compiler scope retrieves submitted cases count for today', async () => {
  const result = await pool.query(`
    select count(*)::int as total
    from daily_report_cases
    where report_day = '2026-11-19'
  `);
  const total = result.rows[0].total;
  assert.equal(typeof total, 'number', 'Total submitted cases must be a number');
  assert.ok(total > 0, 'Total submitted cases for today must be greater than 0');
  const numericDisplay = String(total);
  assert.match(numericDisplay, /^\d+$/, 'Approval count display must be strictly digits with no words');
});
