import assert from 'node:assert/strict';

export async function verifyReturnedAssistant({ page, day, scope, title, id, getCase, check }) {
  const panel = page.locator('#seedyAssistant');
  await page.getByRole('button', { name: 'Đóng chi tiết vụ việc', exact: true }).click();
  await page.locator('.bcn-pet-character').click();
  const send = async message => {
    await panel.locator('textarea').fill(message);
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/seedy/chat'), { timeout: 180000 }),
      panel.locator('[data-ai-send]').click({ timeout: 60000 })
    ]);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.at(-1)?.type, 'done', JSON.stringify(events.at(-1)));
    await panel.locator('[data-ai-stop]').waitFor({ state: 'hidden', timeout: 180000 });
    const failure = panel.locator('[data-ai-error]');
    assert.equal(await failure.textContent(), '', 'Assistant action: ' + await failure.textContent());
    return events.find(event => event.type === 'meta');
  };
  const initial = await getCase(id);
  const byReturn = await send('Mở hồ sơ bị trả lại hôm nay của đơn vị tôi');
  assert.ok(byReturn.memory.ids.includes(id), 'A report created ten days ago was returned today');
  assert.equal(await page.locator('#bcnCaseFilters [name=date_basis]').inputValue(), 'returned');
  const list = await send(`Mở danh sách hồ sơ bị trả lại theo ngày báo cáo ${day} của đơn vị tôi`);
  assert.equal(list.action.type, 'list');
  assert.equal(list.action.unit, String(scope.unitId));
  assert.equal(await page.locator('#bcnCaseFilters [name=from_day]').inputValue(), day);
  assert.equal(await page.locator('#bcnCaseFilters [name=state]').inputValue(), 'RETURNED');
  const ordinal = list.memory.ids.indexOf(id) + 1;
  assert.ok(ordinal > 0);
  const draft = await send(`Soạn bổ sung cho báo cáo số ${ordinal}. Dữ kiện mới: đã nhận hai tài liệu thử.`);
  assert.equal(draft.action.id, id);
  assert.ok(draft.draft);
  const proposal = await panel.locator('.seedy-ai-message-assistant .seedy-ai-message-text').last().innerText();
  assert.ok(proposal.trim().length > 10);
  await send('Gửi báo cáo đó');
  await page.locator('#bcnDetail[open]').waitFor();
  assert.equal(await page.locator('#bcnCaseEdit [name=title]').inputValue(), title);
  const summary = await page.locator('#bcnCaseEdit [name=summary]').inputValue();
  assert.ok(summary.startsWith(initial.summary) && summary.length > initial.summary.length);
  assert.equal((await getCase(id)).version, initial.version);
  check('Seedy opens filtered returned cases, drafts for the selected ID and waits for human submission');
}
