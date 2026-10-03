/** Controlled-delay benchmark of the built producer in disposable real Chrome.
 * The loopback receiver is a protocol fixture, not a throughput benchmark of Locus. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const member = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert(process.env.LOCUS_CHROME_PATH, 'Set LOCUS_CHROME_PATH to isolated Chrome for Testing');
const work = await mkdtemp(path.join(tmpdir(), 'locus-capture-performance-'));
const extension = path.join(work, 'extension');
await cp(path.join(member, '.output/chrome-mv3'), extension, { recursive: true });
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = manifest.optional_host_permissions;
await writeFile(manifestPath, JSON.stringify(manifest));
const image = await readFile(path.join(member, 'testing/fixtures/black-frame.png'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, label) {
  const deadline = Date.now() + 30_000;
  do { const value = await read(); if (predicate(value)) return value; await pause(10); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
function source(id, count) {
  const records = {};
  const put = (key, type, fields) => (records[key] = { __id: key, __typename: type, ...fields }, { __ref: key });
  const core = put('core', 'TweetCore', { user_results: put('users', 'UserResults', { result: put('author', 'User', { rest_id: '123', core: put('author-core', 'UserCore', { screen_name: 'synthetic', name: 'Synthetic' }) }) }) });
  const details = put('details', 'TBirdData', { full_text: `Synthetic performance post ${id}`, created_at_ms: 1711047760000, hashtag_entities: { __refs: [] } });
  const media = Array.from({ length: count }, (_, index) => {
    const key = `image${index}`;
    put(key, 'ApiMediaEntity', { id_str: String(1001 + index), type: 'photo', source_status_id_str: null, media_url_https: `https://pbs.twimg.com/media/benchmark-${id}-${index}.png` });
    return key;
  });
  put('root', 'TweetResults', { rest_id: id, result: put('tweet', 'Tweet', { rest_id: id, core, details, legacy: put('legacy', 'LegacyTweet', { retweeted_status_results: null }), article: null, note_tweet: null, media_entities2: { __refs: media }, reply_to_results: null, quoted_tweet_results: null, mention_entities: { __refs: [] }, url_entities: { __refs: [] } }) });
  return `<html><script>window.fixture={dehydratedData:{relayRecords:${JSON.stringify(records)}}};</script></html>`;
}

const tasks = new Map(), batches = [], uploadStarts = new Map();
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1'), parts = url.pathname.split('/');
    let data;
    if (url.pathname.endsWith('/bootstrap')) data = { run_id: 'benchmark-run' };
    else if (request.method === 'POST') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const requestId = url.searchParams.get('request_id') ?? JSON.parse(Buffer.concat(chunks).toString()).request_id;
      const taskId = `task-${tasks.size}`;
      if (url.pathname.endsWith('/uploads')) {
        const filename = url.searchParams.get('filename'), resultId = filename.slice(0, filename.indexOf('-media-'));
        if (!uploadStarts.has(resultId)) uploadStarts.set(resultId, performance.now());
        tasks.set(taskId, { ready: Date.now() + 300, outcome: { status: 'upload', result: { confirmed_file_id: `file-${tasks.size}`, uncertain: false, actions: [] } } });
      } else {
        const input = JSON.parse(Buffer.concat(chunks).toString()), batchId = `batch-${batches.length}`;
        batches.push({ batch_id: batchId, original_request_id: requestId, original_ended: true, items: input.items.map((_, index) => ({ current: { overall: 'success', complete: true, confirmed_entity_id: `${batchId}-${index}` } })) });
        tasks.set(taskId, { ready: Date.now(), outcome: { status: 'import_batch', batch_id: batchId } });
      }
      data = { status: 'accepted', receipt: { run_id: 'benchmark-run', request_id: requestId, task_id: taskId } };
    } else if (parts.at(-1) === 'outcome') {
      const task = tasks.get(parts.at(-2));
      data = Date.now() < task.ready ? { status: 'pending' } : { status: 'complete', outcome: task.outcome };
    } else if (url.pathname.endsWith('/import-batches')) data = { run_id: 'benchmark-run', batches };
    else data = { tasks: [] };
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
  } catch (error) { response.writeHead(500).end(String(error)); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let context;
try {
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { executablePath: process.env.LOCUS_CHROME_PATH, headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/results.html`);
  await page.evaluate(async connection => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('locus-results-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(connection, 'locus'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  }, { origin: `http://127.0.0.1:${server.address().port}`, token: 'disposable-benchmark-token' });
  const cdp = await context.browser().newBrowserCDPSession();
  const target = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(target => target.url.endsWith('/offscreen.html')), Boolean, 'offscreen owner');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let sequence = 0; const pending = new Map(), mediaStarts = new Map(), errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
  });
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (message.id) { const receiver = pending.get(message.id); pending.delete(message.id); if (message.error) receiver?.reject(new Error(message.error.message)); else receiver?.resolve(message.result); }
    if (message.method === 'Fetch.requestPaused') void (async () => {
      const request = message.params, url = new URL(request.request.url), isSource = url.hostname === 'x.com';
      const id = isSource ? url.pathname.split('/').at(-1) : /benchmark-(\d+)-/.exec(url.pathname)[1];
      if (!isSource) { const values = mediaStarts.get(id) ?? []; values.push(performance.now()); mediaStarts.set(id, values); }
      await pause(isSource ? 100 : 400);
      const body = isSource ? Buffer.from(source(id, id === '601' ? 4 : 1)) : image;
      await send('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: isSource ? 'text/html' : 'image/png' }, { name: 'Content-Length', value: String(body.length) }], body: body.toString('base64') });
    })().catch(error => errors.push(String(error)));
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://x.com/*' }, { urlPattern: 'https://pbs.twimg.com/*' }] });
  const command = (op, values = {}) => worker.evaluate(async ({ op, values }) => { const reply = await chrome.runtime.sendMessage({ target: 'offscreen', op, ...values }); if (!reply.ok) throw new Error(reply.error); return reply.value; }, { op, values });
  await until(() => command('hello').catch(() => null), Boolean, 'ready execution owner');
  const rows = store => page.evaluate(async store => {
    const db = await new Promise(resolve => { const request = indexedDB.open('locus-results-v1'); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise(resolve => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); }); } finally { db.close(); }
  }, store);
  async function inspect(id) {
    const start = performance.now(); const candidate = await command('inspect', { url: `https://x.com/synthetic/status/${id}`, owner: 'benchmark-document' });
    return { id, candidate, sourceMs: performance.now() - start };
  }
  async function begin(input) {
    const start = performance.now(); const result = await command('capture', { token: input.candidate.token, selected: input.candidate.media.map(media => media.id), owner: 'benchmark-document' });
    return { ...input, resultId: result.id, start };
  }
  async function finish(input) {
    const retained = await until(() => rows('results'), values => values.some(value => value.id === input.resultId && value.assets.every(asset => asset.acquisition.state === 'acquired') && value.retention.state === 'retained'), 'complete retained capture');
    const retainedAt = performance.now();
    const saved = await until(() => rows('locus-transfers'), values => values.some(value => value.resultId === input.resultId && value.state === 'complete'), 'complete fixture delivery');
    const starts = mediaStarts.get(input.id);
    assert.equal(retained.find(value => value.id === input.resultId).assets.length, starts.length);
    assert.equal(saved.find(value => value.resultId === input.resultId).uploads.length, starts.length);
    return { sourceMs: Math.round(input.sourceMs), firstMediaMs: Math.round(starts[0] - input.start), mediaStartSpreadMs: Math.round(starts.at(-1) - starts[0]), acquisitionAndRetentionMs: Math.round(retainedAt - input.start), firstUploadMs: Math.round(uploadStarts.get(input.resultId) - input.start), saveAfterRetentionMs: Math.round(performance.now() - retainedAt) };
  }
  const single = await finish(await begin(await inspect('601')));
  const inputs = []; for (const id of ['602', '603', '604']) inputs.push(await inspect(id));
  const accepted = []; for (const input of inputs) accepted.push(await begin(input));
  const queue = await Promise.all(accepted.map(finish));
  if (process.argv.includes('--verify-concurrency')) {
    assert(single.mediaStartSpreadMs < 800, 'Four downloads should overlap in two pairs');
    assert(mediaStarts.get('604')[0] < uploadStarts.get(accepted[0].resultId) + 750, 'A later capture should start before an earlier save finishes');
    assert.equal(tasks.size, 11, 'Concurrency must not duplicate uploads or imports');
  }
  assert.deepEqual(errors, []);
  const evidence = { status: 'PASS', conditions: { sourceDelayMs: 100, mediaDelayMs: 400, uploadPendingMs: 300, pollMs: 750 }, fourImages: single, threeCaptures: queue, work };
  await writeFile(path.join(work, 'timings.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
