/** Observed homepage/favorites/search/watch-later DOM shapes, with synthetic content. */
import assert from 'node:assert/strict';
import path from 'node:path';

export function bilibiliListingFixture(kind, base) {
  if (kind === 'watchlater') {
    const bvid = new URL(base).pathname.split('/')[2];
    base = `https://www.bilibili.com/list/watchlater/?bvid=${bvid}&oid=116182891959963&watchlater_cfg=%7B%22viewed%22%3A0%7D`;
  }
  const separator = base.includes('?') ? '&' : '?';
  const card = (title, href) => kind === 'search'
    // Search uses a protocol-relative cover link directly under the card wrap,
    // with picture and native watch-later inside that link (observed 2026-09-27).
    ? `<div data-fixture-card class="bili-video-card"><div class="bili-video-card__wrap"><a href="${href.replace(/^https:/, '')}" target="_blank" data-mod="search-card"><div class="bili-video-card__image"><div class="bili-video-card__image--wrap"><div class="bili-watch-later--wrap"><button class="bili-watch-later" aria-label="Watch later" onclick="event.preventDefault();window.nativeLater=(window.nativeLater||0)+1">▷</button></div><picture class="v-img bili-video-card__cover thumbnail"><img alt="${title}" width="320" height="180" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3C/svg%3E"></picture></div></div></a><a href="${href}"><h3>${title}</h3></a></div></div>`
    : `<div data-fixture-card class="${kind === 'generic' ? 'unrelated-result-layout' : 'bili-video-card'}"><div class="bili-video-card__wrap"><div class="${kind === 'home' ? 'home-cover' : 'bili-video-card__cover'}"><a class="${kind === 'home' ? 'bili-video-card__image--link' : 'bili-cover-card'}" href="${href}" target="_blank"><div class="thumbnail"><img alt="${title}" width="320" height="180" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3C/svg%3E"></div></a><div class="${kind === 'home' ? 'bili-watch-later--wrap' : 'bili-card-watch-later'}"><button class="${kind === 'home' ? 'bili-watch-later' : 'bili-card-watch-later__btn'}" aria-label="Watch later" onclick="window.nativeLater=(window.nativeLater||0)+1">▷</button></div><div class="bili-card-checkbox"></div></div><h3 class="${kind === 'home' ? 'bili-video-card__info--tit' : 'bili-video-card__title'}">${title}</h3></div></div>`;
  return `<!doctype html><meta charset="UTF-8"><title>Synthetic Bilibili ${kind}</title><style>
    body{background:#141617;color:#bbb;font:16px system-ui;margin:40px}main{display:flex;gap:24px;flex-wrap:wrap;max-width:1100px}[data-fixture-card]{width:320px}a:has(img){display:block}.home-cover,.bili-video-card__cover{position:relative}.thumbnail{height:180px;background:linear-gradient(140deg,#1b4545,#447368);border-radius:8px;display:grid;place-items:center}a{color:inherit;text-decoration:none}h3{font-size:16px}.bili-watch-later--wrap,.bili-card-watch-later{position:absolute;top:8px;right:8px}.bili-watch-later,.bili-card-watch-later__btn{width:28px;height:28px;border:0;border-radius:6px;background:rgba(25,27,28,.8);color:white}.bili-card-checkbox--visible{position:absolute;top:8px;left:8px;width:24px;height:24px;background:#aaa}input{margin-bottom:24px}section{height:1200px}
    .bili-watch-later--wrap{z-index:9}
    </style><h1>Continue browsing ${kind}</h1><input aria-label="Outside browsing input"><main>
    ${card('Current part', `${base}${separator}p=2&spm_id_from=fixture`)}${card('Default part', base)}${card('Programme excluded', 'https://www.bilibili.com/bangumi/play/ep123')}${card('Unverified selection excluded', `${base}${separator}list=all`)}
    ${kind === 'search' ? card('Live result excluded', 'https://live.bilibili.com/123') + card('Ad redirect excluded', 'https://cm.bilibili.com/cm/api/fees/pc') : ''}
    </main><section>Independent page content</section>`;
}

export async function verifyBilibiliControls({ context, worker, work, rows, until, base }) {
  const checks = [];
  for (const kind of ['home', 'favorites', 'generic', 'search', 'watchlater']) {
    const page = await context.newPage(); await page.setViewportSize({ width: 1280, height: 900 });
    const url = kind === 'home' ? 'https://www.bilibili.com/' : kind === 'generic' ? 'https://www.bilibili.com/v/popular/all' : kind === 'search' ? 'https://search.bilibili.com/all?keyword=fixture&search_source=5' : kind === 'watchlater' ? 'https://www.bilibili.com/watchlater/list' : 'https://space.bilibili.com/123/favlist?fid=456';
    await page.goto(url);
    const buttons = page.locator('[data-locus-bilibili-action="cover"]'); await until(() => buttons.count(), count => count === 2, `${kind} two ordinary candidates`);
    assert.equal(await buttons.locator('svg').count(), 2); assert.equal(await buttons.evaluateAll(values => values.some(button => button.closest('a'))), false);
    assert.equal(await buttons.evaluateAll(values => values.some(button => button.className)), false, 'Cover controls do not borrow native watch-later classes');
    const backgrounds = () => buttons.evaluateAll(values => values.map(button => getComputedStyle(button).backgroundColor));
    assert((await backgrounds()).every(color => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent'), 'Every cover has its own background');
    // Reproduce the observed Dark Reader rewrite before it has created the
    // mapped custom property. The production fallback must remain visible.
    await page.evaluate(() => {
      const source = [...document.querySelectorAll('style')].find(style => style.textContent.includes('--locus-cover-background'));
      const rewritten = document.createElement('style');rewritten.dataset.fixtureTheme = 'true';
      rewritten.textContent = source.textContent.replace(/var\((--locus-(?:native|cover)-background)/g, 'var(--darkreader-bg$1');document.documentElement.append(rewritten);
    });
    assert((await backgrounds()).every(color => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent'), 'Missing rewritten theme variables cannot erase cover backgrounds');
    await page.locator('[data-fixture-theme]').evaluate(style => style.remove());
    const first = buttons.nth(0), second = buttons.nth(1);
    const before = (await rows()).map(row => row.id), tabs = context.pages().length;
    await second.evaluate(button => button.click()); await page.waitForTimeout(250); assert.equal((await rows()).length, before.length);
    await page.getByRole('button', { name: 'Watch later', exact: true }).nth(1).click(); assert.equal(await page.evaluate(() => window.nativeLater), 1);
    // Trusted Enter remains on the listing; it doesn't activate the cover link.
    await second.focus(); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Expand capture queue', exact: true }).waitFor();
    const saved = await until(rows, values => values.some(row => !before.includes(row.id) && row.assets.every(asset => asset.acquisition.state === 'acquired')), `${kind} saved P1`);
    const result = saved.find(row => !before.includes(row.id)); assert.equal(result.sourceUrl, `${base}?p=1`); assert.equal(page.url(), url);
    await until(() => context.pages().length, count => count === tabs, 'temporary source tab cleanup');
    await until(() => second.getAttribute('data-state'), value => value === 'saved', 'unconfigured Locus outcome is shared by matching cards');
    await page.getByRole('button', { name: 'Expand capture queue', exact: true }).click();
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('textbox', { name: 'Outside browsing input' }).fill('browse while importing');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Outside browsing input');
    // Uncaptured actions become interactive only after their cover is hovered.
    await page.locator('[data-fixture-card]').first().hover(); await first.hover();
    const geometry = await first.evaluate(button => { const b = button.getBoundingClientRect(), cover = button.parentElement.parentElement.getBoundingClientRect(), native = button.parentElement.parentElement.querySelector('[aria-label="Watch later"]').getBoundingClientRect();return { width: b.width, height: b.height, left: b.left - cover.left, top: b.top - cover.top, nativeWidth: native.width, nativeHeight: native.height }; });
    assert.deepEqual(geometry, { width: 28, height: 28, left: 8, top: 8, nativeWidth: 28, nativeHeight: 28 });
    await page.screenshot({ path: path.join(work, `bilibili-${kind}-controls.png`) });
    // Recycle the visible P2 node during pointerdown, before the 150 ms scan.
    await first.evaluate(button => button.addEventListener('pointerdown', () => { button.parentElement.parentElement.querySelector('a').href = 'https://www.bilibili.com/video/BV145PxzCEoE/?p=7'; }, { once: true }));
    const previous = (await rows()).map(row => row.id); await first.click();
    const rebound = await until(rows, values => values.some(row => !previous.includes(row.id) && row.assets.every(asset => asset.acquisition.state === 'acquired')), 'recycled card binds current P7');
    assert.equal(rebound.find(row => !previous.includes(row.id)).sourceUrl, `${base}?p=7`);
    if (kind === 'favorites' || kind === 'watchlater') {
      await page.locator('.bili-card-checkbox').first().evaluate(node => node.classList.add('bili-card-checkbox--visible'));
      await until(() => buttons.count(), count => count === 1, 'batch checkbox keeps its corner');
      await page.locator('.bili-card-checkbox').first().evaluate(node => node.classList.remove('bili-card-checkbox--visible'));
      await until(() => buttons.count(), count => count === 2, 'leaving batch mode restores capture');
    }
    if (kind === 'favorites') {
      await page.evaluate(() => { history.pushState({}, '', '/123/settings'); document.body.append(document.createElement('span')); });
      await until(() => buttons.count(), count => count === 2, 'same cover cards survive a different SPA section');
      await page.evaluate(() => { history.pushState({}, '', '/123/favlist?fid=456'); document.body.append(document.createElement('span')); });
      await until(() => buttons.count(), count => count === 2, 'favorites SPA remount');
    }
    await page.locator('[data-fixture-card]').first().evaluate(node => node.remove());
    await until(() => buttons.count(), count => count === 1, 'removed cards release controls');
    await worker.evaluate(tabId => chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/bilibili.js'] }), (await worker.evaluate(url => chrome.tabs.query({ url }), page.url()))[0].id);
    assert.equal(await buttons.count(), 1);
    await page.close(); checks.push(`${kind}: trusted current/default P capture, no link navigation, native watch-later, one state icon, matching overlay geometry, keyboard/nonmodal browsing, recycled/removed cards and idempotent mounting`);
  }
  return checks;
}

export async function verifyWatchlaterPlayer({ context, work, rows, until, base }) {
  const page = await context.newPage();
  const bvid = new URL(base).pathname.split('/')[2];
  await page.goto(`https://www.bilibili.com/list/watchlater/?bvid=${bvid}&oid=116182891959963&p=2`);
  const buttons = page.locator('[data-locus-bilibili-action="toolbar"]');
  await until(() => buttons.count(), count => count === 1, 'watch-later toolbar after native hydration');
  assert.equal(await page.locator('html').getAttribute('data-premature-capture'), 'false');
  assert.equal(await buttons.getAttribute('aria-label'), 'Locus capture P2');
  assert.equal(await buttons.evaluate(button => button.parentElement.nextElementSibling.classList.contains('video-complaint')), true);
  const old = (await rows()).map(row => row.id);
  await buttons.click();
  const saved = await until(rows, values => values.some(row => !old.includes(row.id) && row.assets.every(asset => asset.acquisition.state === 'acquired')), 'watch-later current P2 capture');
  assert.equal(saved.find(row => !old.includes(row.id)).sourceUrl, `${base}?p=2`);
  assert.equal(new URL(page.url()).pathname, '/list/watchlater/');
  await page.screenshot({ path: path.join(work, 'bilibili-watchlater-player.png') });
  await page.locator('#native-p1').click();
  await until(() => buttons.getAttribute('aria-label'), label => label === 'Locus capture P1', 'watch-later part switch');
  // A stale URL/heading combination cannot expose another video's action.
  await page.locator('h1 a').evaluate(link => { link.href = 'https://www.bilibili.com/video/BV1BKQGBtEia/'; });
  await until(() => buttons.count(), count => count === 0, 'watch-later navigation binding gap');
  await page.locator('h1 a').evaluate((link, href) => { link.href = href; }, base);
  await until(() => buttons.count(), count => count === 1, 'watch-later matching heading restores toolbar');
  // Re-read the part on activation before the observer has updated the action.
  await buttons.evaluate(button => button.addEventListener('pointerdown', () => {
    const url = new URL(location.href); url.searchParams.set('p', '7'); history.pushState({}, '', url);
  }, { once: true }));
  const previous = (await rows()).map(row => row.id); await buttons.click();
  const rebound = await until(rows, values => values.some(row => !previous.includes(row.id) && row.assets.every(asset => asset.acquisition.state === 'acquired')), 'watch-later activation rebinds P7');
  assert.equal(rebound.find(row => !previous.includes(row.id)).sourceUrl, `${base}?p=7`);
  await page.close();
  return 'watch-later player: hydration-safe toolbar, current P2 capture, canonical source, native part switching, heading/URL agreement and activation-time rebinding';
}
