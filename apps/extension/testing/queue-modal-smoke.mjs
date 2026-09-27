import assert from 'node:assert/strict';
import path from 'node:path';

/** The real production shadow surface: pointer, keyboard and scroll assertions. */
export async function verifyQueueModal({ page, until, work, label, update }) {
  const launcher = page.getByRole('button', { name: 'Expand capture queue', exact: true });
  await launcher.waitFor();
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'modal-outside'; input.setAttribute('aria-label', 'Modal outside input');
    input.style.cssText = 'position:fixed;left:8px;top:8px'; document.body.append(input);
    const space = document.createElement('div'); space.style.height = '3000px'; document.body.append(space);
    globalThis.modalOutsideClicks = 0; input.addEventListener('click', () => globalThis.modalOutsideClicks++);
  });
  const before = await launcher.boundingBox();
  assert.equal(before.width, before.height, 'Launcher is a circle, not a status bar');
  assert(before.width >= 44 && before.width <= 56, 'Launcher stays compact and touch accessible');
  assert(await launcher.evaluate(button => parseFloat(getComputedStyle(button).borderRadius) >= button.getBoundingClientRect().width / 2), 'Launcher has fully rounded corners');
  await page.screenshot({ path: path.join(work, `${label}-queue-orb.png`), animations: 'disabled' });
  await page.mouse.move(before.x + 30, before.y + 20); await page.mouse.down();
  await page.mouse.move(before.x - 180, before.y - 120, { steps: 8 }); await page.mouse.up();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Dragging must not open');
  let moved = await launcher.boundingBox(); assert(moved.x < before.x - 100 && moved.y < before.y - 60, JSON.stringify({before,moved}));
  // Synthetic cancellation exercises cleanup of an actual captured pointer.
  await page.mouse.move(moved.x + 25, moved.y + 20); await page.mouse.down();
  await launcher.evaluate(button => button.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.up(); assert.equal(await page.getByRole('dialog').count(), 0);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: moved.x + 30, y: moved.y + 20 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: moved.x - 70, y: moved.y - 80 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(() => launcher.boundingBox(), box => box.x < moved.x - 60, 'touch drag moves launcher');
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await touch.detach();
  moved = await launcher.boundingBox(); assert.equal(await page.getByRole('dialog').count(), 0, 'Touch drag suppresses click');
  await launcher.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Capture queue' }); await dialog.waitFor();
  const settle = () => dialog.evaluate(async element => { await Promise.all([element, element.getRootNode().querySelector('[data-slot="dialog-overlay"]')].flatMap(node => node.getAnimations().map(animation => animation.finished.catch(() => {})))); });
  await settle();
  const focusInside = () => dialog.evaluate(element => element.contains(element.getRootNode().activeElement));
  await until(focusInside, Boolean, 'focus enters shadow modal');
  for (let index = 0; index < 16; index++) { await page.keyboard.press(index % 3 === 0 ? 'Shift+Tab' : 'Tab'); await until(focusInside, Boolean, `Tab stays inside shadow modal ${index}: ${await page.evaluate(() => [document.activeElement?.outerHTML?.slice(0, 200), document.activeElement?.shadowRoot?.activeElement?.outerHTML?.slice(0, 500)])}`); }
  const popup = await dialog.boundingBox(); assert(popup.x >= 0 && popup.y >= 0);
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).pointerEvents), 'auto');
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.mouse.move(4, 300); await page.mouse.wheel(0, 500); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Page scroll blocked while modal open');
  await page.screenshot({ path: path.join(work, `${label}-queue-modal.png`), animations: 'disabled' });
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  await until(() => launcher.evaluate(element => element.getRootNode().activeElement === element), Boolean, 'focus returns to launcher');
  assert.deepEqual(await launcher.boundingBox(), moved, 'Position survives modal cycle');
  if (update) {
    await update('uploading');
    await until(() => launcher.getAttribute('title'), title => title.startsWith('1 active · 0 queued'), 'Orb exposes updated task status');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Background progress never reopens modal');
    assert.equal(await launcher.evaluate(element => element.getRootNode().activeElement === element), true, 'Background progress preserves focus');
  }
  await launcher.click(); await dialog.waitFor(); await page.mouse.click(16, 16);
  assert.equal(await page.evaluate(() => globalThis.modalOutsideClicks), 0, 'Backdrop blocks page pointer');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('textbox', { name: 'Modal outside input' }).fill('Browsing restored');
  await page.mouse.move(4, 300); await page.mouse.wheel(0, 400);
  await until(() => page.evaluate(() => scrollY), value => value > scrollBefore, 'Page scroll restored');
  await page.evaluate(() => scrollTo(0, 0));
  await page.setViewportSize({ width: 390, height: 620 });
  await until(() => launcher.boundingBox(), value => value.x >= 0 && value.y >= 0 && value.x + value.width <= 390 && value.y + value.height <= 620, 'launcher clamped after resize');
  await launcher.click(); await dialog.waitFor();
  await settle();
  const narrow = await dialog.boundingBox(); assert(narrow.x >= 0 && narrow.y >= 0 && narrow.x + narrow.width <= 390 && narrow.y + narrow.height <= 620);
  if (update) {
    await page.getByRole('button', { name: 'Refresh status', exact: true }).focus();
    await update('failed');
    await page.getByText('Locus save needs attention', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Refresh status', exact: true }).evaluate(element => element.getRootNode().activeElement === element), true, 'Queue updates preserve modal focus');
    assert.equal(await page.locator('[data-capture-diagnostic] details').getAttribute('open'), null);
    await page.locator('[data-capture-diagnostic] summary').click();
    await page.getByRole('button', { name: 'Copy diagnostic', exact: true }).waitFor();
  }
  await page.screenshot({ path: path.join(work, `${label}-queue-narrow.png`), animations: 'disabled' });
  await page.getByRole('button', { name: 'Keep browsing', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1280, height: 900 });
}
