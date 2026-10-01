/** Production Bilibili pipeline in a disposable profile; all network content is synthetic. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { BlobReader, ZipReader, TextWriter, Uint8ArrayWriter } from '@zip.js/zip.js';
import { bilibiliListingFixture, verifyBilibiliControls, verifyWatchlaterPlayer } from './bilibili-controls-smoke.mjs';
import { bilibiliNativeFixture } from './bilibili-native-fixture.mjs';
import { installBilibiliProgressFixture, verifyBilibiliProgress } from './bilibili-progress-smoke.mjs';
const member = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = process.env.LOCUS_CHROME_PATH; if (!executablePath) throw new Error('Set LOCUS_CHROME_PATH');
const work = await mkdtemp(path.join(tmpdir(), 'locus-bilibili-capture-')), extension = path.join(work, 'extension'), downloads = path.join(work, 'downloads');
await cp(path.join(member, '.output/chrome-mv3'), extension, { recursive: true }); await mkdir(downloads);
const manifestPath = path.join(extension, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.host_permissions, undefined); assert.equal(manifest.content_scripts, undefined);
manifest.host_permissions = manifest.optional_host_permissions; await writeFile(manifestPath, JSON.stringify(manifest));
await installBilibiliProgressFixture(extension);
// Event injection is restricted to the disposable worker copy; effective-grant checks stay real.
const backgroundPath = path.join(extension, 'background.js'); await writeFile(backgroundPath, `{const add=chrome.permissions.onRemoved.addListener.bind(chrome.permissions.onRemoved);globalThis.fixtureRemoval=[];chrome.permissions.onRemoved.addListener=f=>{fixtureRemoval.push(f);add(f);};}\n` + await readFile(backgroundPath, 'utf8'));
const cmd = (name, args) => execFileSync(name, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 64 * 1048576, stdio: ['ignore', 'pipe', 'pipe'] });
function assertPresentationTiming(before, after, kind) {
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    assert(Math.abs(Number(after[i].pts_time) - Number(before[i].pts_time)) <= .002, `${kind} packet ${i} PTS`);
    if (kind === 'audio') assert(Math.abs(Number(after[i].duration_time) - Number(before[i].duration_time)) <= .002, `audio packet ${i} duration`);
  }
  const last = packets => packets.reduce((last, packet) => Number(packet.pts_time) > Number(last.pts_time) ? packet : last);
  assert(Math.abs(Number(last(after).duration_time) - Number(last(before).duration_time)) <= .002, `${kind} final presentation duration`);
}
const frameHashes = file => cmd('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'framehash', '-']).split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
const videoFile = path.join(work, 'video.mp4'), audioFile = path.join(work, 'audio.mp4');
cmd('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-t', '3', '-c:v', 'libx264', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-an', '-movflags', '+faststart', videoFile]);
cmd('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:a', 'aac', '-vn', '-movflags', '+faststart', audioFile]);
const video = await readFile(videoFile), audio = await readFile(audioFile), cover = await readFile(path.join(member, 'testing/fixtures/black-frame.png'));
const aspectMedia = new Map();
for (const [part, size, sar] of [[7, '1920x1070', '1070/1071'], [10, '320x180', '1001/1000']]) {
  const file = path.join(work, `aspect-${part}.mp4`);
  cmd('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`, '-vf', `setsar=${sar}:max=100000,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709`, '-t', '3', '-c:v', 'libx264', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-an', '-movflags', '+faststart', file]);
  const bytes = await readFile(file), avcc = bytes.indexOf(Buffer.from('avcC')); assert(avcc >= 0);
  const [width, height] = size.split('x').map(Number);
  aspectMedia.set(part, { file, bytes, width, height, sar: sar.replace('/', ':'), codec: 'avc1.' + bytes.subarray(avcc + 5, avcc + 8).toString('hex') });
}
// A shortened interval at a fragment boundary reproduces the demuxer's local
// versus whole-track presentation-duration mismatch without private media.
const vfrFile = path.join(work, 'vfr.mp4');
cmd('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-vf', 'settb=1/15360,setpts=PTS-if(gte(N\\,60)\\,256\\,0),setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-frames:v', '90', '-fps_mode', 'passthrough', '-enc_time_base', '1/15360', '-c:v', 'libx264', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-an', '-movflags', '+frag_keyframe+delay_moov+default_base_moof', vfrFile]);
const vfrBytes = await readFile(vfrFile), vfrAvcc = vfrBytes.indexOf(Buffer.from('avcC')); assert(vfrAvcc >= 0);
aspectMedia.set(11, { file: vfrFile, bytes: vfrBytes, width: 320, height: 180, sar: '1:1', codec: 'avc1.' + vfrBytes.subarray(vfrAvcc + 5, vfrAvcc + 8).toString('hex') });
const silentFile = process.env.LOCUS_BILI_SILENT_VIDEO ?? videoFile, silentBytes = await readFile(silentFile);
const silentInfo = JSON.parse(cmd('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', silentFile])).streams;
assert.equal(silentInfo.length, 1); assert.equal(silentInfo[0].codec_type, 'video');
const silentAvcc = silentBytes.indexOf(Buffer.from('avcC')); assert(silentAvcc >= 0);
aspectMedia.set(12, { file: silentFile, bytes: silentBytes, width: silentInfo[0].width, height: silentInfo[0].height, sar: '1:1', codec: 'avc1.' + silentBytes.subarray(silentAvcc + 5, silentAvcc + 8).toString('hex'), silent: true, duration: Number(silentInfo[0].duration) });
const unexpectedAudioFile = path.join(work, 'unexpected-audio.mp4');
cmd('ffmpeg', ['-v', 'error', '-i', videoFile, '-i', audioFile, '-c', 'copy', unexpectedAudioFile]);
const unexpectedAudio = await readFile(unexpectedAudioFile), audioRequests = [];
let real;
if(process.env.LOCUS_BILI_REAL_VIDEO&&process.env.LOCUS_BILI_REAL_AUDIO){
  const bytes=await readFile(process.env.LOCUS_BILI_REAL_VIDEO),sound=await readFile(process.env.LOCUS_BILI_REAL_AUDIO);assert(bytes.length<=64*1048576&&sound.length<=64*1048576);
  const info=JSON.parse(cmd('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',process.env.LOCUS_BILI_REAL_VIDEO])).streams[0];const avcc=bytes.indexOf(Buffer.from('avcC'));assert(avcc>=0);
  real={video:bytes,audio:sound,width:info.width,height:info.height,codec:'avc1.'+bytes.subarray(avcc+5,avcc+8).toString('hex'),duration:Number(process.env.LOCUS_BILI_REAL_DURATION??182.461)};
}
const bvid = 'BV145PxzCEoE', base = `https://www.bilibili.com/video/${bvid}/`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, label, ms = 40000) { const deadline = Date.now() + ms; let value; do { value = await read(); if (predicate(value)) return value; await pause(100); } while (Date.now() < deadline); throw new Error(`${label}: ${JSON.stringify(value)}`); }
let context, worker, resultPage, extensionId, sessionLogin = true, navRequests = 0, hold;
const checks = []; const routing = []; const renderErrors = [];
function fixture(p, watchlater = false) {
  const toolbar = ['like', 'coin', 'fav', 'share'].map((name, i) => `<div data-v-abc123="" class="toolbar-left-item-wrap"><div data-v-abc123="" class="video-${name} video-toolbar-left-item"><svg width="36" height="36" viewBox="0 0 36 36"><path d="M12 4h12v28H12Z"/></svg><span data-v-abc123="" class="video-toolbar-item-text">${i + 12}</span></div></div>`).join('');
  const cid = String(100000 + p), track = (id, codecs) => {
    const suffix = p === 7 ? '_qe1' : p === 2 && codecs.startsWith('avc1.') ? '_t6' : '';
    const pathname = `/upgcxcode/1/2/${cid}/${cid}${suffix}-1-${id}.m4s`, approved = `https://synthetic.bilivideo.com${pathname}`;
    return { id, codecs, bandwidth: id * 1000, width: 320, height: 180, baseUrl: p === 2 ? `https://synthetic.mcdn.bilivideo.cn:8082/v1/resource${pathname}` : approved,
      ...(p === 2 ? { backup_url: [`https://synthetic.edge.mountaintoys.cn:4483${pathname}`, approved] } : {}) };
  };
  const initial = { bvid, aid: '116182891959963', cid, p, videoData: { bvid, cid: '100001', title: 'Synthetic multipart source', desc: p === 6 ? 'excerpt' : 'Complete &amp; description', desc_v2: p === 6 ? [{ type: 2, raw_text: 'unsupported' }] : [{ type: 1, raw_text: 'Complete & description\n' }, { type: 2, raw_text: 'Synthetic collaborator', biz_id: 123 }, { type: 1, raw_text: 'Second line' }], owner: { mid: '123', name: 'Synthetic uploader' }, pubdate: 1710000000, pic: 'http://i0.hdslb.com/bfs/archive/synthetic.png', rights: { ugc_pay_preview: 0, is_stein_gate: 0, ugc_pay: 0 }, pages: Array.from({ length: 14 }, (_, i) => ({ page: i + 1, cid: String(100001 + i), duration: 3, part: `Synthetic part ${i + 1}` })) } };
  const play = { code: 0, data: { timelength: 3000, accept_quality: [64], support_formats: [{ quality: 64 }], dash: { video: [track(64, 'avc1.64000D')], audio: p === 3 ? [] : [track(30280, 'mp4a.40.2')] } } };
  if (aspectMedia.has(p)) { const media = aspectMedia.get(p); Object.assign(play.data.dash.video[0], { width: media.width, height: media.height, codecs: media.codec }); }
  if (p === 12 || p === 14) { Object.assign(play.data.dash, { audio: null, dolby: { type: 0, audio: null }, flac: null }); }
  if (p === 12) { const media = aspectMedia.get(p); initial.videoData.pages[p - 1].duration = Math.ceil(media.duration); play.data.timelength = media.duration * 1000; }
  if(p===8&&real){initial.videoData.pages[7].duration=Math.ceil(real.duration);play.data.timelength=real.duration*1000;Object.assign(play.data.dash.video[0],{width:real.width,height:real.height,codecs:real.codec});}
  return `<!doctype html><meta charset="UTF-8"><title>Synthetic Bilibili P${p}</title><style>body{font:16px sans-serif;margin:40px;background:#fafafa}#arc_toolbar_report,#playlistToolbar{display:flex;gap:20px;margin:32px 0}.video-toolbar-right{display:flex;align-items:center;margin-left:auto}.video-toolbar-right-item{display:flex;align-items:center;gap:6px;height:24px}.video-toolbar-left-main{display:flex;align-items:center}.toolbar-left-item-wrap{margin-right:18px}.video-toolbar-left-item{display:flex;align-items:center;gap:6px;width:100px;height:36px}.video-toolbar-item-text{font:500 14px/28px sans-serif}main{height:1400px}</style><script>window.__INITIAL_STATE__=${JSON.stringify(initial)};document.currentScript.remove();</script><script>window.__playinfo__=${JSON.stringify(play)};</script><div id="app" data-server-rendered="true"><h1>${watchlater ? `<a href="${base}">Synthetic Bilibili P${p}</a>` : `Synthetic Bilibili P${p}`}</h1><input aria-label="Outside browsing input"><div id="${watchlater ? 'playlistToolbar' : 'arc_toolbar_report'}" class="video-toolbar-container"><div class="video-toolbar-left"><div class="video-toolbar-left-main">${toolbar}</div></div><div class="video-toolbar-right"><div data-v-abc123="" class="video-complaint video-toolbar-right-item"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 3 2 21h20Z"/></svg><span class="video-toolbar-item-text">稿件举报</span></div></div></div>${bilibiliNativeFixture(p, watchlater ? bvid : undefined)}<main>Independent page browsing</main></div>`;
}
async function rows() { return resultPage.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open('locus-results-v1'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; if (!db.objectStoreNames.contains('results')) { db.close(); resolve([]); return; } const tx = db.transaction('results'), req = tx.objectStore('results').getAll(); req.onsuccess = () => resolve(req.result); tx.oncomplete = () => db.close(); }; })); }
async function routeOwner() {
  const cdp = await context.browser().newBrowserCDPSession(); const target = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(t => t.url.endsWith('/offscreen.html')), Boolean, 'offscreen target');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }); let counter = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject }); cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject); });
  cdp.on('Target.receivedMessageFromTarget', event => { if (event.sessionId !== sessionId) return; const msg = JSON.parse(event.message); if (msg.id) { const request = pending.get(msg.id); pending.delete(msg.id); if (msg.error) request?.reject(new Error('Fixture CDP command failed')); else request?.resolve(msg.result); return; } if (msg.method !== 'Fetch.requestPaused') return; void (async () => {
    const req = msg.params, url = new URL(req.request.url); if (hold) await hold(url);
    const isCover = url.hostname.endsWith('.hdslb.com'), p = Number(url.pathname.split('/')[4]) - 100000, isAudio = url.pathname.includes('-30280.');
    if (isAudio) audioRequests.push(p);
    if (p === 13 && isAudio) { await send('Fetch.fulfillRequest', { requestId: req.requestId, responseCode: 503, body: '' }); return; }
    let body = isCover ? cover : p===8&&real?(isAudio?real.audio:real.video):isAudio ? audio : aspectMedia.get(p)?.bytes ?? video; if (p === 4 && !isAudio) body = body.subarray(0, Math.floor(body.length / 2));
    if (p === 14 && !isCover) body = unexpectedAudio;
    const headers = [{ name: 'Content-Type', value: isCover ? 'image/png' : 'application/octet-stream' }, { name: 'Content-Length', value: String(p === 5 && !isAudio ? 65 * 1048576 : body.length) }];
    await send('Fetch.fulfillRequest', { requestId: req.requestId, responseCode: 200, responseHeaders: headers, body: body.toString('base64') });
  })().catch(() => {}); });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.bilivideo.com/*' }, { urlPattern: 'https://*.hdslb.com/*' }] }); routing.push(cdp);
}
async function capture(p) {
  const page = await context.newPage(); await page.goto(`${base}?p=${p}`);
  await page.locator('#bilibili-player video').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-premature-capture'), 'false', 'No capture DOM before native bootstrap');
  const button = page.getByRole('button', { name: `Locus capture P${p}`, exact: true }); await button.waitFor();
  const before = (await rows()).length, navBefore = navRequests; await button.evaluate(button => button.click()); await pause(150); assert.equal(navRequests, navBefore); assert.equal((await rows()).length, before);
  await button.click(); await page.getByRole('button', { name: 'Expand capture queue', exact: true }).waitFor();
  const result = await until(rows, list => list.length > before, 'capture acceptance'); const row = result.find(row => row.sourceUrl.endsWith(`?p=${p}`) && !row.id.startsWith('old')) ?? result.at(-1);
  assert.equal(await page.getByRole('dialog').count(), 0); assert.equal((await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true })))[0].url, `${base}?p=${p}`);
  return { page, id: row.id };
}
try {
  context = await chromium.launchPersistentContext(path.join(work, 'profile'), { executablePath, headless: true, acceptDownloads: true, downloadsPath: downloads, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.on('page', page => page.on('pageerror', error => { if (/NotFoundError|removeChild/.test(String(error))) renderErrors.push(String(error)); }));
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'); extensionId = new URL(worker.url()).host;
  await context.route('https://www.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).pathname === '/' ? bilibiliListingFixture('home', base) : new URL(route.request().url()).pathname === '/v/popular/all' ? bilibiliListingFixture('generic', base) : fixture(Number(new URL(route.request().url()).searchParams.get('p') ?? 1)) }));
  await context.route('https://www.bilibili.com/watchlater/list', route => route.fulfill({ contentType: 'text/html', body: bilibiliListingFixture('watchlater', base) }));
  await context.route('https://www.bilibili.com/list/watchlater/**', route => route.fulfill({ contentType: 'text/html', body: fixture(Number(new URL(route.request().url()).searchParams.get('p') ?? 1), true) }));
  await context.route('https://www.bilibili.com/fixture-native.mp4*', route => route.fulfill({ contentType: 'video/mp4', body: video }));
  for (const [part, media] of aspectMedia) await context.route(`https://www.bilibili.com/fixture-aspect-${part}.mp4`, route => route.fulfill({ contentType: 'video/mp4', body: media.bytes }));
  await context.route('https://space.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: bilibiliListingFixture('favorites', base) }));
  await context.route('https://search.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: bilibiliListingFixture('search', base) }));
  await context.route('https://api.bilibili.com/x/web-interface/nav', route => { navRequests++; return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://www.bilibili.com', 'Access-Control-Allow-Credentials': 'true' }, body: JSON.stringify({ code: 0, data: { isLogin: sessionLogin, unrelatedAccount: 'not-selected' } }) }); });
  await until(() => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), values => values.some(value => value.id === 'locus-bilibili-main'), 'Bilibili source registration');
  resultPage = await context.newPage(); await resultPage.goto(`chrome-extension://${extensionId}/results.html`); await resultPage.getByText('No captures yet', { exact: true }).waitFor(); await routeOwner();
  const bootRevoked = await context.newPage(); await bootRevoked.goto(`${base}?p=8`);
  await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/bilibili.js'] });
    await chrome.tabs.sendMessage(tab.id, { target: 'page', op: 'revoke' }).catch(() => {});
  }, bootRevoked.url());
  await bootRevoked.locator('#bilibili-player video').waitFor();
  assert.equal(await bootRevoked.locator('[data-locus-bilibili-action]').count(), 0, 'Revocation cancels deferred mounting');
  await worker.evaluate(async url => { const [tab] = await chrome.tabs.query({ url }); await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/bilibili.js'] }); }, bootRevoked.url());
  await bootRevoked.getByRole('button', { name: 'Locus capture P8', exact: true }).waitFor();
  assert.equal(await bootRevoked.locator('[data-locus-bilibili-action]').count(), 1); await bootRevoked.close();
  checks.push('Revocation before native bootstrap cancels deferred controls; explicit reactivation mounts once');
  const success = await capture(2);await verifyBilibiliProgress(success.page,until,work);const complete = await until(rows, list => list.some(row => row.id === success.id && row.assets.every(asset => asset.acquisition.state !== 'pending')), 'terminal P2', 120000);assert(complete.find(row=>row.id===success.id).assets.every(asset=>asset.acquisition.state==='acquired'),JSON.stringify(complete));
  await until(()=>success.page.locator('[data-locus-bilibili-action="toolbar"]').getAttribute('data-state'),state=>state==='saved','complete local capture still requires a configured Locus connection');
  assert((await success.page.locator('[data-locus-bilibili-action="toolbar"]').getAttribute('aria-description')).includes('Configure Locus'));
  checks.push('Bilibili video/audio progress uses the shared ring; missing Locus connection is reported separately from complete local acquisition');
  const selected = complete.find(row => row.id === success.id); assert.equal(selected.records[0].payload.source.cid, '100002'); assert.equal(selected.records[0].payload.part.index, 2); assert.equal(selected.records[0].payload.description, 'Complete & description\n@Synthetic collaborator Second line'); assert.equal(JSON.stringify(selected).includes('unrelatedAccount'), false);
  assert.equal(selected.records[0].payload.representation.videoSource, 'https://synthetic.bilivideo.com/upgcxcode/1/2/100002/100002_t6-1-64.m4s');
  assert.equal(selected.records[0].payload.representation.audioSource, 'https://synthetic.bilivideo.com/upgcxcode/1/2/100002/100002-1-30280.m4s');
  checks.push('Suffixed video and unsuffixed audio preserve selected CID and exact mirror paths through source binding, approved CDN leases and byte acquisition');
  assert.equal(await success.page.evaluate(() => !!document.querySelector('script')?.textContent?.includes('__INITIAL_STATE__')), false);
  // Native toolbar presentation may arrive after hydration. Reuse its actual
  // icon geometry and label font without duplicating a second status badge.
  await success.page.locator('.video-complaint').evaluate(native => { native.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 3v18"/></svg><span class="video-toolbar-item-text" style="font:500 14px/28px sans-serif">Favorite</span>'; });
  await until(()=>success.page.evaluate(()=>{const button=document.querySelector('[data-locus-bilibili-action="toolbar"]'),native=document.querySelector('.video-complaint');return !!button&&button.querySelectorAll('svg').length===1&&getComputedStyle(button.querySelector('span')).font===getComputedStyle(native.querySelector('span')).font&&getComputedStyle(button.querySelector('svg')).width===getComputedStyle(native.querySelector('svg')).width;}),Boolean,'native toolbar typography and single matching icon');
  const nativeSlots=await success.page.locator('.video-toolbar-left-main > div').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {height:r.height,top:r.top,width:r.width};}));
  assert.equal(nativeSlots.length,4);assert(nativeSlots.every(slot=>slot.height===36&&slot.top===nativeSlots[0].top&&slot.width===nativeSlots[0].width),JSON.stringify(nativeSlots));
  assert.equal(await success.page.getByRole('button',{name:'Locus capture P2',exact:true}).locator('.video-toolbar-item-text').textContent(),'导入');
  await success.page.locator('.video-toolbar-right').evaluate(row=>{const replacement=row.cloneNode(true);replacement.querySelectorAll('[data-locus-bilibili]').forEach(slot=>slot.remove());row.replaceWith(replacement);});
  await success.page.getByRole('button',{name:'Locus capture P2',exact:true}).waitFor();
  assert.equal(await success.page.locator('[data-locus-bilibili-action="toolbar"]').count(),1);
  const placement=await success.page.locator('[data-locus-bilibili="toolbar"]').evaluate(slot=>{const report=slot.nextElementSibling,a=slot.querySelector('svg').getBoundingClientRect(),b=report.querySelector('svg').getBoundingClientRect();return {beforeReport:report.classList.contains('video-complaint'),offset:a.y+a.height/2-b.y-b.height/2};});assert.equal(placement.beforeReport,true);assert.ok(Math.abs(placement.offset)<.5);
  await success.page.evaluate(base=>{
    const recommendation=document.createElement('aside');recommendation.id='fixture-recommendation';
    recommendation.innerHTML=`<div class="framepreview-box" style="width:160px;height:90px"><a href="${base}?p=2" style="display:block"><img alt="Same part recommendation" width="160" height="90" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></a></div><a href="${base}?p=2">Title-only link</a>`;document.body.append(recommendation);
  },base);
  const recommended=success.page.locator('[data-locus-bilibili-action="cover"]');await until(()=>recommended.count(),count=>count===1,'video recommendation uses generic cover binding');
  await until(()=>recommended.getAttribute('data-state'),state=>state==='saved','toolbar and preview share the same Locus connection outcome');
  await success.page.locator('#fixture-recommendation .framepreview-box a').evaluate(link=>{link.href=link.href.replace('p=2','p=1');});
  await until(()=>recommended.getAttribute('data-state'),state=>state==='uncaptured','recommended different part has independent state');
  await success.page.locator('#fixture-recommendation').evaluate(node=>node.remove());await until(()=>recommended.count(),count=>count===0,'removed recommendation releases its control');
  checks.push('Toolbar is centered immediately before Report; video-page cover links use the same discovery as listings and share exact-part state without treating title links as cards');
  await success.page.getByRole('button', { name: 'Expand capture queue', exact: true }).click(); await success.page.getByRole('dialog').waitFor(); await success.page.keyboard.press('Escape'); await success.page.getByRole('dialog').waitFor({state:'hidden'}); await success.page.getByRole('textbox', { name: 'Outside browsing input' }).fill('still browsing'); await success.page.screenshot({ path: path.join(work, 'bilibili-nonmodal.png') });
  const playback = () => success.page.locator('#bilibili-player video').evaluate(video => ({ ready: video.readyState, frames: video.getVideoPlaybackQuality().totalVideoFrames, part: video.dataset.part, error: video.error?.message }));
  const beforeFrames = (await playback()).frames;
  await until(playback, value => value.ready >= 2 && value.frames > beforeFrames && !value.error, 'native video continues after retained capture');
  await success.page.getByRole('button', { name: 'Play native P1', exact: true }).click();
  await success.page.getByRole('button', { name: 'Locus capture P1', exact: true }).waitFor();
  await until(playback, value => value.part === '1' && value.ready >= 2 && value.frames > 0 && !value.error, 'native P1 playback after switch');
  assert.equal(new URL(success.page.url()).searchParams.get('p'), '1');
  assert.equal((await rows()).find(row => row.id === success.id).sourceUrl, `${base}?p=2`);
  await success.page.getByRole('button', { name: 'Play native P2', exact: true }).click();
  await success.page.getByRole('button', { name: 'Locus capture P2', exact: true }).waitFor();
  await until(playback, value => value.part === '2' && value.ready >= 2 && value.frames > 0 && !value.error, 'native P2 playback after switch back');
  await success.page.getByRole('button', { name: 'Play native P1', exact: true }).click();
  await success.page.getByRole('button', { name: 'Locus capture P1', exact: true }).waitFor();
  checks.push('Async native bootstrap sees no extension DOM; original video keeps decoding after capture, native P1/P2 switching updates playback and the next selection');
  await worker.evaluate(async url=>{const [tab]=await chrome.tabs.query({url});await chrome.tabs.sendMessage(tab.id,{target:'page',op:'revoke'}).catch(()=>{});},success.page.url());
  await until(()=>success.page.locator('[data-locus-bilibili-action]').count(),count=>count===0,'toolbar teardown');
  await worker.evaluate(async url=>{const [tab]=await chrome.tabs.query({url});await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content-scripts/bilibili.js']});},success.page.url());
  await success.page.getByRole('button',{name:'Locus capture P1',exact:true}).waitFor();
  checks.push('Four native left actions remain unchanged; capture matches the right-side Report typography and center line; toolbar replacement, teardown and remount preserve React-owned nodes');
  checks.push('Trusted immediate P2 capture; removed initial script; authenticated nav; exact CID; nonmodal browsing; SPA next selection preserves accepted P2');
  await success.page.close(); await worker.evaluate(() => chrome.offscreen.closeDocument());
  await resultPage.goto(`chrome-extension://${extensionId}/results.html#${success.id}`); await resultPage.getByRole('button', { name: 'Export ZIP', exact: true }).waitFor();
  await until(() => resultPage.locator('video').evaluate(video => ({ ready: video.readyState, width: video.videoWidth })), value => value.ready >= 1 && value.width === 320, 'restored production Blob preview');
  await resultPage.locator('video').evaluate(async video => { video.muted = true; await video.play(); }); await pause(400); assert(await resultPage.locator('video').evaluate(video => video.currentTime > 0)); await resultPage.screenshot({ path: path.join(work, 'bilibili-library.png') });
  const browserCdp = await context.browser().newBrowserCDPSession(); await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true }); await resultPage.getByRole('button', { name: 'Export ZIP', exact: true }).click();
  const item = await until(() => resultPage.evaluate(() => chrome.downloads.search({})), values => values.some(value => value.state === 'complete'), 'native Bilibili ZIP'); const zipPath = item.find(value => value.state === 'complete').filename;
  const zip = new ZipReader(new BlobReader(new Blob([await readFile(zipPath)]))), entries = await zip.getEntries(); const metadata = JSON.parse(await entries.find(entry => entry.filename === 'metadata.json').getData(new TextWriter())); const jsonl = JSON.parse((await entries.find(entry => entry.filename === 'records.jsonl').getData(new TextWriter())).trim());
  assert.equal(jsonl.record.assetIds.length, 2); assert.equal(jsonl.record.payload.description, 'Complete & description\n@Synthetic collaborator Second line'); const file = metadata.files.find(file => file.id === 'media-2'); const output = await entries.find(entry => entry.filename === file.path).getData(new Uint8ArrayWriter()); const outputFile = path.join(work, 'captured.mp4'); await writeFile(outputFile, output); await zip.close();
  const packets = file => JSON.parse(cmd('ffprobe', ['-v', 'error', '-show_streams', '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'stream=index,codec_type,extradata_hash,width,height,sample_aspect_ratio,display_aspect_ratio:packet=stream_index,data_hash,pts_time,duration_time', '-of', 'json', file])); const captured = packets(outputFile);
  for (const [kind, source] of [['video', videoFile], ['audio', audioFile]]) { const before = packets(source), track = captured.streams.find(stream => stream.codec_type === kind), after = captured.packets.filter(packet => packet.stream_index === track.index); assert.equal(track.extradata_hash, before.streams[0].extradata_hash); assert.deepEqual(after.map(packet => packet.data_hash), before.packets.map(packet => packet.data_hash)); }
  cmd('ffmpeg', ['-v', 'error', '-xerror', '-i', outputFile, '-f', 'null', '-']);
  checks.push('Production offscreen assembly/configuration and complete packet sets; closed-owner Blob reopen; native ZIP complete with video+cover and JSON/JSONL associations');
  await routeOwner();
  const qeAttempt = await capture(7);
  const qeRows = await until(rows, values => values.find(row => row.id === qeAttempt.id)?.assets.every(asset => asset.acquisition.state !== 'pending'), 'qe video/audio assembly');
  assert(qeRows.find(row => row.id === qeAttempt.id).assets.every(asset => asset.acquisition.state === 'acquired'), JSON.stringify(qeRows.find(row => row.id === qeAttempt.id)));
  const qeRepresentation = qeRows.find(row => row.id === qeAttempt.id).records[0].payload.representation;
  assert.equal(qeRepresentation.videoSource, 'https://synthetic.bilivideo.com/upgcxcode/1/2/100007/100007_qe1-1-64.m4s');
  assert.equal(qeRepresentation.audioSource, 'https://synthetic.bilivideo.com/upgcxcode/1/2/100007/100007_qe1-1-30280.m4s');
  await qeAttempt.page.close();
  checks.push('qe1-marked video and audio pass source validation, exact CDN leases, byte acquisition, encoded assembly and retention');
  const aspectProof = [];
  for (const [part, media] of aspectMedia) {
    const attempt = part === 7 ? qeAttempt : await capture(part);
    if (part !== 7) { await attempt.page.close(); const saved = await until(rows, values => values.find(row => row.id === attempt.id)?.assets.every(asset => asset.acquisition.state !== 'pending'), `aspect P${part}`); assert(saved.find(row => row.id === attempt.id).assets.every(asset => asset.acquisition.state === 'acquired'), JSON.stringify(saved)); }
    const sourcePage = await context.newPage(); await sourcePage.setContent(`<video src="https://www.bilibili.com/fixture-aspect-${part}.mp4" muted></video>`);
    const dimensions = page => page.locator('video').evaluate(video => ({ ready: video.readyState, width: video.videoWidth, height: video.videoHeight }));
    const sourceDisplay = await until(() => dimensions(sourcePage), value => value.ready >= 1, 'source aspect dimensions'); await sourcePage.close();
    await resultPage.goto(`chrome-extension://${extensionId}/results.html#${attempt.id}`); await resultPage.getByRole('button', { name: 'Export ZIP', exact: true }).waitFor();
    const display = await until(() => dimensions(resultPage), value => value.ready >= 1, 'retained aspect preview'); assert.equal(display.width, sourceDisplay.width); assert.equal(display.height, sourceDisplay.height);
    // Decode proof needs a visible, foreground video; information above it can
    // legitimately put the preview below the scroll viewport.
    await resultPage.bringToFront();
    await resultPage.locator('video').scrollIntoViewIfNeeded();
    const playback = [];
    for (const position of [0, (media.duration ?? 3) / 2, (media.duration ?? 3) - .6]) {
      const played = await resultPage.locator('video').evaluate(async (video, position) => {
        video.muted = true;
        if (position) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Seek timed out')), 10000); video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true }); video.currentTime = position; });
        const before = video.getVideoPlaybackQuality().totalVideoFrames;
        await video.play();
        const deadline = Date.now() + 5000;
        while (video.getVideoPlaybackQuality().totalVideoFrames <= before && !video.error && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        video.pause(); return { time: video.currentTime, frames: video.getVideoPlaybackQuality().totalVideoFrames - before, error: video.error?.message };
      }, position); assert(played.frames > 0 && !played.error, JSON.stringify(played)); playback.push(played);
    }
    const old = await resultPage.evaluate(async () => (await chrome.downloads.search({})).map(item => item.id));
    await resultPage.getByRole('button', { name: 'Export ZIP', exact: true }).click();
    const downloads = await until(() => resultPage.evaluate(() => chrome.downloads.search({})), items => items.some(item => !old.includes(item.id) && item.state === 'complete'), 'aspect archive');
    const zip = new ZipReader(new BlobReader(new Blob([await readFile(downloads.find(item => !old.includes(item.id) && item.state === 'complete').filename)]))), entries = await zip.getEntries();
    const metadata = JSON.parse(await entries.find(entry => entry.filename === 'metadata.json').getData(new TextWriter())), file = metadata.files.find(file => file.id === 'media-2');
    const output = path.join(work, `aspect-${part}-captured.mp4`); await writeFile(output, await entries.find(entry => entry.filename === file.path).getData(new Uint8ArrayWriter())); await zip.close();
    const actual = packets(output), original = packets(media.file), stream = actual.streams.find(stream => stream.codec_type === 'video');
    assert.equal(original.streams[0].sample_aspect_ratio ?? '1:1', media.sar);
    for (const field of ['width', 'height']) assert.equal(stream[field], original.streams[0][field], field);
    assert.equal(stream.sample_aspect_ratio ?? '1:1', original.streams[0].sample_aspect_ratio ?? '1:1');
    if (original.streams[0].display_aspect_ratio) assert.equal(stream.display_aspect_ratio, original.streams[0].display_aspect_ratio);
    assert.equal(actual.streams.length, media.silent ? 1 : 2);
    for (const [kind, file] of media.silent ? [['video', media.file]] : [['video', media.file], ['audio', audioFile]]) {
      const before = packets(file), track = actual.streams.find(stream => stream.codec_type === kind), after = actual.packets.filter(packet => packet.stream_index === track.index);
      assert.equal(track.extradata_hash, before.streams[0].extradata_hash); assert.deepEqual(after.map(packet => packet.data_hash), before.packets.map(packet => packet.data_hash));
      assertPresentationTiming(before.packets, after, kind);
      if (part !== 11) for (let index = 0; index < after.length; index++) assert(Math.abs(Number(after[index].duration_time) - Number(before.packets[index].duration_time)) <= .002, `${kind} duration`);
    }
    if (part === 11) {
      const times = original.packets.map(packet => Number(packet.pts_time));
      assert(times.some((time, i) => i && time < times[i - 1]), 'Fixture contains reordered frames');
      const sorted = [...times].sort((a, b) => a - b);
      assert(sorted.some((time, i) => i && time - sorted[i - 1] < .02), 'Fixture contains a shortened presentation interval');
      const beforeFrames = frameHashes(media.file); assert.equal(beforeFrames.length, 90);
      assert.deepEqual(frameHashes(output), beforeFrames, 'VFR decoded frames in presentation order');
    }
    if (media.silent) {
      assert(!audioRequests.includes(part), 'Silent capture must not request or fabricate audio');
      const row = (await rows()).find(row => row.id === attempt.id);
      assert.equal(row.records[0].payload.representation.audioAbsent, true);
      assert.equal(row.records[0].payload.representation.audioCodec, null);
      assert.equal(row.records[0].payload.representation.audioSource, null);
      assert.deepEqual(frameHashes(output), frameHashes(media.file), 'Silent decoded frames match the source');
    }
    cmd('ffmpeg', ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-']);
    aspectProof.push({ part, sourceSar: media.sar, outputSar: stream.sample_aspect_ratio, dar: stream.display_aspect_ratio, sourceDisplay, display, playback, configurationEqual: true, allPacketsEqual: true, timingEqual: true, fullDecode: true });
  }
  await writeFile(path.join(work, 'aspect-evidence.json'), JSON.stringify(aspectProof, null, 2));
  checks.push('Non-square 1920x1070 SAR 1070:1071 and rounding-sensitive 320x180 SAR 1001:1000 preserve exact SAR/DAR, all encoded packets/configurations/timing, Chrome display dimensions, start/mid/end playback, full decode and ZIP bytes');
  checks.push('Fragmented VFR + B-frames preserve every packet, presentation timestamp, final-frame duration, decoded frame hash and browser playback through flat MP4 assembly');
  checks.push('Explicitly silent DASH source imports one video track, preserves all packets/timing/decoded frames, plays at start/mid/end and exports ZIP without any audio request or fabricated track');
  if(real){
    const attempt=await capture(8);await attempt.page.close();const saved=await until(rows,list=>list.find(row=>row.id===attempt.id)?.assets.every(asset=>asset.acquisition.state!=='pending'),'real AVC terminal',120000);assert(saved.find(row=>row.id===attempt.id).assets.every(asset=>asset.acquisition.state==='acquired'),JSON.stringify(saved));
    await resultPage.goto(`chrome-extension://${extensionId}/results.html#${attempt.id}`);await resultPage.getByRole('button',{name:'Export ZIP',exact:true}).waitFor();
    const playback=[];for(const position of [0,real.duration/2,real.duration-.6]){const state=await resultPage.locator('video').evaluate(async(video,position)=>{video.muted=true;if(position)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Seek timed out')),10000);video.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});video.currentTime=position;});const before=video.getVideoPlaybackQuality().totalVideoFrames;await video.play();await new Promise(resolve=>setTimeout(resolve,300));video.pause();return{width:video.videoWidth,height:video.videoHeight,time:video.currentTime,frames:video.getVideoPlaybackQuality().totalVideoFrames-before};},position);assert(state.frames>0&&state.width===real.width);playback.push(state);}
    const old=await resultPage.evaluate(async()=>new Set((await chrome.downloads.search({})).map(item=>item.id)).values().toArray());await resultPage.getByRole('button',{name:'Export ZIP',exact:true}).click();const downloaded=await until(()=>resultPage.evaluate(()=>chrome.downloads.search({})),items=>items.some(item=>!old.includes(item.id)&&item.state==='complete'),'real native archive',60000);
    const z=new ZipReader(new BlobReader(new Blob([await readFile(downloaded.find(item=>!old.includes(item.id)&&item.state==='complete').filename)]))),entries=await z.getEntries(),metadata=JSON.parse(await entries.find(entry=>entry.filename==='metadata.json').getData(new TextWriter()));const file=metadata.files.find(file=>file.id==='media-2');const encoded=await entries.find(entry=>entry.filename===file.path).getData(new Uint8ArrayWriter());const output=path.join(work,'real-captured.mp4');await writeFile(output,encoded);await z.close();
    const after=packets(output),proof=[];for(const[kind,file]of[['video',process.env.LOCUS_BILI_REAL_VIDEO],['audio',process.env.LOCUS_BILI_REAL_AUDIO]]){const original=packets(file),stream=after.streams.find(stream=>stream.codec_type===kind),actual=after.packets.filter(packet=>packet.stream_index===stream.index);assert.equal(stream.extradata_hash,original.streams[0].extradata_hash);assert.deepEqual(actual.map(packet=>packet.data_hash),original.packets.map(packet=>packet.data_hash));assertPresentationTiming(original.packets,actual,kind);proof.push({kind,packets:actual.length,configurationEqual:true,encodedPacketsEqual:true,presentationTimingEqual:true});}
    cmd('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);await writeFile(path.join(work,'real-media-evidence.json'),JSON.stringify({proof,playback,fullDecode:true},null,2));checks.push('Optional real AVC/AAC through production source fixture/byte path: complete packet+configuration preservation, source page closed, start/mid/end playback, full decode and native ZIP');
  }
  for (const p of [3, 4, 5, 6, 13, 14]) {
    const attempt = await capture(p); const values = await until(rows, values => values.find(row => row.id === attempt.id)?.assets.every(asset => asset.acquisition.state !== 'pending'), `partial P${p}`); const row = values.find(row => row.id === attempt.id);
    assert(row.assets.some(asset => asset.acquisition.state === 'acquired')); if (p !== 6) assert.equal(row.assets.find(asset => asset.id === 'media-2').acquisition.state, 'unavailable'); else assert.equal(row.records[0].acquisition.state, 'unavailable');
    await attempt.page.getByRole('button',{name:'Expand capture queue',exact:true}).click();
    const acquisitionDiagnostic=attempt.page.locator(`[data-task-id="${attempt.id}"] [data-capture-diagnostic]`).filter({hasText:'Acquisition failed'}).first();
    await acquisitionDiagnostic.locator('summary').click();const diagnostic=acquisitionDiagnostic.locator('pre');
    await diagnostic.waitFor();const report=await diagnostic.textContent();assert(report.includes('stage:'));assert(report.includes(attempt.id));
    if (p === 13) assert(report.includes('bilibili.resource.fetch') && report.includes('audio'), 'Failed audio download is not silent success');
    if (p === 14) assert(report.includes('bilibili.video.track-inspection'), 'Unexpected embedded audio is not silently discarded');
    if(p===5){assert(report.includes('HTTP_SIZE_LIMIT'));assert(report.includes('68157440'));assert(report.includes('67108864'));
      await worker.evaluate(async url=>{const [tab]=await chrome.tabs.query({url});await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{document.documentElement.dataset.copiedDiagnostic=text;}}});}});},attempt.page.url());
      await acquisitionDiagnostic.getByRole('button',{name:'Copy diagnostic',exact:true}).click();
      assert.equal(await attempt.page.evaluate(()=>document.documentElement.dataset.copiedDiagnostic),report);
      await resultPage.goto(`chrome-extension://${extensionId}/results.html#${attempt.id}`);
      await resultPage.getByRole('button',{name:'Export available content',exact:true}).waitFor();
      await until(()=>resultPage.locator('[data-capture-diagnostic] pre').allTextContents(),values=>values.some(value=>value.includes('HTTP_SIZE_LIMIT')&&value.includes('68157440')),'retained result diagnostic');
      const retainedDiagnostic=resultPage.locator('[data-capture-diagnostic]').filter({hasText:'HTTP_SIZE_LIMIT'}).first();assert.equal(await retainedDiagnostic.locator('pre').isVisible(),false);await retainedDiagnostic.locator('summary').click();await retainedDiagnostic.locator('pre').waitFor();
      await attempt.page.screenshot({path:path.join(work,'bilibili-debug-queue.png')});
    }
    await attempt.page.close();
  }
  checks.push('Expanded queue diagnostics and on-demand retained result diagnostics, original stage/byte values and result correlation preserved, copy action returns the displayed report');
  checks.push('Missing audio, truncated track and oversize response preserve metadata/cover; incomplete metadata preserves independently acquired files');
  let releaseClear; hold=url=>url.pathname.includes('/100009/')?new Promise(resolve=>{releaseClear=resolve;}):undefined;
  const clearing=await capture(9);await until(async()=>typeof releaseClear,value=>value==='function','held clear media');
  const rulesBefore=await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).map(rule=>rule.id));assert.equal(rulesBefore.length,1);
  await worker.evaluate(()=>{globalThis.biliWorkerMarker=true;});const workerControl=await context.newCDPSession(resultPage);await workerControl.send('ServiceWorker.enable');await workerControl.send('ServiceWorker.stopAllWorkers');
  await resultPage.evaluate(id=>chrome.runtime.sendMessage({target:'coordinator',op:'status',id}),clearing.id);
  await until(async()=>{const current=context.serviceWorkers().find(value=>value.url().includes(extensionId));return current?current.evaluate(()=>!globalThis.biliWorkerMarker).catch(()=>false):false;},Boolean,'worker recreation with active CDN lease');worker=context.serviceWorkers().find(value=>value.url().includes(extensionId));await workerControl.detach();
  assert.deepEqual(await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).map(rule=>rule.id)),rulesBefore);
  await resultPage.goto(`chrome-extension://${extensionId}/results.html#${clearing.id}`);await resultPage.getByRole('button',{name:'Clear result',exact:true}).click();await resultPage.getByRole('button',{name:'Confirm clear',exact:true}).click();await until(rows,list=>!list.some(row=>row.id===clearing.id),'clear commit');hold=undefined;releaseClear();await pause(300);assert(!(await rows()).some(row=>row.id===clearing.id));await clearing.page.close();
  let releaseRevoke;hold=url=>url.pathname.includes('/100001/')?new Promise(resolve=>{releaseRevoke=resolve;}):undefined;
  const revoking=await capture(1);await until(async()=>typeof releaseRevoke,value=>value==='function','held revoke media');
  await worker.evaluate(()=>{for(const listener of globalThis.fixtureRemoval)listener({origins:['https://www.bilibili.com/*']});});
  hold=undefined;releaseRevoke();const interrupted=await until(rows,list=>list.find(row=>row.id===revoking.id)?.assets.find(asset=>asset.id==='media-2')?.acquisition.state==='unavailable','revoked video');assert.equal(interrupted.find(row=>row.id===revoking.id).assets[0].acquisition.state,'acquired');await revoking.page.close();
  checks.push('Worker recreation preserves a surviving CDN lease; clear during fetch prevents resurrection; simulated removal/rapid regrant interrupts accepted Bilibili bytes and preserves committed cover');
  sessionLogin = false; const denied = await context.newPage(); await denied.goto(`${base}?p=7`); const beforeDenied = (await rows()).length; await denied.getByRole('button', { name: 'Locus capture P7' }).click(); await denied.getByRole('button', { name: 'Expand capture queue', exact: true }).click(); const denial=denied.locator('[data-capture-diagnostic]').filter({hasText:/Sign in to Bilibili before capturing this part/});await denial.locator('summary').click();await denial.locator('pre').waitFor(); assert.equal((await rows()).length, beforeDenied); await denied.close(); sessionLogin = true;
  checks.push(...await verifyBilibiliControls({ context, worker, work, rows, until, base }));
  checks.push(await verifyWatchlaterPlayer({ context, work, rows, until, base }));
  await until(() => worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()), rules => rules.length === 0, 'DNR cleanup');
  const sessions = await worker.evaluate(() => chrome.storage.session.get(null)); assert.equal(sessions['locus-bilibili-probes-v1']?.length ?? 0, 0); assert.equal(sessions['locus-bilibili-cdn-leases-v1']?.length ?? 0, 0);
  checks.push('Session denial creates no capture; all temporary source tabs and DNR leases cleaned');
  assert.deepEqual(renderErrors,[], 'No React node-removal errors during ordinary source updates or UI teardown');
  await writeFile(path.join(work, 'evidence.json'), JSON.stringify({ status: 'PASS', checks, outputSha256: createHash('sha256').update(output).digest('hex'), files: await readdir(work) }, null, 2)); console.log(JSON.stringify({ status: 'PASS', work, checks }, null, 2));
} catch (error) { await writeFile(path.join(work, 'failure.txt'), error.stack ?? String(error)); console.error(`Bilibili smoke failed; evidence: ${work}\n${error.stack ?? String(error)}`); process.exitCode = 1; }
finally { for (const session of routing) await session.detach().catch(() => {}); await context?.close(); }
