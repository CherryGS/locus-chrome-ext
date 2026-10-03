import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BilibiliMedia } from '@locus/bilibili/source';
import { acquireBilibili } from './bilibili-media';
import type { FractionProgress } from './capture-progress';

const videoUrl = 'https://synthetic.bilivideo.com/upgcxcode/1/2/123/123-1-64.m4s';
const audioUrl = 'https://synthetic.bilivideo.com/upgcxcode/1/2/123/123-1-30280.m4s';
const media = (silent = false): BilibiliMedia => ({
  id: 'media-2', sourceId: '123', kind: 'video', previewUrl: null, reason: null, quality: 'Synthetic', description: {},
  tracks: { duration: 3, video: { url: videoUrl, codec: 'avc1.64000d', bandwidth: 100, width: 320, height: 180, quality: 64 }, audio: silent ? null : { url: audioUrl, codec: 'mp4a.40.2', bandwidth: 100, quality: 30280 } },
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('concurrent Bilibili track acquisition', () => {
  it('starts both leased requests before either completes and sums their live progress', async () => {
    const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
    const fetched: string[] = [], released: string[] = [], progress: FractionProgress[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetched.push(url);
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.set(url, controller); } }), { headers: { 'content-length': '4' } });
    }));
    const lease = vi.fn(async (url: string) => async () => { released.push(url); });
    // Tiny invalid payloads exercise the full downloader before the unchanged
    // remux validation rejects them; real qualified MP4s stay in Chrome smoke.
    const result = acquireBilibili(media(), new AbortController().signal, lease, value => progress.push(value)).catch(error => error);
    await vi.waitFor(() => expect(fetched).toEqual([videoUrl, audioUrl]));
    streams.get(videoUrl)!.enqueue(new Uint8Array([1, 2]));
    streams.get(audioUrl)!.enqueue(new Uint8Array([1]));
    await vi.waitFor(() => expect(progress.at(-1)!.fraction).toBe(.375));
    streams.get(audioUrl)!.enqueue(new Uint8Array([2, 3, 4])); streams.get(audioUrl)!.close();
    await vi.waitFor(() => expect(released).toContain(audioUrl));
    streams.get(videoUrl)!.enqueue(new Uint8Array([3, 4])); streams.get(videoUrl)!.close();
    expect(await result).toBeInstanceOf(Error);
    expect(released.sort()).toEqual([audioUrl, videoUrl].sort());
    expect(progress.at(-1)!.fraction).toBe(1);
  });
  it('aborts the peer and drains both lease releases when a track fails', async () => {
    let fail!: () => void, peerSignal!: AbortSignal, finishRelease!: () => void;
    const released: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, options: RequestInit) => new Promise<Response>((resolve, reject) => {
      if (url === videoUrl) fail = () => resolve(new Response('failed', { status: 503 }));
      else { peerSignal = options.signal!; peerSignal.addEventListener('abort', () => reject(peerSignal.reason), { once: true }); }
    })));
    const lease = async (url: string) => async () => {
      if (url === audioUrl) await new Promise<void>(resolve => { finishRelease = resolve; });
      released.push(url);
    };
    let ended = false;
    const result = acquireBilibili(media(), new AbortController().signal, lease).catch(error => error).finally(() => { ended = true; });
    await vi.waitFor(() => expect(peerSignal).toBeDefined()); fail();
    await vi.waitFor(() => expect(finishRelease).toBeTypeOf('function'));
    expect(peerSignal.aborted).toBe(true); expect(ended).toBe(false);
    finishRelease(); expect(await result).toBeInstanceOf(Error);
    expect(released.sort()).toEqual([audioUrl, videoUrl].sort());
  });
  it('keeps unknown simultaneous lengths indeterminate and requests no audio for a silent source', async () => {
    const progress: FractionProgress[] = [], fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(url); return new Response(new Uint8Array([1, 2, 3, 4])); }));
    const lease = async () => async () => {};
    await expect(acquireBilibili(media(true), new AbortController().signal, lease, value => progress.push(value))).rejects.toThrow();
    expect(fetched).toEqual([videoUrl]); expect(progress[0]!.fraction).toBeNull(); expect(progress.at(-1)!.fraction).toBe(1);
  });
});
