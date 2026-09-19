import { ResultDatabase } from '../../host/chrome/database';
import type { Snapshot } from '@locus/capture-core/model';
import { boundedFetch, LIMITS, remux } from './remux';

// Probe guard: any accidental WebCodecs encoder/decoder use makes the run fail.
for (const name of ['VideoEncoder', 'AudioEncoder', 'VideoDecoder', 'AudioDecoder']) Object.defineProperty(globalThis, name, { configurable: true, value: class { constructor() { throw new Error('Codec construction prohibited in packet-copy probe'); } } });
let active: AbortController | undefined;
const db = new ResultDatabase('locus-bilibili-probe-v1');
const sanitize = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, '[redacted URL]');
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.target !== 'probe-offscreen') return;
  if (message.op === 'cancel') { active?.abort(new Error('Explicit probe cancellation')); respond({ ok: true }); return; }
  if (message.op !== 'assemble') return;
  void (async () => {
    if (active) throw new Error('Probe already active'); active = new AbortController();
    const controller = active, timer = setTimeout(() => controller.abort(new Error('Probe deadline exceeded')), LIMITS.timeoutMs);
    try {
      const video = await boundedFetch(message.video, controller.signal);
      const audio = message.audio ? await boundedFetch(message.audio, controller.signal) : undefined;
      const assembled = await remux(video, audio, message.expectedDuration, controller.signal, message.slow);
      const snapshot: Snapshot = { result: { id: message.id, site: 'bilibili-probe', label: 'Disposable media feasibility fixture', sourceUrl: 'https://example.invalid/probe', createdAt: new Date().toISOString(), revision: 1, retention: { state: 'pending', revision: 0 }, records: [{ id: 'part', assetIds: ['video'], acquisition: { state: 'acquired' }, payload: { syntheticProbeMetadata: true, expectedDuration: message.expectedDuration } }], assets: [{ id: 'video', recordId: 'part', description: { role: 'combined-video' }, acquisition: { state: 'acquired' }, mime: 'video/mp4', size: assembled.blob.size }] }, blobs: { video: assembled.blob }, readErrors: {} };
      controller.signal.throwIfAborted(); await db.commit(snapshot); await db.close();
      return { ok: true, offscreen: location.pathname === '/offscreen.html', bytes: assembled.blob.size, codecs: assembled.codecs, ...assembled.progress };
    } finally { clearTimeout(timer); active = undefined; }
  })().then(respond, error => respond({ ok: false, error: sanitize(error) }));
  return true;
});
