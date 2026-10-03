import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOffscreen } from './offscreen';
import { ResultDatabase } from './database';
import { CHANNEL, type ResultSummary, type ReadResponse } from './protocol';
import type { TwitterCandidate } from '@locus/twitter/source';
import type { transferToLocus } from '../locus/transfer';
import { projectBilibili } from '@locus/bilibili/projection';

const mocks = vi.hoisted(() => ({ load: vi.fn(), acquire: vi.fn(), acquireBili: vi.fn(), coordinator: vi.fn(), transfer: vi.fn<typeof transferToLocus>() }));
vi.mock('./bilibili-media', () => ({ acquireBilibili: mocks.acquireBili, LIMITS: { outputBytes: 160 * 1048576 } }));
vi.mock('./network', () => ({ loadTwitter: mocks.load, acquireMedia: mocks.acquire }));
vi.mock('./protocol', async original => ({ ...await original<typeof import('./protocol')>(), coordinator: mocks.coordinator }));
vi.mock('../locus/transfer', async original => ({ ...await original<typeof import('../locus/transfer')>(), transferToLocus: mocks.transfer }));
let listener: (message: unknown, sender: unknown, respond: (reply: any) => void) => void;
let dispose: () => void;
let starts: string[];
let held: Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>;
const candidate = (id: string, count = 1): TwitterCandidate => ({
  sourceId: id, sourceUrl: `https://x.com/synthetic/status/${id}`, label: `Synthetic ${id}`, text: 'Synthetic message', textFailure: null, payload: { fullText: 'Synthetic message' },
  media: Array.from({ length: count }, (_, index) => ({ id: `media-${index + 1}`, sourceId: id, kind: 'photo', url: `https://pbs.twimg.com/media/${id}-${index}.png`, reason: null, bitrate: null, sourceDimensions: null, representationDimensions: null, sourceOrder: null, quality: 'Unverified', altText: null })),
});
const bytes = () => new Blob(['fixture'], { type: 'image/png' });
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory()); starts = []; held = new Map();
  vi.stubGlobal('chrome', { runtime: { id: 'synthetic', getURL: (path: string) => `chrome-extension://synthetic/${path}`, onMessage: { addListener: (handler: typeof listener) => { listener = handler; } } } });
  mocks.load.mockReset().mockImplementation(async (url: string) => candidate(url.split('/').at(-1)!));
  mocks.coordinator.mockReset().mockResolvedValue(true);
  mocks.acquireBili.mockReset();
  mocks.acquire.mockReset().mockImplementation((media: { sourceId: string; id: string }, signal: AbortSignal) => new Promise<Blob>((resolve, reject) => {
    const key = `${media.sourceId}/${media.id}`; starts.push(key); held.set(key, { resolve, reject });
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  mocks.transfer.mockReset().mockImplementation(async (_snapshot, transfer, _connection, save) => { await save({ ...transfer, state: 'configuration-required' }); });
  dispose = startOffscreen();
});
afterEach(async () => { dispose(); await new Promise(resolve => setTimeout(resolve, 0)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function command<T = any>(op: string, values: Record<string, unknown> = {}): Promise<T> {
  const reply = await new Promise<any>(resolve => listener({ target: 'offscreen', op, ...values }, { id: 'synthetic', url: 'chrome-extension://synthetic/background.js' }, resolve));
  if (!reply.ok) throw new Error(reply.error); return reply.value;
}
async function begin(id: string) {
  const ready = await command('inspect', { url: candidate(id).sourceUrl, owner: 'document' });
  return command<ResultSummary>('capture', { token: ready.token, selected: ready.media.map((media: { id: string }) => media.id), owner: 'document' });
}
async function consume<T = any>(operation: string, id: string): Promise<T> {
  const token = crypto.randomUUID(), channel = new BroadcastChannel(CHANNEL);
  await command('grant', { token, operation, id });
  return new Promise((resolve, reject) => {
    channel.onmessage = event => { if (event.data.requestId !== token) return; channel.close(); if (event.data.ok) resolve(event.data.value); else reject(new Error(event.data.error)); };
    channel.postMessage({ requestId: token });
  });
}
function holdSaves() {
  const saves = new Map<string, () => Promise<void>>();
  mocks.transfer.mockImplementation(async (snapshot, transfer, _connection, save, options) => {
    await save({ ...transfer, state: 'uploading' });
    await new Promise<void>(resolve => {
      saves.set(snapshot.result.id, async () => { await save({ ...transfer, state: 'complete' }); resolve(); });
      options?.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
  });
  return saves;
}

describe('independent bounded acquisition and delivery', () => {
  it('waits for saving bytes to leave memory before admitting a large Bilibili output', async () => {
    const saves = holdSaves();
    vi.spyOn(ResultDatabase.prototype, 'commit').mockImplementation(async snapshot => ({ ...structuredClone(snapshot.result), retention: { state: 'retained', revision: snapshot.result.revision } }));
    const large = (size: number, mime: string) => { const blob = new Blob(['budget fixture'], { type: mime }); Object.defineProperty(blob, 'size', { value: size * 1048576 }); return blob; };
    const one = await begin('1'), two = await begin('2');
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    held.get('1/media-1')!.resolve(large(200, 'image/png')); held.get('2/media-1')!.resolve(large(200, 'image/png'));
    await vi.waitFor(() => expect(saves.size).toBe(2));
    const url = 'https://www.bilibili.com/video/BV145PxzCEoE/?p=2', cid = '123';
    const track = (id: number, codecs: string) => ({ id, codecs, bandwidth: 100, width: 320, height: 180, baseUrl: `https://synthetic.bilivideo.com/upgcxcode/1/2/${cid}/${cid}-1-${id}.m4s` });
    const source = projectBilibili({ bvid: 'BV145PxzCEoE', aid: '1', cid, p: 2, videoData: { bvid: 'BV145PxzCEoE', title: 'Budget fixture', desc: '', desc_v2: null, rights: { ugc_pay_preview: 0, is_stein_gate: 0 }, pic: 'https://i0.hdslb.com/bfs/archive/synthetic.png', pages: [{ page: 2, cid, duration: 3 }] } }, { code: 0, data: { timelength: 3000, accept_quality: [64], support_formats: [{ quality: 64 }], dash: { video: [track(64, 'avc1.64000d')], audio: [track(30280, 'mp4a.40.2')] } } }, url, true);
    mocks.coordinator.mockImplementation(async op => op === 'bilibili-source' ? source : true);
    mocks.acquireBili.mockImplementation(async media => large(media.kind === 'cover' ? 16 : 160, media.kind === 'cover' ? 'image/png' : 'video/mp4'));
    const ready = await command('inspect', { site: 'bilibili', url, owner: 'bili-document' });
    const bili = await command<ResultSummary>('capture', { site: 'bilibili', token: ready.token, selected: ['media-1', 'media-2'], owner: 'bili-document' });
    expect(bili.queuePosition).toBe(1); expect(mocks.acquireBili).not.toHaveBeenCalled();
    await saves.get(one.id)!();
    await vi.waitFor(() => expect(saves.has(bili.id)).toBe(true));
    expect((await command('status', { id: bili.id })).acquisition).toBe('complete');
    expect(mocks.acquireBili).toHaveBeenCalledTimes(2);
    await saves.get(two.id)!(); await saves.get(bili.id)!();
    await vi.waitFor(async () => expect(await command('capture-tasks')).toHaveLength(0));
  });
  it('overlaps two downloads, serializes coherent revisions, and starts another after each commit', async () => {
    mocks.load.mockResolvedValue(candidate('1', 4));
    const result = await begin('1');
    await vi.waitFor(() => expect(starts).toEqual(['1/media-1', '1/media-2']));
    const original = ResultDatabase.prototype.commit; let release!: () => void;
    const commits: number[] = [];
    vi.spyOn(ResultDatabase.prototype, 'commit').mockImplementation(async function (this: ResultDatabase, snapshot) {
      commits.push(snapshot.result.revision);
      if (snapshot.result.revision === 2) await new Promise<void>(resolve => { release = resolve; });
      return original.call(this, snapshot);
    });
    held.get('1/media-2')!.resolve(bytes());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    held.get('1/media-1')!.resolve(bytes());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(commits).toEqual([2]); expect(starts).toHaveLength(2);
    release(); await vi.waitFor(() => expect(starts).toHaveLength(4));
    expect(commits).toEqual([2, 3]);
    const partial = await consume<ReadResponse>('read', result.id);
    expect(partial.snapshot!.result.retention.revision).toBe(3);
    expect(Object.keys(partial.snapshot!.blobs).sort()).toEqual(['media-1', 'media-2']);
    held.get('1/media-3')!.resolve(bytes()); held.get('1/media-4')!.resolve(bytes());
    await vi.waitFor(async () => expect(await command('capture-tasks')).toHaveLength(0));
    const database = new ResultDatabase(); const stored = await database.read(result.id);
    expect(stored!.result.revision).toBe(5); expect(Object.keys(stored!.blobs)).toHaveLength(4); await database.close();
  });
  it('keeps independent acquired bytes when a concurrent peer fails', async () => {
    mocks.load.mockResolvedValue(candidate('1', 2)); const result = await begin('1');
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    held.get('1/media-2')!.reject(new Error('Truncated download')); held.get('1/media-1')!.resolve(bytes());
    await vi.waitFor(async () => expect(await command('capture-tasks')).toHaveLength(0));
    const stored = await consume<ReadResponse>('read', result.id);
    expect(stored.snapshot!.result.assets.map(asset => asset.acquisition.state)).toEqual(['acquired', 'unavailable']);
    expect(await stored.snapshot!.blobs['media-1']!.text()).toBe('fixture');
    expect(stored.snapshot!.blobs['media-2']).toBeUndefined();
  });
  it('frees capture slots during saves, bounds delivery to two, and preserves observing queued delivery', async () => {
    const saves = holdSaves();
    const one = await begin('1'), two = await begin('2'), three = await begin('3');
    await vi.waitFor(() => expect(starts).toHaveLength(2)); expect(three.queuePosition).toBe(1);
    held.get('1/media-1')!.resolve(bytes()); held.get('2/media-1')!.resolve(bytes());
    await vi.waitFor(() => expect(starts).toHaveLength(3));
    await vi.waitFor(() => expect(saves.size).toBe(2));
    expect((await command('hello')).active).toEqual([three.id]);
    held.get('3/media-1')!.resolve(bytes());
    await vi.waitFor(async () => expect((await command('status', { id: three.id })).acquisition).toBe('complete'));
    expect(saves.size).toBe(2); expect(await command('prepare-close')).toBe(false);
    const observed = await command<ResultSummary[]>('capture-tasks');
    expect(observed.map(value => value.id)).toEqual([one.id, two.id, three.id]);
    expect(observed.find(value => value.id === three.id)!.queuePosition).toBeUndefined();
    await consume('locus-continue', three.id); expect(mocks.transfer).toHaveBeenCalledTimes(2);
    await saves.get(one.id)!(); await vi.waitFor(() => expect(saves.has(three.id)).toBe(true));
    await saves.get(two.id)!(); await saves.get(three.id)!();
    await vi.waitFor(async () => expect(await command('capture-tasks')).toHaveLength(0));
    expect(await command('prepare-close')).toBe(true);
  });
  it('clear prevents queued delivery from dispatching or resurrecting a result', async () => {
    const saves = holdSaves(); const results = [await begin('1'), await begin('2'), await begin('3')];
    held.get('1/media-1')!.resolve(bytes()); held.get('2/media-1')!.resolve(bytes());
    await vi.waitFor(() => expect(starts).toHaveLength(3)); await vi.waitFor(() => expect(saves.size).toBe(2));
    held.get('3/media-1')!.resolve(bytes());
    await vi.waitFor(async () => expect((await command('status', { id: results[2]!.id })).acquisition).toBe('complete'));
    await consume('clear', results[2]!.id);
    await saves.get(results[0]!.id)!(); await saves.get(results[1]!.id)!();
    await vi.waitFor(async () => expect(await command('capture-tasks')).toHaveLength(0));
    expect(mocks.transfer).toHaveBeenCalledTimes(2); expect(await command('status', { id: results[2]!.id })).toBeNull();
    const database = new ResultDatabase(); expect((await database.locusTransfers()).some(value => value.resultId === results[2]!.id)).toBe(false); await database.close();
  });
  it('owner loss leaves queued saves unverified and never replays them', async () => {
    const saves = holdSaves(); const results = [await begin('1'), await begin('2'), await begin('3')];
    held.get('1/media-1')!.resolve(bytes()); held.get('2/media-1')!.resolve(bytes());
    await vi.waitFor(() => expect(starts).toHaveLength(3)); await vi.waitFor(() => expect(saves.size).toBe(2));
    held.get('3/media-1')!.resolve(bytes());
    await vi.waitFor(async () => expect((await command('status', { id: results[2]!.id })).acquisition).toBe('complete'));
    dispose(); await new Promise(resolve => setTimeout(resolve, 0)); dispose = startOffscreen(); await command('hello');
    expect(mocks.transfer).toHaveBeenCalledTimes(2);
    for (const result of results) expect((await consume<ReadResponse>('read', result.id)).locus!.state).toBe('unverified');
  });
});
