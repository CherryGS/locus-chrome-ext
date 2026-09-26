/** Bilibili fixtures and assertions for the disposable real-server integration. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bilibiliNativeFixture } from './bilibili-native-fixture.mjs';

const bvid = 'BV145PxzCEoE', aid = '116182891959963';
const base = `https://www.bilibili.com/video/${bvid}/`;
const coverUrl = part => `https://i0.hdslb.com/bfs/archive/locus-${part}.png`;
const trackUrl = (part, id) => `https://synthetic.bilivideo.com/upgcxcode/1/2/${100000 + part}/${100000 + part}-1-${id}.m4s`;
const description = 'Complete & description\n@Synthetic collaborator Second line';

export async function createBilibiliLocusSmoke({ work, image }) {
  const videoPath = path.join(work, 'bilibili-video.mp4'), audioPath = path.join(work, 'bilibili-audio.mp4');
  const ffmpeg = args => execFileSync('ffmpeg', ['-v', 'error', ...args], { windowsHide: true, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-t', '3', '-c:v', 'libx264', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-an', '-movflags', '+faststart', videoPath]);
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:a', 'aac', '-vn', '-movflags', '+faststart', audioPath]);
  const video = await readFile(videoPath), audio = await readFile(audioPath);
  const avcc = video.indexOf(Buffer.from('avcC')); assert(avcc >= 0);
  const codec = `avc1.${video.subarray(avcc + 5, avcc + 8).toString('hex')}`;
  let releaseClosedPage, closedPageRequested = false;
  const closedPageGate = new Promise(resolve => { releaseClosedPage = resolve; });

  function fixture(part) {
    const cid = String(100000 + part);
    const track = (id, codecs) => ({ id, codecs, bandwidth: id * 1000, width: 320, height: 180, baseUrl: trackUrl(part, id) });
    const initial = { bvid, aid, cid, p: part, videoData: {
      bvid, cid: '100001', title: 'Synthetic multipart source', desc: 'Complete &amp; description',
      desc_v2: part === 6 ? [{ type: 2, raw_text: 'unsupported' }] : [{ type: 1, raw_text: 'Complete & description\n' }, { type: 2, raw_text: 'Synthetic collaborator', biz_id: 123 }, { type: 1, raw_text: 'Second line' }],
      owner: { mid: '123', name: 'Synthetic uploader' }, pubdate: 1710000000, pic: coverUrl(part),
      rights: { ugc_pay_preview: 0, is_stein_gate: 0, ugc_pay: 0 },
      pages: Array.from({ length: 6 }, (_, i) => ({ page: i + 1, cid: String(100001 + i), duration: 3, part: `Synthetic part ${i + 1}` })),
    } };
    const play = { code: 0, data: { timelength: 3000, accept_quality: [64], support_formats: [{ quality: 64 }], dash: { video: [track(64, codec)], audio: [track(30280, 'mp4a.40.2')] } } };
    const toolbar = ['like', 'coin', 'fav', 'share'].map(name => `<div class="toolbar-left-item-wrap"><div class="video-${name} video-toolbar-left-item"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg><span class="video-toolbar-item-text">12</span></div></div>`).join('');
    return `<!doctype html><meta charset="UTF-8"><title>Synthetic Bilibili P${part}</title><style>body{font:16px sans-serif;margin:40px;background:#fafafa}.video-toolbar-left-main{display:flex;gap:24px}.video-toolbar-left-item{display:flex;align-items:center;gap:6px;height:36px}.video-toolbar-item-text{font:500 14px/28px sans-serif}#arc_toolbar_report{margin:32px 0}</style><script>window.__INITIAL_STATE__=${JSON.stringify(initial)};document.currentScript.remove();</script><script>window.__playinfo__=${JSON.stringify(play)};</script><div id="app" data-server-rendered="true"><h1>Synthetic Bilibili P${part}</h1><div id="arc_toolbar_report" class="video-toolbar-container"><div class="video-toolbar-left"><div class="video-toolbar-left-main">${toolbar}</div></div><div class="video-toolbar-right"><div class="video-complaint video-toolbar-right-item"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 3 2 21h20Z"/></svg><span class="video-toolbar-item-text">Report</span></div></div></div>${bilibiliNativeFixture(part)}</div>`;
  }

  return {
    patterns: [{ urlPattern: 'https://*.bilivideo.com/*' }, { urlPattern: 'https://*.hdslb.com/*' }],
    async route(context) {
      await context.route('https://www.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture(Number(new URL(route.request().url()).searchParams.get('p') ?? 1)) }));
      await context.route('https://www.bilibili.com/fixture-native.mp4*', route => route.fulfill({ contentType: 'video/mp4', body: video }));
      await context.route('https://api.bilibili.com/x/web-interface/nav', route => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://www.bilibili.com', 'Access-Control-Allow-Credentials': 'true' }, body: JSON.stringify({ code: 0, data: { isLogin: true } }) }));
    },
    async response(url) {
      const cover = url.hostname.endsWith('.hdslb.com');
      if (!cover && !url.hostname.endsWith('.bilivideo.com')) return;
      const part = cover ? Number(/locus-(\d+)\.png$/.exec(url.pathname)?.[1]) : Number(url.pathname.split('/')[4]) - 100000;
      const isAudio = url.pathname.includes('-30280.');
      assert(part >= 2 && part <= 6, `Unexpected Bilibili fixture request: ${url}`);
      if (part === 3 && !cover && !isAudio) { closedPageRequested = true; await closedPageGate; }
      const failed = part === 4 && !cover && !isAudio || part === 5 && cover;
      const body = failed ? Buffer.from('Unavailable') : cover ? image : isAudio ? audio : video;
      return { responseCode: failed ? 503 : 200, responseHeaders: [{ name: 'Content-Type', value: cover ? 'image/png' : 'application/octet-stream' }, { name: 'Content-Length', value: String(body.length) }], body: body.toString('base64') };
    },
    async verify({ context, results, rows, application, extensionId, until, locusRequests }) {
      const checks = [];
      const captures = () => results.evaluate(async () => {
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open('locus-results-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        try { return await new Promise((resolve, reject) => { const request = db.transaction('results').objectStore('results').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
      });
      async function capture(part) {
        const page = await context.newPage(); await page.goto(`${base}?p=${part}`);
        await page.locator('#bilibili-player video').waitFor();
        assert.equal(await page.locator('html').getAttribute('data-premature-capture'), 'false');
        await page.getByRole('button', { name: `Locus capture P${part}`, exact: true }).click();
        const values = await until(captures, values => values.some(value => value.sourceUrl === `${base}?p=${part}`), `P${part} capture acceptance`);
        return { page, id: values.find(value => value.sourceUrl === `${base}?p=${part}`).id };
      }
      async function savedCapture(id, part) {
        const values = await until(rows, values => values.some(value => value.resultId === id && value.state === 'complete'), `P${part} automatic Locus import`);
        const saved = values.find(value => value.resultId === id);
        assert.equal(saved.items.length, 1); assert.equal(saved.uploads.length, 2); assert.equal(saved.entityIds.length, 1);
        assert(saved.uploads.every(value => value.fileId));
        const imports = locusRequests.filter(request => request.method === 'POST' && request.path.endsWith('/import-batches') && request.body?.items?.[0]?.bilibili?.part?.number === part);
        assert.equal(imports.length, 1); assert.equal(imports[0].body.items.length, 1);
        const item = imports[0].body.items[0];
        assert.deepEqual(Object.keys(item).sort(), ['bilibili', 'cover_file_id', 'file_id']);
        assert.notEqual(item.file_id, item.cover_file_id);
        assert.deepEqual(new Set(saved.uploads.map(upload => upload.fileId)), new Set([item.file_id, item.cover_file_id]));
        const batch = (await application.request('/api/v1/import-batches')).batches.find(batch => batch.batch_id === saved.batchId);
        assert.equal(batch.items.length, 1); assert.equal(batch.items[0].requested_bilibili, true); assert.equal(batch.items[0].requested_cover, true);
        const current = batch.items[0].current, source = current.bilibili, cover = source.cover;
        assert.equal(current.overall, 'success'); assert.equal(current.complete, true); assert.equal(current.confirmed_file_id, item.file_id);
        for (const stage of [current.file_attachment, source.source, source.association, cover.establishment, cover.association, cover.image.recognition, cover.image.establishment, cover.image.interpretation, cover.image.preview]) assert.equal(stage.state, 'success');
        const videoOutcome = current.kinds.find(kind => kind.kind === 'video'); assert(videoOutcome);
        for (const stage of ['recognition', 'establishment', 'interpretation', 'preview']) assert.equal(videoOutcome[stage].state, 'success');
        assert.equal(cover.file_id, item.cover_file_id); assert(cover.confirmed_entity_id);
        const view = await application.request(`/api/v1/bilibili/${source.component_id}/view`);
        assert.equal(view.record.basis, item.file_id); assert.deepEqual(view.record.original_cover, { entity_id: cover.confirmed_entity_id, file_id: item.cover_file_id });
        assert.equal(view.applicability.comparison.file_id, item.file_id); assert.equal(view.cover.comparison.file_id, item.cover_file_id);
        const snapshot = view.record.snapshot;
        assert.equal(snapshot.bvid, bvid); assert.equal(snapshot.aid, aid); assert.equal(snapshot.page_url, `${base}?p=${part}`); assert.equal(snapshot.requested_url, `${base}?p=${part}`);
        assert.equal(snapshot.title, 'Synthetic multipart source'); assert.equal(snapshot.description, description);
        assert.equal(snapshot.author.user_id, '123'); assert.equal(snapshot.author.display_name, 'Synthetic uploader');
        assert.equal(snapshot.published_at_unix_ms, '1710000000000'); assert(Number(snapshot.observed_at_unix_ms) > 0);
        assert.equal(snapshot.part.number, part); assert.equal(snapshot.part.cid, String(100000 + part)); assert.equal(snapshot.part.title, `Synthetic part ${part}`);
        assert.equal(snapshot.representation.url, trackUrl(part, 64)); assert.equal(snapshot.preview.url, coverUrl(part));
        assert.equal(snapshot.representation.claims.width, 320); assert.equal(snapshot.representation.claims.height, 180);
        assert.equal(snapshot.part.claims.duration_ms, '3000'); assert.equal(snapshot.representation.claims.bitrate_bps, '64000'); assert.equal(snapshot.representation.claims.quality, '64');
        const memberships = await application.request('/api/v1/memberships/read', { entity_ids: [current.confirmed_entity_id, cover.confirmed_entity_id] });
        for (const [entityId, fileId] of [[current.confirmed_entity_id, item.file_id], [cover.confirmed_entity_id, item.cover_file_id]]) assert(memberships.find(entry => entry.entity_id === entityId)?.memberships.some(entry => entry.component_id === fileId));
        await writeFile(path.join(work, `bilibili-p${part}-server-evidence.json`), JSON.stringify({ submitted: item, current, view, memberships }, null, 2));
        return saved;
      }

      const success = await capture(2), saved = await savedCapture(success.id, 2);
      await until(() => success.page.locator('[data-locus-bilibili-action="toolbar"]').getAttribute('data-state'), value => value === 'locus-saved', 'Bilibili page confirmed saved status');
      await success.page.screenshot({ path: path.join(work, 'bilibili-page-saved.png'), fullPage: true });
      await results.goto(`chrome-extension://${extensionId}/results.html#${saved.resultId}`); await results.getByText(saved.message, { exact: true }).waitFor();
      await results.locator('video').waitFor(); await results.locator('img').first().waitFor();
      await until(() => results.locator('video').evaluate(video => video.readyState), value => value >= 2, 'Retained Bilibili preview bytes decoded');
      await results.locator('video').evaluate(async video => { video.muted = true; await video.play(); });
      await until(() => results.locator('video').evaluate(video => video.currentTime), value => value > .1, 'Retained Bilibili preview plays');
      await results.locator('video').evaluate(video => video.pause());
      assert(await results.locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0));
      await results.locator('summary').filter({ hasText: 'Locus connection' }).click();
      await results.setViewportSize({ width: 1400, height: 1500 });
      await results.screenshot({ path: path.join(work, 'bilibili-result-saved.png'), fullPage: true });
      checks.push('Native Bilibili P2 -> two uploads -> one registered import with video/cover File linkage, source metadata and successful nested source/cover/image/video stages', 'Bilibili page and retained result show confirmed Locus save with video and cover');

      const closed = await capture(3);
      try { await until(() => closedPageRequested, Boolean, 'P3 media held before source closure'); await closed.page.close(); } finally { releaseClosedPage(); }
      await savedCapture(closed.id, 3);
      checks.push('Accepted Bilibili capture completes after source page closes');

      for (const [part, portion] of [[4, 'video'], [5, 'cover'], [6, 'metadata']]) {
        const before = locusRequests.length, batches = (await application.request('/api/v1/import-batches')).batches.length;
        const failed = await capture(part);
        const values = await until(rows, values => values.some(value => value.resultId === failed.id && value.state === 'failed'), `Incomplete ${portion} rejected locally`);
        assert.equal(values.find(value => value.resultId === failed.id).uploads.length, 0);
        assert.equal(locusRequests.length, before, `Incomplete ${portion} must send zero Locus pipeline requests`);
        assert.equal((await application.request('/api/v1/import-batches')).batches.length, batches);
        await failed.page.close(); checks.push(`Incomplete Bilibili ${portion} sends zero Locus requests`);
      }
      return checks;
    },
  };
}
