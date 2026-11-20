import assert from 'node:assert/strict';

const textOf = result => result.events.filter(event => event.type === 'delta').map(event => event.text).join('');
function metaOf(result) {
  assert.equal(result.status, 200, JSON.stringify(result.error));
  assert.equal(result.events.at(-1)?.type, 'done', JSON.stringify(result.events.at(-1)));
  return result.events.find(event => event.type === 'meta');
}

function assertCounts(answer, dashboard) {
  const number = value => new Intl.NumberFormat('vi-VN').format(value);
  assert.ok(answer.includes(`Đã gửi: ${number(dashboard.progress.submitted)} đơn vị`), answer);
  assert.ok(answer.includes(`Chưa gửi: ${number(dashboard.progress.missing)} đơn vị`), answer);
  assert.ok(answer.includes(`Tổng số đơn vị cần gửi: ${number(dashboard.progress.expected)}`), answer);
}

export async function verifyProgress({ page, request, collectChat, base, admin, reporter, denied,
  day, folder, responses, check }) {
  const question = 'có thể thống kê cho t xem có bao nhiêu đơn vị chưa gửi bao nhiêu đơn vị đã gửie';
  const deniedQuery = await collectChat(base, denied, { message: question });
  assert.equal(deniedQuery.status, 403);
  const ownDashboard = (await request(`/api/bao-cao-ngay/dashboard?day=${day}&span=1`, { cookie: reporter })).data;
  const scoped = await collectChat(base, reporter, { message: question });
  assert.equal(scoped.status, 200, JSON.stringify(scoped));
  assert.equal(metaOf(scoped).model, 'system-query');
  assertCounts(textOf(scoped), ownDashboard);
  assert.equal(metaOf(scoped).data.don_vi.can_gui, ownDashboard.progress.expected);
  assert.equal(metaOf(scoped).data.danh_sach, undefined);
  responses.push({ kind: 'natural-progress-scoped', question, answer: textOf(scoped), elapsedMs: scoped.elapsedMs });
  const scopedList = await collectChat(base, reporter, { message: 'Liệt kê đơn vị đã gửi và chưa gửi' });
  assert.equal(scopedList.status, 200);
  assert.deepEqual(metaOf(scopedList).data.danh_sach.don_vi,
    ownDashboard.units.filter(unit => unit.expected).slice(0, 25)
      .map(unit => ({ ten: unit.name, trang_thai: unit.status })));
  assert.equal(metaOf(scopedList).data.units, undefined);
  check('Natural progress questions and unit lists use the same authorization and counts as the dashboard');

  const yesterday = new Date(`${day}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const previousDay = yesterday.toISOString().slice(0, 10);
  const earlierDashboard = (await request(`/api/bao-cao-ngay/dashboard?day=${previousDay}&span=1`, {
    cookie: admin
  })).data;
  const earlier = await collectChat(base, admin, { message: 'Hôm qua có bao nhiêu đơn vị chưa gửi?' });
  assert.equal(earlier.status, 200);
  assert.equal(metaOf(earlier).data.ngay, previousDay);
  assertCounts(textOf(earlier), earlierDashboard);
  const followup = await collectChat(base, admin, {
    message: 'Những đơn vị nào chưa gửi?',
    history: [
      { role: 'user', content: `Bao nhiêu đơn vị chưa gửi ngày ${previousDay}?` },
      { role: 'assistant', content: textOf(earlier) }
    ]
  });
  assert.equal(followup.status, 200, JSON.stringify(followup));
  const list = metaOf(followup).data.danh_sach;
  assert.equal(metaOf(followup).data.ngay, previousDay);
  assert.equal(list.tong_so, earlierDashboard.progress.missing);
  assert.deepEqual(list.don_vi, earlierDashboard.units.filter(unit => unit.expected && unit.status === 'missing')
    .slice(0, 25).map(unit => ({ ten: unit.name, trang_thai: unit.status })));
  responses.push({ kind: 'natural-progress-followup', day: previousDay, answer: textOf(followup) });
  for (const message of ['Đơn vị nào chưa gửi ngày 31/02/2026?', 'Thống kê đơn vị chưa gửi quý này']) {
    const unclear = await collectChat(base, admin, { message });
    assert.equal(unclear.status, 200);
    assert.equal(metaOf(unclear).data, null);
    assert.match(textOf(unclear), /ngày|Ngày/);
  }
  check('Progress follow-ups keep the requested date; invalid dates and unsupported periods request clarification');

  const weekly = await collectChat(base, reporter, { message: 'Tuần này đơn vị nào thiếu báo cáo nhiều ngày nhất?' });
  assert.equal(metaOf(weekly).memory.kind, 'progress');
  assert.match(textOf(weekly), /lượt đơn vị cần gửi/);
  const lastWeek = await collectChat(base, reporter, { message: 'Thế còn tuần trước?', memory: metaOf(weekly).memory });
  assert.ok(!textOf(lastWeek).includes(day));
  assert.match(textOf(lastWeek), /lượt đơn vị cần gửi/);
  const inferred = await collectChat(base, reporter, { message: 'Bên nào vẫn còn nợ bài báo cáo hôm nay vậy?' });
  assert.equal(metaOf(inferred).data?.ngay, day);
  assert.equal(metaOf(inferred).data?.danh_sach?.tong_so, ownDashboard.progress.missing);
  check('Weekly progress, the previous week and semantic lookup use scoped live sources');

  const dashboard = (await request(`/api/bao-cao-ngay/dashboard?day=${day}&span=1`, { cookie: admin })).data;
  const panel = page.locator('#seedyAssistant');
  await panel.locator('[data-ai-clear]').click();
  assert.equal(await panel.locator('[data-ai-context]').isChecked(), false);
  await page.locator('#seedyAiInput').fill(question);
  await panel.locator('[data-ai-send]').click();
  await page.waitForFunction(() => document.querySelector('#seedyAssistant [data-ai-progress]')
    ?.textContent.includes('Đã trả lời'));
  const answer = await panel.locator('.seedy-ai-message-assistant .seedy-ai-message-text').last().innerText();
  assertCounts(answer, dashboard);
  assert.equal(await panel.locator('[data-ai-error]').isVisible(), false);
  await page.screenshot({ path: `${folder}/progress-chat.png` });
  await page.locator('#seedyAiInput').fill('Những đơn vị nào chưa gửi?');
  await panel.locator('[data-ai-send]').click();
  await page.waitForFunction(() => document.querySelectorAll('#seedyAssistant .seedy-ai-message-assistant').length === 2
    && document.querySelector('#seedyAssistant [data-ai-progress]')?.textContent.includes('Đã trả lời'));
  const names = await panel.locator('.seedy-ai-message-assistant .seedy-ai-message-text').last().innerText();
  for (const unit of dashboard.units.filter(unit => unit.expected && unit.status === 'missing').slice(0, 25)) {
    assert.ok(names.includes(unit.name), unit.name);
  }
  await page.screenshot({ path: `${folder}/progress-list.png` });
  responses.push({ kind: 'natural-progress-browser', question, answer, at: new Date().toISOString() });
  check('Typing the user’s exact question in ordinary chat answers live counts, then lists missing units');

  await panel.locator('[data-ai-clear]').click();
  await page.locator('#seedyAiInput').fill('Hôm qua có bao nhiêu đơn vị chưa gửi?');
  await panel.locator('[data-ai-send]').click();
  await page.waitForFunction(() => document.querySelector('#seedyAssistant [data-ai-progress]')
    ?.textContent.includes('Đã trả lời'));
  await page.locator('#seedyAiInput').fill('Những đơn vị nào chưa gửi?');
  await panel.locator('[data-ai-send]').click();
  await page.waitForFunction(() => document.querySelectorAll('#seedyAssistant .seedy-ai-message-assistant').length === 2
    && document.querySelector('#seedyAssistant [data-ai-progress]')?.textContent.includes('Đã trả lời'));
  await page.locator('#seedyAiInput').fill('Còn đã gửi?');
  const followupRequest = page.waitForRequest(request => request.url().endsWith('/api/seedy/chat'));
  await panel.locator('[data-ai-send]').click();
  const historyPayload = (await followupRequest).postDataJSON();
  assert.ok(historyPayload.history.some(turn => turn.role === 'user' && turn.content.includes(previousDay)));
  await page.waitForFunction(() => document.querySelectorAll('#seedyAssistant .seedy-ai-message-assistant').length === 3
    && document.querySelector('#seedyAssistant [data-ai-progress]')?.textContent.includes('Đã trả lời'));
  const next = await panel.locator('.seedy-ai-message-assistant .seedy-ai-message-text').last().innerText();
  assertCounts(next, earlierDashboard);
  assert.ok(next.includes(previousDay.split('-').reverse().join('/')));
  check('Browser follow-up after a unit list retains yesterday through compact data history');

  // Exercise the offline UI path without stopping the user's Ollama service.
  await page.route('**/api/seedy/status', async route => {
    const response = await route.fetch();
    const actual = await response.json();
    await route.fulfill({ response, json: { ...actual, ready: false, models: [], recommended: null,
      message: 'Ollama chưa sẵn sàng. Tra cứu số liệu vẫn dùng được.' } });
  });
  await panel.locator('[data-ai-reconnect]').click();
  await page.waitForFunction(() => document.querySelector('#seedyAssistant [data-ai-connection]')
    ?.textContent.includes('Ollama chưa sẵn sàng'));
  await panel.locator('[data-ai-clear]').click();
  await page.locator('#seedyAiInput').fill(question);
  await page.locator('#seedyAiInput').press('Enter');
  await page.waitForFunction(() => document.querySelector('#seedyAssistant [data-ai-progress]')
    ?.textContent.includes('Đã trả lời'));
  assertCounts(await panel.locator('.seedy-ai-message-assistant').innerText(), dashboard);
  await page.unroute('**/api/seedy/status');
  await panel.locator('[data-ai-reconnect]').click();
  await page.waitForFunction(() => document.querySelector('#seedyAssistant [data-ai-connection]')
    ?.textContent === 'AI local sẵn sàng');
  await panel.locator('[data-ai-clear]').click();
  check('Typed progress questions still work when the UI reports no local model available');
}
