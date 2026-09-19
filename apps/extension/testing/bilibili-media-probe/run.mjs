/** Manual feasibility evidence only; never builds into the product extension. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { BlobReader, ZipReader, Uint8ArrayWriter, TextWriter } from '@zip.js/zip.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const chromePath = process.env.LOCUS_CHROME_PATH;
if (!chromePath) throw new Error('Set LOCUS_CHROME_PATH to Chrome for Testing');
const work = await mkdtemp(path.join(tmpdir(), 'locus-bilibili-media-probe-'));
const extension = path.join(work, 'extension'); await mkdir(extension);
const evidence = { schema: 'bilibili-media-probe/1', candidate: 'Mediabunny 1.58.1 (MPL-2.0)', limits: { inputMiBPerTrack: 64, outputMiB: 160, durationSeconds: 600, packetsPerTrack: 100000, assemblyTimeoutSeconds: 120 }, cases: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeError = error => String(error?.message ?? error).replace(/https?:\/\/\S+/g, '[redacted URL]').slice(0, 3000);
const command = (name, args) => execFileSync(name, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const probe = file => JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'stream=index,codec_name,codec_type,start_time,duration,width,height,sample_rate,channels,extradata_hash,extradata_size,profile,level,pix_fmt,color_range,color_space,color_transfer,color_primaries:packet=stream_index,pts_time,dts_time,duration_time,size,data_hash,flags', '-of', 'json', file]));
const decodedCache = new Map();
function decodedVideo(file) {
  if (!decodedCache.has(file)) {
    const output = command('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-f', 'framehash', '-hash', 'sha256', '-']);
    const frames = output.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
    decodedCache.set(file, { frames: frames.length, orderedFrameHash: hash(frames.join('\n')) });
  }
  return decodedCache.get(file);
}
const syntheticVideo = path.join(work, 'synthetic-video.mp4'), syntheticAudio = path.join(work, 'synthetic-audio.mp4');
command('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '3', '-c:v', 'libx264', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-an', '-movflags', '+faststart', syntheticVideo]);
command('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:a', 'aac', '-b:a', '128k', '-vn', '-movflags', '+faststart', syntheticAudio]);
const unspecifiedColor = path.join(work, 'unspecified-color.mp4');
command('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '3', '-c:v', 'libx264', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', unspecifiedColor]);
const originalVideo = await readFile(syntheticVideo); const truncated = path.join(work, 'truncated.mp4'); await writeFile(truncated, originalVideo.subarray(0, Math.floor(originalVideo.length / 2)));
const cases = [{ name: 'synthetic-avc-aac', video: syntheticVideo, audio: syntheticAudio, expectedDuration: 3 }, { name: 'diagnostic-unspecified-color', video: unspecifiedColor, audio: syntheticAudio, expectedDuration: 3 }];
if (process.env.LOCUS_PROBE_VIDEO || process.env.LOCUS_PROBE_AUDIO) {
  assert(process.env.LOCUS_PROBE_VIDEO && process.env.LOCUS_PROBE_AUDIO, 'Both local track paths are required');
  cases.push({ name: 'real-local', video: process.env.LOCUS_PROBE_VIDEO, audio: process.env.LOCUS_PROBE_AUDIO, expectedDuration: Number(process.env.LOCUS_PROBE_DURATION) });
}
let privateConfig;
const urlOrigins = new Set();
if (process.env.LOCUS_PROBE_URL_CONFIG) {
  try {
    assert((await stat(process.env.LOCUS_PROBE_URL_CONFIG)).size <= 16384);
    privateConfig = JSON.parse(await readFile(process.env.LOCUS_PROBE_URL_CONFIG, 'utf8'));
    for (const key of ['videoUrl', 'audioUrl']) { assert(typeof privateConfig[key] === 'string' && privateConfig[key].length <= 2048); const url = new URL(privateConfig[key]); assert(url.protocol === 'https:' && !url.username && !url.password); urlOrigins.add(`${url.origin}/*`); }
  } catch { throw new Error('Invalid private URL configuration (redacted)'); }
}
const files = new Map(); const uploads = new Map(); const token = randomUUID();
const server = createServer(async (request, response) => {
  try {
    const key = request.url;
    if (request.method === 'GET' && files.has(key)) { const file = files.get(key); const bytes = await readFile(file); response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length }); response.end(bytes); return; }
    if (request.method === 'POST' && uploads.has(key)) { const chunks = []; let length = 0; for await (const chunk of request) { length += chunk.length; if (length > 170 * 1024 * 1024) throw new Error('Upload limit'); chunks.push(chunk); } await writeFile(uploads.get(key), Buffer.concat(chunks)); response.end('ok'); return; }
    response.writeHead(404); response.end();
  } catch { response.writeHead(500); response.end('Probe transfer failed'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
async function expose(file, name) { assert((await stat(file)).size <= 64 * 1024 * 1024, 'Input exceeds probe byte limit'); const route = `/${token}/${name}`; files.set(route, file); return origin + route; }
let context;
try {
  await build({ configFile: false, root: here, logLevel: 'silent', build: { outDir: extension, emptyOutDir: false, minify: false, rolldownOptions: { input: { worker: path.join(here, 'worker.ts'), offscreen: path.join(here, 'offscreen.ts'), viewer: path.join(here, 'viewer.ts') }, preserveEntrySignatures: 'strict', output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', strictExecutionOrder: true } } } });
  for (const name of ['offscreen', 'viewer']) await writeFile(path.join(extension, `${name}.html`), `<!doctype html><meta charset="UTF-8"><title>Disposable media probe</title><script type="module" src="${name}.js"></script>`);
  await copyFile(path.join(here, '../../node_modules/mediabunny/LICENSE'), path.join(extension, 'Mediabunny-LICENSE.txt')).catch(async () => { await copyFile(path.join(here, '../../node_modules/mediabunny/LICENSE.txt'), path.join(extension, 'Mediabunny-LICENSE.txt')); });
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Disposable Bilibili media feasibility probe', version: '0.0.0', permissions: ['offscreen', 'unlimitedStorage', ...(privateConfig ? ['declarativeNetRequestWithHostAccess'] : [])], host_permissions: ['http://127.0.0.1/*', ...urlOrigins], background: { service_worker: 'worker.js', type: 'module' } }));
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { executablePath: chromePath, headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  evidence.browser = context.browser().version(); evidence.node = process.version;
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'); const id = new URL(worker.url()).host;
  const page = await context.newPage(); await page.goto(`chrome-extension://${id}/viewer.html`); await page.waitForFunction(() => !!globalThis.probe);
  const createOffscreen = () => worker.evaluate(() => chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Bounded encoded-track assembly and Blob retention feasibility probe' }));
  async function execute(item, videoUrl, audioUrl) {
    await createOffscreen(); const resultId = randomUUID();
    const assembled = await Promise.race([page.evaluate(args => globalThis.probe.assemble(args), { id: resultId, video: videoUrl, audio: audioUrl, expectedDuration: item.expectedDuration }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Probe host deadline exceeded')), 130000); timer.unref(); })]);
    await worker.evaluate(() => chrome.offscreen.closeDocument());
    if (!assembled.ok) return { name: item.name, assembly: assembled, status: 'unsupported-or-failed' };
    assert(assembled.offscreen); const out = path.join(work, item.name); await mkdir(out);
    for (const name of ['output.mp4', 'export.zip']) uploads.set(`/${token}/${item.name}/${name}`, path.join(out, name));
    const reopened = await page.evaluate(args => globalThis.probe.reopen(args.id, args.endpoint), { id: resultId, endpoint: `${origin}/${token}/${item.name}` });
    assert.equal(reopened.retention.state, 'retained'); assert.deepEqual(reopened.readErrors, {});
    const playback = await page.evaluate(async () => {
      const video = document.querySelector('video'); const deadline = Date.now() + 15000;
      while (video.readyState < 2) { if (video.error) throw new Error(`Playback failed (${video.error.code})`); if (Date.now() > deadline) throw new Error('Playback readiness timeout'); await new Promise(resolve => setTimeout(resolve, 50)); }
      await video.play(); await new Promise(resolve => setTimeout(resolve, 800)); video.pause(); const startTime = video.currentTime;
      const seekChecks = [];
      for (const time of [video.duration / 2, Math.max(0, video.duration - .5)]) {
        await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Seek timeout')), 10000); video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true }); video.currentTime = time; });
        const before = video.getVideoPlaybackQuality().totalVideoFrames; await video.play(); await new Promise(resolve => setTimeout(resolve, 200)); video.pause();
        seekChecks.push({ requestedTime: time, currentTime: video.currentTime, newDecodedFrames: video.getVideoPlaybackQuality().totalVideoFrames - before });
      }
      return { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight, currentTime: startTime, duration: video.duration, decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames, audioDecodedBytes: video.webkitAudioDecodedByteCount ?? null, seekChecks };
    });
    assert(playback.width > 0 && playback.height > 0 && playback.currentTime > .2 && playback.decodedFrames > 0);
    assert(playback.seekChecks.every(check => check.newDecodedFrames > 0 && check.currentTime >= check.requestedTime));
    await page.screenshot({ path: path.join(out, 'playback.png') });
    const output = await readFile(path.join(out, 'output.mp4')); const zip = new ZipReader(new BlobReader(new Blob([await readFile(path.join(out, 'export.zip'))])));
    const entries = await zip.getEntries(); const metadata = JSON.parse(await entries.find(e => e.filename === 'metadata.json').getData(new TextWriter())); const row = JSON.parse((await entries.find(e => e.filename === 'records.jsonl').getData(new TextWriter())).trim());
    const exported = await entries.find(e => e.filename === metadata.files[0].path).getData(new Uint8ArrayWriter());
    assert.equal(hash(exported), hash(output)); assert.equal(row.files[0].path, metadata.files[0].path); assert.equal(row.record.assetIds[0], 'video'); await zip.close();
    const tracks = [];
    for (const [kind, input] of [['video', item.video], ['audio', item.audio]]) {
      const source = probe(input), target = probe(path.join(out, 'output.mp4')); const ss = source.streams.find(s => s.codec_type === kind), ts = target.streams.find(s => s.codec_type === kind);
      const a = source.packets.filter(p => p.stream_index === ss.index), b = target.packets.filter(p => p.stream_index === ts.index);
      const packetHashesEqual = a.length === b.length && a.every((p, i) => p.data_hash === b[i].data_hash);
      const delta = field => a.length === b.length ? Math.max(...a.map((p, i) => Math.abs(Number(p[field]) - Number(b[i][field])))) : null;
      const dtsDeltas = a.length === b.length ? a.map((p, i) => Number(b[i].dts_time) - Number(p.dts_time)) : [];
      const track = { kind, codec: ts.codec_name, codecEqual: ss.codec_name === ts.codec_name, decoderConfigHashEqual: !!ss.extradata_hash && ss.extradata_hash === ts.extradata_hash, sourcePackets: a.length, outputPackets: b.length, packetHashesEqual, sourcePacketHash: hash(a.map(p => p.data_hash).join('\n')), outputPacketHash: hash(b.map(p => p.data_hash).join('\n')), maxPtsDelta: delta('pts_time'), maxDtsDelta: delta('dts_time'), dtsShiftMin: Math.min(...dtsDeltas), dtsShiftMax: Math.max(...dtsDeltas), maxDurationDelta: delta('duration_time'), sourceStart: ss.start_time, outputStart: ts.start_time, sourceDuration: ss.duration, outputDuration: ts.duration, reorderedSource: a.some((p, i) => i > 0 && Number(p.pts_time) < Number(a[i - 1].pts_time)) };
      const keys = ['profile', 'level', 'pix_fmt', 'color_range', 'color_space', 'color_transfer', 'color_primaries', 'width', 'height', 'sample_rate', 'channels'];
      track.sourceAttributes = Object.fromEntries(keys.map(key => [key, ss[key] ?? null])); track.outputAttributes = Object.fromEntries(keys.map(key => [key, ts[key] ?? null]));
      track.attributesEqual = JSON.stringify(track.sourceAttributes) === JSON.stringify(track.outputAttributes);
      track.sourceConfigurationBytes = ss.extradata_size; track.outputConfigurationBytes = ts.extradata_size;
      tracks.push(track);
    }
    command('ffmpeg', ['-v', 'error', '-xerror', '-i', path.join(out, 'output.mp4'), '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
    const sourceFrames = decodedVideo(item.video), outputFrames = decodedVideo(path.join(out, 'output.mp4')); const decodedFramesEqual = sourceFrames.frames === outputFrames.frames && sourceFrames.orderedFrameHash === outputFrames.orderedFrameHash;
    const preserved = decodedFramesEqual && tracks.every(t => t.packetHashesEqual && t.codecEqual && t.maxPtsDelta < .002 && t.dtsShiftMax - t.dtsShiftMin < .002 && t.maxDurationDelta < .002);
    const rebased = tracks.some(t => t.maxDtsDelta >= .002);
    const configurationRewritten = tracks.some(t => !t.decoderConfigHashEqual);
    const metadataNormalized = tracks.some(t => !t.attributesEqual);
    return { name: item.name, status: preserved ? configurationRewritten ? 'configuration-rewrite-observed' : metadataNormalized ? 'metadata-normalization-observed' : rebased ? 'pass-with-dts-rebase' : 'pass' : 'timing-or-packet-gap', assembly: assembled, reopened, playback, completeExternalDecode: true, decodedFramesEqual, sourceFrames, outputFrames, outputSha256: hash(output), archiveBytesEqual: true, tracks };
  }
  for (const item of cases) {
    assert(item.expectedDuration > 0 && item.expectedDuration <= 600, 'Expected duration must be in (0,600]');
    try { evidence.cases.push(await execute(item, await expose(item.video, item.name + '-video'), await expose(item.audio, item.name + '-audio'))); }
    catch (error) { evidence.cases.push({ name: item.name, status: 'failed', error: safeError(error) }); await worker.evaluate(() => chrome.offscreen.closeDocument()).catch(() => {}); }
  }
  for (const name of ['missing-audio', 'truncated-input', 'cancellation']) {
    await createOffscreen(); const resultId = randomUUID();
    const args = { id: resultId, expectedDuration: 3, video: await expose(name === 'truncated-input' ? truncated : syntheticVideo, name + '-video'), audio: name === 'missing-audio' ? undefined : await expose(syntheticAudio, name + '-audio'), slow: name === 'cancellation' };
    const pending = page.evaluate(args => globalThis.probe.assemble(args), args);
    if (name === 'cancellation') { await new Promise(resolve => setTimeout(resolve, 100)); await page.evaluate(() => globalThis.probe.cancel()); }
    const result = await pending; assert.equal(result.ok, false); assert.equal(await page.evaluate(id => globalThis.probe.exists(id), resultId), false);
    evidence.cases.push({ name, status: 'pass', rejected: result.error, retainedCompleteAsset: false }); await worker.evaluate(() => chrome.offscreen.closeDocument());
  }
  if (privateConfig) {
    // Source page/referrer is deliberately unused: no copied headers or credentials.
    const item = cases.find(item => item.name === 'real-local');
    if (item) {
      try { evidence.cases.push(await execute({ ...item, name: 'extension-origin-fetch' }, privateConfig.videoUrl, privateConfig.audioUrl)); } catch (error) { evidence.cases.push({ name: 'extension-origin-fetch', status: 'failed', error: safeError(error) }); }
      if (!evidence.cases.at(-1).assembly?.ok) {
        await worker.evaluate(() => chrome.offscreen.closeDocument()).catch(() => {});
        const urls = [privateConfig.videoUrl, privateConfig.audioUrl];
        const rules = urls.map((url, index) => ({ id: index + 1, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://www.bilibili.com/' }] }, condition: { regexFilter: '^' + url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', isUrlFilterCaseSensitive: true, requestDomains: [new URL(url).hostname], initiatorDomains: [id], requestMethods: ['get'], resourceTypes: ['xmlhttprequest'] } }));
        try {
          await worker.evaluate(rules => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1, 2], addRules: rules }), rules).catch(() => { throw new Error('Scoped temporary Referer rule setup failed'); });
          evidence.cases.push({ ...await execute({ ...item, name: 'extension-fetch-fixed-referer' }, privateConfig.videoUrl, privateConfig.audioUrl), temporaryExactUrlRules: 2, fixedReferer: 'https://www.bilibili.com/' });
        } catch (error) { evidence.cases.push({ name: 'extension-fetch-fixed-referer', status: 'failed', error: safeError(error) }); }
        finally {
          await worker.evaluate(() => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1, 2] }));
          const remaining = await worker.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length); assert.equal(remaining, 0); evidence.remainingSessionRules = remaining;
        }
      }
    }
    else evidence.cases.push({ name: 'extension-origin-fetch', status: 'not-run', reason: 'Local reference files required for independent comparison' });
  }
} catch (error) { evidence.fatal = safeError(error); }
finally { await context?.close(); await new Promise(resolve => server.close(resolve)); await writeFile(path.join(work, 'evidence.json'), JSON.stringify(evidence, null, 2)); }
console.log(JSON.stringify({ evidence: path.join(work, 'evidence.json'), cases: evidence.cases.map(({ name, status }) => ({ name, status })), fatal: evidence.fatal }));
if (evidence.fatal || evidence.cases.some(item => item.name.startsWith('synthetic') && !item.status.startsWith('pass'))) process.exitCode = 1;
