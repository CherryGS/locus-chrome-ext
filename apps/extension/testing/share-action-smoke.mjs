import assert from 'node:assert/strict';

/** Exercise recovery and evolving DOM without reloading the document. */
export async function verifyShareActions({ context, until, checks, loggedInFixture }) {
  const page = await context.newPage();
  await page.goto('https://x.com/synthetic/status/505');
  await until(() => page.locator('html').getAttribute('data-fixture-access-attempts'), value => value === '1', 'first access failure');
  assert.equal(await page.locator('[data-locus-action]').count(), 0, 'No action before successful authorization');
  await page.locator('[data-locus-action]').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-fixture-access-attempts'), '3', 'Transient access failure retries without refresh');

  await page.evaluate(html => {
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.head.append(fixture.querySelector('style'));
    const article = fixture.querySelector('article');
    article.querySelector('[data-testid=share]').parentElement.parentElement.remove();
    for (const selector of ['[data-testid=reply]', '[data-testid=like]', '[data-testid=bookmark]', 'a[href$="/analytics"]']) article.querySelector(selector).remove();
    const row = article.querySelector('[role=group]');
    row.removeAttribute('role');
    article.dataset.fixtureDelayed = 'true';
    document.body.replaceChildren(article);
  }, loggedInFixture('505'));
  await until(() => page.locator('[data-locus-action]').count(), count => count === 0, 'share still loading');
  // The real logged-in glyph and menu attribute, without a test ID or English
  // label. Set the glyph later to exercise attribute-only hydration as well.
  await page.locator('article').evaluate(article => {
    const share = document.createElement('div');
    share.className = 'r-share';
    share.innerHTML = '<div style="display:inline-grid"><div style="display:flex"><button type="button" aria-haspopup="menu" aria-label="共有" class="css-action r-button"><div class="r-presentation"><div class="r-icon-wrap"><svg class="r-svg" viewBox="0 0 24 24"><g><path /></g></svg></div></div></button></div></div>';
    article.querySelector('.r-row').append(share);
  });
  assert.equal(await page.locator('[data-locus-action]').count(), 0);
  await page.locator('[aria-label="共有"] path').evaluate(path => path.setAttribute('d', 'M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z'));
  const action = page.locator('[data-locus-action] button');
  await action.waitFor();
  assert.equal(await page.locator('[data-locus-action]').evaluate(slot => slot.nextElementSibling.classList.contains('r-share')), true);
  await action.click({ modifiers: ['Shift'] });
  await page.getByText('@synthetic · 505', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Minimize capture queue', exact: true }).click();
  // Reorder the native share slot, then replace the whole action bar.
  await page.locator('.r-row').evaluate(row => row.prepend(row.querySelector('.r-share')));
  await until(() => page.locator('[data-locus-action]').evaluate(slot => slot.nextElementSibling.classList.contains('r-share')), Boolean, 'follow reordered share');
  await page.locator('.r-row').evaluate(row => { const copy = row.cloneNode(true);copy.querySelector('[data-locus-action]').remove();row.replaceWith(copy); });
  await action.waitFor();
  assert.equal(await page.locator('[data-locus-action]').count(), 1);
  // Recycled tweet identity is resolved from its own permalink, never page URL.
  await page.locator('a').filter({ has: page.locator('time') }).last().evaluate(link => { link.href = '/synthetic/status/506'; });
  await action.click({ modifiers: ['Shift'] });
  await page.getByText('@synthetic · 506', { exact: true }).waitFor();
  await page.close();
  const revoked = await context.newPage();
  await revoked.goto('https://x.com/synthetic/status/505');
  await until(() => revoked.locator('html').getAttribute('data-fixture-access-attempts'), value => value === '1', 'retry pending before revocation');
  await context.serviceWorkers()[0].evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://x.com/synthetic/status/505' });
    await chrome.tabs.sendMessage(tab.id, { target: 'page', op: 'revoke' }).catch(() => {});
  });
  await until(() => revoked.locator('[data-locus-capture]').count(), count => count === 0, 'revocation tears down pending retry');
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal(await revoked.locator('html').getAttribute('data-fixture-access-attempts'), '1');
  assert.equal(await revoked.locator('[data-locus-action]').count(), 0);
  await revoked.close();
  checks.push('Share anchor: transient startup failure retries before displaying controls; delayed glyph hydration, missing Reply/Like/Bookmark/analytics/group role, localized real Share glyph, reorder, row replacement and recycled source all recover without reload');
}
