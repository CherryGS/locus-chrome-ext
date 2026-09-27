/** Disposable source-page UI test. Fixtures replace transport only in the copied bundle. */
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { bilibiliListingFixture } from './bilibili-controls-smoke.mjs';
import { verifyQueueModal } from './queue-modal-smoke.mjs';
import assert from 'node:assert/strict';

if (!process.env.LOCUS_CHROME_PATH) throw new Error('Set LOCUS_CHROME_PATH');
const work = await mkdtemp(path.join(tmpdir(), 'locus-queue-ui-'));
const extension = path.join(work, 'extension');
await cp(fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url)), extension, { recursive: true });
const manifestPath = path.join(extension, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = manifest.optional_host_permissions; await writeFile(manifestPath, JSON.stringify(manifest));
const source = 'https://www.bilibili.com/video/BV145PxzCEoE/?p=2';
for (const site of ['twitter', 'bilibili']) {
  const script = path.join(extension, `content-scripts/${site}.js`);
  const url = site === 'twitter' ? 'https://x.com/synthetic/status/1' : source;
  const fixture = { id: `queue-${site}`, sourceUrl: url, label: `${site} fixture capture`, createdAt: new Date().toISOString(), revision: 1, acquisition: 'complete', retention: { state: 'retained', revision: 1 }, locus: { state: 'configuration-required', message: 'Locus setup required' } };
  await writeFile(script, `{
    const send = chrome.runtime.sendMessage.bind(chrome.runtime), row = ${JSON.stringify(fixture)};
    globalThis.__queueFixture = row;
    globalThis.__queueFixtures = [row];
    chrome.runtime.sendMessage = async (message, ...rest) => {
      if (message.op === 'capture-tasks') return {ok:true,value:globalThis.__queueFixtures};
      if (message.op === 'source-status') return {ok:true,value:[]};
      if (message.op === 'status') return {ok:true,value:globalThis.__queueFixtures.find(item => item.id === message.id) ?? null};
      return send(message,...rest);
    };
  }\n` + await readFile(script, 'utf8'));
}
const context = await chromium.launchPersistentContext(path.join(work, 'profile'), { executablePath: process.env.LOCUS_CHROME_PATH, headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
const until = async (read, predicate, label) => { for (let i = 0; i < 100; i++) { const value = await read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(label); };
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await context.route('https://www.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: bilibiliListingFixture('home', source.split('?')[0]) }));
  await context.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{background:#171717;color:white}article{margin:80px;height:180px}.row{display:flex;gap:30px}svg{width:20px;height:20px}</style><article><a href="/synthetic/status/1"><time>Today</time></a><div role="group" class="row"><div><button data-testid="reply">Reply</button></div><div><button data-testid="bookmark">Bookmark</button></div><div><button data-testid="share"><svg viewBox="0 0 24 24"><path d="M12 2v20"/></svg></button></div></div></article>' }));
  for (const [site, url] of [['twitter', 'https://x.com/synthetic/status/1'], ['bilibili', 'https://www.bilibili.com/']]) {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(String(error))); await page.goto(url);
    // Explicit injection is isolated to this pre-granted disposable profile.
    const [tab] = await worker.evaluate(url => chrome.tabs.query({ url }), url);
    await worker.evaluate(({ id, site }) => chrome.scripting.executeScript({ target: { tabId: id }, files: [`content-scripts/${site}.js`] }), { id: tab.id, site });
    const cdp = await context.newCDPSession(page), worlds = [];
    cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context)); await cdp.send('Runtime.enable');
    const world = await until(async () => { for (const candidate of worlds) { const value = await cdp.send('Runtime.evaluate', { expression: '!!globalThis.__queueFixture', contextId: candidate.id, returnByValue: true }); if (value.result.value) return candidate; } }, Boolean, 'fixture transport world');
    const update = state => cdp.send('Runtime.evaluate', { expression: `__queueFixture.locus = {state:${JSON.stringify(state)},message:'Synthetic network failure. Original request retained.\\nrequest-id: original-fixture'};`, contextId: world.id });
    await verifyQueueModal({ page, until, work, label: site, update });
    await page.getByRole('button', { name: 'Expand capture queue', exact: true }).click(); await page.getByRole('dialog').waitFor();
    const evaluateFixture = expression => cdp.send('Runtime.evaluate', { expression, contextId: world.id });
    await evaluateFixture(`{
      const row = __queueFixture, base = Date.parse(row.createdAt);
      const make = (id, offset, state) => ({...row, id, label:id, createdAt:new Date(base + offset).toISOString(), locus:{state,message:state}});
      __queueFixtures.push(make('oldest-active', -3000, 'uploading'), make('middle-saved', -1000, 'complete'), make('same-time-saved', -1000, 'complete'), {...make('newest-queued', 1000, 'waiting'), acquisition:'pending', queuePosition:1});
    }`);
    const refresh = page.getByRole('button', { name: 'Refresh status', exact: true });
    const taskIds = () => page.locator('[data-task-id]').evaluateAll(rows => rows.map(row => row.dataset.taskId));
    const expected = ['newest-queued', `queue-${site}`, 'middle-saved', 'same-time-saved', 'oldest-active'];
    await refresh.click();
    await until(taskIds, ids => JSON.stringify(ids) === JSON.stringify(expected), 'Newest tasks stay above older active work');
    await evaluateFixture(`{
      __queueFixtures.reverse();
      for (const row of __queueFixtures) {
        delete row.queuePosition;
        row.acquisition = 'complete';
        row.locus = {state:row.id === 'middle-saved' ? 'uploading' : 'complete',message:'Updated fixture'};
        row.label += ' updated';
      }
    }`);
    await refresh.click();
    await page.getByText('newest-queued updated', { exact:true }).waitFor();
    await page.locator('[data-task-id="newest-queued"]').getByText('Saved to Locus', { exact:true }).waitFor();
    await page.locator('[data-task-id="middle-saved"]').getByText('Saving', { exact:true }).waitFor();
    assert.deepEqual(await taskIds(), expected, 'Completion, new active work and polling order cannot reorder existing rows');
    await evaluateFixture(`__queueFixtures.push({...__queueFixture,id:'just-added',label:'Just added',createdAt:new Date(Date.parse(__queueFixture.createdAt)+2000).toISOString()})`);
    await refresh.click();
    await until(taskIds, ids => JSON.stringify(ids) === JSON.stringify(['just-added', ...expected]), 'New tasks insert at the top without reordering existing tasks');
    await page.screenshot({ path:path.join(work, `${site}-queue-order.png`), animations:'disabled' });
    await worker.evaluate(id => chrome.tabs.sendMessage(id, { target: 'page', op: 'revoke' }), tab.id);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('textbox', { name: 'Modal outside input' }).fill('Teardown restored browsing');
    await page.mouse.move(4, 300); await page.mouse.wheel(0, 400); await until(() => page.evaluate(() => scrollY), value => value > 0, 'teardown restores page scroll');
    await cdp.detach();
    assert.deepEqual(errors, [], `${site} page runtime errors`);
    await page.close(); console.log(`${site}: compact orb, newest-first stable ordering, drag/cancel, focus trap/return, backdrop/scroll, resize PASS`);
  }
  console.log(work);
} catch (error) { console.error(`Artifacts: ${work}`); throw error; }
finally { await context.close(); }
