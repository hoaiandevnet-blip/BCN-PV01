import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

async function assertFits(page) {
  const fits = await page.locator('#bcnPet').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.left >= 0 && bounds.top >= 0
      && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
  });
  assert.equal(fits, true, 'The pet must remain completely inside the viewport');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

export async function verifyPet({ page, browser, base, output, check, errors }) {
  const directory = `${output}/pet-seedy`;
  await mkdir(directory, { recursive: true });
  const pet = page.locator('#bcnPet');
  const sprite = pet.locator('.bcn-pet-sprite');
  const character = page.locator('.bcn-pet-character');
  const options = page.getByRole('button', { name: 'Tùy chọn thú cưng', exact: true });
  await pet.waitFor({ state: 'visible' });
  await assertFits(page);
  const artworkStyle = await character.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow };
  });
  assert.deepEqual(artworkStyle, { background: 'rgba(0, 0, 0, 0)', image: 'none', shadow: 'none' });
  await page.mouse.move(300, 80);
  const initialFrame = await sprite.getAttribute('data-frame');
  await page.waitForFunction(frame => document.querySelector('.bcn-pet-sprite').dataset.frame !== frame, initialFrame);
  await page.screenshot({ path: `${directory}/desktop.png` });
  await pet.screenshot({ path: `${directory}/seedy-detail.png` });
  check('Seedy loads its original local artwork and animates automatically after login');

  const original = await pet.boundingBox();
  const center = { x: original.x + original.width / 2, y: original.y + 75 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 250, center.y - 180, { steps: 12 });
  await page.mouse.up();
  const moved = await pet.boundingBox();
  assert.ok(Math.hypot(moved.x - original.x, moved.y - original.y) > 50);
  const savedPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('bcnpv01.pet.seedy.v1')).position);
  await page.reload();
  await pet.waitFor({ state: 'visible' });
  const restoredPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('bcnpv01.pet.seedy.v1')).position);
  assert.deepEqual(restoredPosition, savedPosition);
  const restored = await pet.boundingBox();
  await character.focus();
  await character.press('ArrowLeft');
  const keyboardMoved = await pet.boundingBox();
  assert.ok(keyboardMoved.x < restored.x);
  await character.press('Home');
  await assertFits(page);
  check('Pointer dragging and keyboard movement work; the saved position survives reload');

  await options.click();
  await page.getByRole('button', { name: 'Vẫy tay chào', exact: true }).click();
  assert.equal(await sprite.getAttribute('data-animation'), 'wave');
  await options.click();
  const menuFits = await page.locator('#bcnPetMenu').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
  });
  assert.equal(menuFits, true);
  await page.screenshot({ path: `${directory}/menu-dark.png` });
  await page.locator('#bcnPetMenu button').first().press('Escape');
  assert.equal(await page.locator('#bcnPetMenu').isVisible(), false);
  await options.click();
  await page.getByRole('button', { name: 'Ẩn thú cưng', exact: true }).click();
  assert.equal(await pet.isVisible(), false);
  await page.reload();
  await page.locator('#appShell').waitFor({ state: 'visible' });
  assert.equal(await pet.isVisible(), false);
  await page.getByRole('button', { name: 'Hiện thú cưng Seedy', exact: true }).click();
  await pet.waitFor({ state: 'visible' });
  check('Pet menu, greeting, Escape, hide, reload persistence and toolbar restore work');

  await page.evaluate(async () => {
    const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
    previewAppearance({ palette: 'crimson', mode: 'light' });
  });
  await options.click();
  await page.screenshot({ path: `${directory}/menu-light.png` });
  await options.click();
  await page.evaluate(async () => {
    const { cancelAppearancePreview } = await import('/assets/js/standalone/appearance.js');
    cancelAppearancePreview();
  });
  for (const width of [1024, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await assertFits(page);
    const toggle = page.locator('#bcnPetToggle');
    if (width <= 600) await page.locator('#menuToggle').click();
    const buttonBounds = await toggle.boundingBox();
    assert.ok(buttonBounds.x >= 0 && buttonBounds.x + buttonBounds.width <= width);
    if (width <= 600) await page.locator('#menuToggle').click();
    await pet.waitFor({ state: 'visible' });
    await page.screenshot({ path: `${directory}/viewport-${width}.png` });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(1, 1);
  const stillFrame = await sprite.getAttribute('data-frame');
  await page.waitForTimeout(1900);
  assert.equal(await sprite.getAttribute('data-frame'), stillFrame);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const resumedFrame = await sprite.getAttribute('data-frame');
  await page.waitForFunction(frame => document.querySelector('.bcn-pet-sprite').dataset.frame !== frame, resumedFrame);
  check('Pet and controls fit 320–1440px, support light/dark themes and respect reduced motion');

  await page.setViewportSize({ width: 1440, height: 1000 });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState()
  });
  try {
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(base);
    await mobile.locator('#bcnPet').waitFor({ state: 'visible' });
    const bounds = await mobile.locator('#bcnPet').boundingBox();
    const session = await mobileContext.newCDPSession(mobile);
    const origin = { x: bounds.x + bounds.width / 2, y: bounds.y + 50 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [origin] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: origin.x - 120, y: origin.y - 140 }]
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const dragged = await mobile.locator('#bcnPet').boundingBox();
    assert.ok(Math.hypot(dragged.x - bounds.x, dragged.y - bounds.y) > 30);
    await assertFits(mobile);
    await mobile.getByRole('button', { name: 'Tùy chọn thú cưng', exact: true }).tap();
    await mobile.getByRole('button', { name: 'Về góc màn hình', exact: true }).tap();
    await mobile.getByRole('button', { name: 'Mở menu', exact: true }).tap();
    assert.equal(await mobile.locator('#bcnPet').isVisible(), false);
    await mobile.getByRole('button', { name: 'Ẩn thú cưng Seedy', exact: true }).tap();
    await mobile.getByRole('button', { name: 'Mở menu', exact: true }).tap();
    assert.equal(await mobile.locator('#bcnPet').isVisible(), false);
    await mobile.getByRole('button', { name: 'Mở menu', exact: true }).tap();
    await mobile.getByRole('button', { name: 'Hiện thú cưng Seedy', exact: true }).tap();
    await mobile.getByRole('button', { name: 'Mở menu', exact: true }).tap();
    await mobile.locator('#bcnPet').waitFor({ state: 'visible' });
    await mobile.screenshot({ path: `${directory}/mobile-touch.png` });
    await session.detach();
  } finally {
    await mobileContext.close();
  }

  const anonymous = await browser.newContext();
  try {
    const login = await anonymous.newPage();
    login.on('pageerror', error => errors.push(error.message));
    await login.goto(base);
    await login.locator('#loginScreen').waitFor({ state: 'visible' });
    assert.equal(await login.locator('#bcnPet').isVisible(), false);
    assert.equal(await login.locator('#bcnPetToggle').isVisible(), false);
  } finally {
    await anonymous.close();
  }
  check('Real touch dragging works; the pet stays out of the login form and mobile navigation');
}
