import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inspection, ResultSummary } from '@/host/chrome/protocol';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/host/chrome/protocol', () => ({ coordinator: request }));
import { CaptureStore } from './capture-store';

function deferred<T>() { let resolve!: (value: T) => void;const promise = new Promise<T>(done => { resolve = done; });return { promise, resolve }; }
const inspection = (id: string): Inspection => ({ token: `token-${id}`, expiresAt: Date.now() + 300000, sourceUrl: `https://x.com/synthetic/status/${id}`, label: `Post ${id}`, textPreview: id, textFailure: null, media: [] });
const result = (id: string, source: string, queuePosition?: number): ResultSummary => ({ id, label: `Post ${source}`, sourceUrl: `https://x.com/synthetic/status/${source}`, createdAt: new Date().toISOString(), revision: 1, acquisition: 'pending', retention: { state: 'retained', revision: 1 }, ...(queuePosition === undefined ? {} : { queuePosition }) });
const stores: CaptureStore[] = [];
const create = () => { const store = new CaptureStore();stores.push(store);return store; };
afterEach(() => { stores.splice(0).forEach(store => store.stop());request.mockReset();vi.useRealTimers(); });

describe('page capture queue observer', () => {
  it('updates a reopened page from the matching active task instead of stale passive progress', async () => {
    const first = { ...result('active', '100'), progress: { percent: 10, completedFiles: 0, totalFiles: 1 } };
    const latest = { ...first, progress: { ...first.progress, percent: 70 } };
    const store = create();store.sourceResults([first.sourceUrl], [{ sourceId: '100', summary: first }]);
    request.mockResolvedValue([latest]);await store.refresh();
    expect(store.sourceStatus('100').progress?.percent).toBe(70);
    expect(store.sourceResult('100')?.progress?.percent).toBe(70);
  });

  it('suspends polling during an access outage and resumes with the existing draft', async () => {
    vi.useFakeTimers();
    request.mockImplementation((op: string) => Promise.resolve(op === 'inspect' ? inspection('100') : []));
    const store = create();store.select('https://x.com/synthetic/status/100');store.start();
    await vi.advanceTimersByTimeAsync(0);
    const draft = store.snapshot().drafts['100'];store.pause();request.mockClear();
    await vi.advanceTimersByTimeAsync(9000);expect(request).not.toHaveBeenCalled();
    store.start();await vi.advanceTimersByTimeAsync(3000);
    expect(request.mock.calls.map(([op]) => op)).toEqual(['capture-tasks', 'capture-tasks']);
    expect(store.snapshot().drafts['100']).toBe(draft);
  });

  it('starts a fresh full-scope capture directly and stays compact', async () => {
    const complete = { ...inspection('100'), media: [{ id: 'media-0', kind: 'photo', sourceId: 'photo', reason: null, quality: 'known' }, { id: 'media-1', kind: 'video', sourceId: 'video', reason: 'Unsupported representation', quality: 'unknown' }] };
    request.mockImplementation((op: string) => op === 'inspect' ? Promise.resolve(complete) : op === 'capture' ? Promise.resolve(result('direct', '100')) : op === 'capture-tasks' ? Promise.resolve([]) : new Promise(() => {}));
    const store = create();store.select(complete.sourceUrl);await vi.waitFor(() => expect(store.snapshot().drafts['100']?.inspection).toBeTruthy());
    store.choose('100', 'media-0', false);store.choose('100', 'media-1', false);
    await store.quickCapture(complete.sourceUrl);
    expect(request.mock.calls.filter(([op]) => op === 'inspect')).toHaveLength(2);
    expect(request).toHaveBeenCalledWith('capture', { token: complete.token, selected: ['media-0', 'media-1'] });
    expect(store.snapshot().expanded).toBe(false);expect(store.snapshot().selected).toBeUndefined();
    expect(store.snapshot().tasks[0]?.summary.id).toBe('direct');
  });

  it('coalesces rapid primary activations throughout inspection and submission', async () => {
    const source = deferred<Inspection>();const accepted = deferred<ResultSummary>();
    request.mockImplementation((op: string) => op === 'inspect' ? source.promise : op === 'capture' ? accepted.promise : op === 'capture-tasks' ? Promise.resolve([]) : new Promise(() => {}));
    const store = create();const first = store.quickCapture('https://x.com/synthetic/status/100');
    await store.quickCapture('https://twitter.com/renamed/status/100');source.resolve(inspection('100'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('capture', { token: 'token-100', selected: [] }));
    await store.quickCapture('https://x.com/synthetic/status/100');accepted.resolve(result('direct', '100'));await first;
    await store.quickCapture('https://x.com/synthetic/status/100');
    expect(request.mock.calls.filter(([op]) => op === 'inspect')).toHaveLength(1);
    expect(request.mock.calls.filter(([op]) => op === 'capture')).toHaveLength(1);
    expect(store.snapshot().tasks).toHaveLength(1);
  });

  it('reports inspection failure without silently submitting a text-only result', async () => {
    request.mockRejectedValue(new Error('Source unavailable'));
    const store = create();await store.quickCapture('https://x.com/synthetic/status/100');
    expect(request.mock.calls.map(([op]) => op)).toEqual(['inspect']);
    expect(store.snapshot().drafts['100']?.error).toBe('Source unavailable');expect(store.sourceStatus('100').state).toBe('failed');
    expect(store.snapshot().tasks).toHaveLength(0);expect(store.snapshot().expanded).toBe(false);
  });

  it('adopts an in-flight optional inspection when the primary action is requested', async () => {
    const source = deferred<Inspection>();
    request.mockImplementation((op: string) => op === 'inspect' ? source.promise : op === 'capture' ? Promise.resolve(result('adopted', '100')) : op === 'capture-tasks' ? Promise.resolve([]) : new Promise(() => {}));
    const store = create();store.select('https://x.com/synthetic/status/100');const starting = store.quickCapture('https://x.com/synthetic/status/100');
    source.resolve(inspection('100'));await starting;
    expect(request.mock.calls.filter(([op]) => op === 'inspect')).toHaveLength(1);expect(store.snapshot().tasks[0]?.summary.id).toBe('adopted');
  });

  it('does not submit an unaccepted preparation after the page observer stops', async () => {
    const source = deferred<Inspection>();request.mockReturnValue(source.promise);
    const store = create();const starting = store.quickCapture('https://x.com/synthetic/status/100');store.stop();source.resolve(inspection('100'));await starting;
    expect(request.mock.calls.map(([op]) => op)).toEqual(['inspect']);
  });

  it('does not duplicate a running acquisition just because local retention failed', async () => {
    const running: ResultSummary = { ...result('running', '100'), retention: { state: 'failed', revision: 0, reason: 'Disk full' } };
    request.mockImplementation((op: string) => op === 'capture-tasks' ? Promise.resolve([running]) : Promise.reject(new Error('Unexpected request')));
    const store = create();await store.refresh();await store.quickCapture(running.sourceUrl);
    expect(request.mock.calls.some(([op]) => op === 'inspect' || op === 'capture')).toBe(false);
    expect(store.snapshot().expanded).toBe(true);expect(store.snapshot().tasks[0]?.summary.id).toBe('running');
  });

  it('keeps the second selection open when an earlier submission finishes', async () => {
    const accepted = deferred<ResultSummary>();
    request.mockImplementation((op: string, values: { url?: string }) => op === 'inspect' ? Promise.resolve(inspection(values.url!.split('/').at(-1)!)) : op === 'capture' ? accepted.promise : op === 'capture-tasks' ? Promise.resolve([]) : new Promise(() => {}));
    const store = create();store.select('https://x.com/synthetic/status/100');
    await vi.waitFor(() => expect(store.snapshot().drafts['100']?.inspection).toBeTruthy());
    const adding = store.enqueue('100');store.select('https://x.com/synthetic/status/101');accepted.resolve(result('a', '100'));await adding;
    expect(store.snapshot().selected).toBe('101');expect(store.snapshot().expanded).toBe(true);
    expect(store.snapshot().tasks[0]?.summary.id).toBe('a');
    await vi.waitFor(() => expect(store.snapshot().drafts['101']?.inspection).toBeTruthy());
    store.select('https://x.com/synthetic/status/100');expect(store.snapshot().tasks[0]?.summary.id).toBe('a');
  });

  it('does not let a refresh started before acceptance restore an older queued phase', async () => {
    const current = deferred<ResultSummary[]>();
    request.mockImplementation((op: string) => op === 'capture-tasks' ? current.promise : op === 'inspect' ? Promise.resolve(inspection('100')) : op === 'capture' ? Promise.resolve(result('b', '100')) : Promise.resolve(null));
    const store = create();const refreshing = store.refresh();store.select('https://x.com/synthetic/status/100');
    await vi.waitFor(() => expect(store.snapshot().drafts['100']?.inspection).toBeTruthy());await store.enqueue('100');
    current.resolve([result('b', '100', 1)]);await refreshing;
    expect(store.snapshot().tasks[0]?.summary.queuePosition).toBeUndefined();expect(store.sourceStatus('100').state).toBe('importing');
  });

  it('scopes a late null response to its own task after a newer task is accepted', async () => {
    const old = result('old', '100');const latest = result('new', '100');const held = deferred<ResultSummary | null>();
    let tasks = [old];
    request.mockImplementation((op: string) => op === 'capture-tasks' ? Promise.resolve(tasks) : op === 'status' ? held.promise : op === 'inspect' ? Promise.resolve(inspection('100')) : op === 'capture' ? Promise.resolve(latest) : Promise.resolve(true));
    const store = create();await store.refresh();tasks = [];const refreshing = store.refresh();
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('status', { id: 'old' }));store.select(old.sourceUrl);
    await vi.waitFor(() => expect(store.snapshot().drafts['100']?.inspection).toBeTruthy());await store.enqueue('100');
    held.resolve(null);await refreshing;
    expect(store.snapshot().tasks.map(task => task.summary.id)).toEqual(['new']);expect(store.sourceResult('100')?.id).toBe('new');
    await store.openResult(store.sourceResult('100')!.id);expect(request).toHaveBeenLastCalledWith('open-result', { id: 'new' });
  });
});
