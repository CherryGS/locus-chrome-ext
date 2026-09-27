/** Retained-data Preview/Metadata regression in the production extension. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

if (!process.env.LOCUS_CHROME_PATH) throw new Error('Set LOCUS_CHROME_PATH');
const work = await mkdtemp(path.join(tmpdir(), 'locus-inspector-ui-'));
const extension = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
const image = [...await readFile(new URL('./fixtures/black-frame.png', import.meta.url))];
const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
  executablePath: process.env.LOCUS_CHROME_PATH, headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const externalRequests = [];
  await context.route(/^https:\/\//, route => { externalRequests.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic original source</h1>' }); });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const url = `chrome-extension://${new URL(worker.url()).host}/results.html`;
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => { navigator.clipboard.writeText = async text => { globalThis.__copiedMetadata = text; }; });
  await page.goto(url); await page.getByText('No captures yet', { exact: true }).waitFor();
  const fixtures = await page.evaluate(async image => {
    const createdAt = '2026-09-27T10:00:00Z', publishedAt = '2026-09-26T09:00:00Z';
    const twitter = { id: crypto.randomUUID(), site: 'twitter', label: '@fieldnotes · 1979876543210987654', sourceUrl: 'https://x.com/fieldnotes/status/1979876543210987654', createdAt, revision: 1, retention: { state: 'retained', revision: 1 }, records: [{ id: 'post', assetIds: ['image', 'missing'], acquisition: { state: 'acquired' }, payload: { schema: 'twitter-post/1', fullText: 'A quiet moment, retained with its original context.', sourceId: '1979876543210987654', author: { username: 'fieldnotes', displayName: 'Avery Park', accountId: '9007199254740993123' }, publishedAt, observedAt: createdAt, customRetainedField: 'Preserved in full JSON' } }], assets: [
      { id: 'image', recordId: 'post', description: { sourceDimensions: { width: 320, height: 180 } }, acquisition: { state: 'acquired' }, mime: 'image/png', size: image.length },
      { id: 'missing', recordId: 'post', description: {}, acquisition: { state: 'unavailable', reason: 'Synthetic HTTP 503' } },
    ] };
    const bilibili = { id: crypto.randomUUID(), site: 'bilibili', label: 'Field journal · P2', sourceUrl: 'https://www.bilibili.com/video/BV145PxzCEoE/?p=2', createdAt, revision: 1, retention: { state: 'retained', revision: 1 }, records: [{ id: 'part', assetIds: ['missing-bytes'], acquisition: { state: 'acquired' }, payload: { schema: 'bilibili-part/1', title: 'A field journal: light and motion', description: 'The second part of a retained video.', uploader: { id: '123456', name: 'Field Studio' }, source: { bvid: 'BV145PxzCEoE', aid: '116182891959963', cid: '36531930223' }, part: { index: 2, name: 'A long descriptive part name '.repeat(5), duration: 123.5, durationPrecision: 'playinfo' }, representation: { quality: 64, qualityLabel: '720p', width: 1280, height: 720, videoCodec: 'avc1.64001f', audioAbsent: true, audioCodec: null }, publishedAt, observedAt: createdAt } }], assets: [{ id: 'missing-bytes', recordId: 'part', description: {}, acquisition: { state: 'acquired' }, mime: 'video/mp4', size: 4096 }] };
    const unknown = { ...twitter, id: crypto.randomUUID(), label: 'Unknown source metadata', sourceUrl: 'javascript:alert(1)', records: [{ id: 'unknown', assetIds: [], acquisition: { state: 'acquired' }, payload: { schema: 'future/1', extra: { retained: true } } }], assets: [] };
    const invalid = { ...twitter, id: crypto.randomUUID(), label: 'Invalid author identity', records: [{ ...twitter.records[0], assetIds: [], payload: { ...twitter.records[0].payload, author: { username: 'evil.test/path?target=other', displayName: 'Unverified author' } } }], assets: [] };
    const fixtures = [twitter, bilibili, unknown, invalid];
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('locus-results-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['results', 'blobs'], 'readwrite');
    for (const result of fixtures) tx.objectStore('results').put(result, result.id);
    tx.objectStore('blobs').put(new Blob([new Uint8Array(image)], { type: 'image/png' }), [twitter.id, 'image']);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
    return fixtures;
  }, image);
  await page.reload();
  const open = async fixture => { await page.goto(`${url}#${fixture.id}`); await page.getByRole('heading', { name: fixture.label, exact: true }).waitFor(); };
  const popupFor = async locator => {
    const expected = await locator.getAttribute('href');
    const [popup] = await Promise.all([page.waitForEvent('popup'), locator.click()]);
    await popup.waitForURL(expected, { waitUntil: 'domcontentloaded' }).catch(error => { throw new Error(`Expected ${expected}; opened ${popup.url()}; requests ${JSON.stringify(externalRequests)}`, { cause: error }); }); await popup.close();
    assert.equal(await page.getByRole('tab', { name: 'Preview', exact: true }).getAttribute('aria-selected'), 'true');
  };
  const metadata = async () => {
    const tab = page.getByRole('tab', { name: 'Metadata', exact: true });
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
  };
  await open(fixtures[0]);
  await page.locator('img').evaluate(image => image.decode());
  const author = page.getByRole('link', { name: 'Open author profile', exact: true });
  assert.equal(await author.getAttribute('href'), 'https://x.com/fieldnotes');
  const original = page.getByRole('link', { name: 'Open original post', exact: true });
  assert.equal(await original.getAttribute('href'), fixtures[0].sourceUrl);
  assert.deepEqual(externalRequests, [], 'Opening retained previews does not fetch original content');
  await page.screenshot({ path: path.join(work, 'twitter-preview-links.png'), animations: 'disabled' });
  await popupFor(author); await popupFor(original);
  await metadata();
  await page.getByRole('heading', { name: 'Capture overview', exact: true }).waitFor();
  assert.equal(await page.locator('[data-capture-json]').count(), 0, 'Full JSON is collapsed by default');
  await page.getByRole('region', { name: 'Source records' }).getByText('9007199254740993123', { exact: true }).waitFor();
  await page.getByText('File acquisition details', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  const copied = JSON.parse(await page.evaluate(() => __copiedMetadata));
  assert.deepEqual(copied.result, fixtures[0], 'Copy preserves every retained field and exact identifier');
  await page.getByText('Full JSON', { exact: true }).click();
  assert.deepEqual(JSON.parse(await page.locator('[data-capture-json]').textContent()), copied);
  await page.getByText('Full JSON', { exact: true }).click();
  for (const close of await page.getByRole('button', { name: 'Close toast', exact: true }).all()) await close.click();
  await page.waitForFunction(() => !document.querySelector('[data-slot="toast"]'));
  await page.getByRole('heading', { name: 'Capture metadata', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(work, 'twitter-metadata.png'), animations: 'disabled' });
  await open(fixtures[1]);
  assert.equal(await page.getByRole('link', { name: 'Open uploader profile', exact: true }).getAttribute('href'), 'https://space.bilibili.com/123456');
  assert.equal(await page.getByRole('link', { name: 'Open original video', exact: true }).getAttribute('href'), fixtures[1].sourceUrl);
  await page.getByText(/720p · 1280×720 · No audio/).waitFor();
  await metadata();
  await page.getByText('No audio in source', { exact: true }).waitFor();
  await page.getByText('File read failed', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(work, 'bilibili-metadata.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(work, 'metadata-mobile.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('link', { name: 'Open uploader profile', exact: true }).focus();
  await page.screenshot({ path: path.join(work, 'preview-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(fixtures[2]);
  assert.equal(await page.getByRole('link', { name: /Open original/ }).count(), 0, 'Unsafe source URL is not clickable');
  await page.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await page.getByText('No supported source summary.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  assert.deepEqual(JSON.parse(await page.evaluate(() => __copiedMetadata)).result, fixtures[2]);
  await open(fixtures[3]);
  assert.equal(await page.getByRole('link', { name: 'Open author profile', exact: true }).count(), 0);
  await page.getByText('Unverified author', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', work, checks: ['Twitter/Bilibili author and original links', 'Explicit navigation without background source requests', 'Grouped metadata with exact JSON copy', 'Missing bytes, unsupported schemas and invalid identities', 'Desktop/mobile layout and keyboard focus'] }, null, 2));
} catch (error) { console.error(`Inspector artifacts: ${work}`); throw error; }
finally { await context.close(); }
