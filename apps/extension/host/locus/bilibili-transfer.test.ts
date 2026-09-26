import { describe, expect, it, vi } from 'vitest';
import { bilibiliSnapshot } from '@/testing/bilibili-result-fixture';
import { newTransfer, transferToLocus } from './transfer';
import type { LocusTransfer } from './model';

const connection = { origin: 'http://127.0.0.1:46321', token: 'private-test-token' };
function backend(options: { lost?: 'video' | 'cover' | 'import'; cover?: 'failed' | 'uncertain'; rejectCover?: boolean } = {}) {
  const requests = new Map<string, { kind: string; asset?: string }>(), mutations: string[] = [];
  let disconnected = false, importId = '', run = 'run-one';
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), path = url.pathname.split('/external/v1/')[1]!;
    if (path === 'bootstrap') return Response.json({ run_id: run });
    if (disconnected) throw new Error('Disconnected');
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${connection.token}`);
    if (path === 'tasks') return Response.json({ tasks: [] });
    const accepted = (id: string) => Response.json({ status: 'accepted', receipt: { run_id: run, request_id: id, task_id: id } });
    if (init?.method === 'POST') {
      const upload = path === 'uploads', body = upload ? undefined : JSON.parse(String(init.body));
      const id = upload ? url.searchParams.get('request_id')! : body.request_id;
      const asset = upload ? await (init.body as Blob).text() : undefined;
      if (body) {
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({ file_id: 'file-video', cover_file_id: 'file-cover', bilibili: { bvid: 'BV145PxzCEoE', description: '', part: { cid: '36531930223', number: 2 } } });
        expect(body.items[0]).not.toHaveProperty('twitter'); importId = id;
      }
      mutations.push(asset ?? 'import'); requests.set(id, { kind: upload ? 'upload' : 'import_batch', asset });
      if (options.lost === (asset ?? 'import')) { disconnected = true; throw new Error('Lost accepted response'); }
      return accepted(id);
    }
    if (path.startsWith('requests/')) { const id = path.slice(9); if (!requests.has(id)) throw new Error('Unknown request'); return accepted(id); }
    if (path.startsWith('tasks/')) {
      const request = requests.get(path.split('/')[1]!)!;
      return Response.json({ status: 'complete', outcome: request.kind === 'upload' ? { status: 'upload', result:
        options.rejectCover && request.asset === 'cover' ? { uncertain: false, problem: 'Cover registration failed' } : { confirmed_file_id: `file-${request.asset}`, uncertain: false },
      } : { status: 'import_batch', batch_id: 'batch' } });
    }
    if (path === 'import-batches') return Response.json({ run_id: run, batches: [{ batch_id: 'batch', original_request_id: importId, original_ended: true, items: [{ item_id: 'part', current: {
      overall: options.cover ? 'failure' : 'success', complete: !options.cover, confirmed_entity_id: 'video-entity',
      bilibili: { component_id: 'bili', source: { state: 'success' }, association: { state: 'success' }, cover: {
        file_id: 'file-cover', confirmed_entity_id: 'cover-entity', establishment: { state: 'success' },
        association: { state: options.cover ?? 'success', reason: options.cover ? 'Cover association needs attention' : null },
        image: { recognition: { state: 'success' }, establishment: { state: 'success' }, interpretation: { state: 'success' }, preview: { state: 'success' } },
      } },
    } }] }] });
    throw new Error(`Unexpected path ${path}`);
  }) as unknown as typeof fetch;
  return { transport, mutations, reconnect() { disconnected = false; }, restart() { run = 'run-two'; disconnected = false; } };
}

describe('Bilibili video and cover delivery', () => {
  it('uploads both distinct files before one import and persists original inputs/confirmed identities', async () => {
    const snapshot = bilibiliSnapshot(), transfer = newTransfer(snapshot.result.id, 3), api = backend(), saved: LocusTransfer[] = [];
    await transferToLocus(snapshot, transfer, connection, async value => { saved.push(value); }, { transport: api.transport });
    expect(api.mutations).toEqual(['video', 'cover', 'import']); expect(transfer.state).toBe('complete');
    expect(transfer.uploads.map(value => value.fileId)).toEqual(['file-video', 'file-cover']);
    expect(saved.some(value => value.uploads[1]?.request.dispatched && !value.uploads[1].fileId)).toBe(true);
    expect(saved.some(value => value.importRequest?.dispatched)).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(connection.token);
  });
  it.each(['metadata', 'video', 'cover', 'missing-cover', 'read-error'])('makes no request when %s is unavailable', async kind => {
    const snapshot = bilibiliSnapshot(), api = backend();
    if (kind === 'metadata') snapshot.result.records[0]!.acquisition = { state: 'unavailable' };
    if (kind === 'video' || kind === 'cover') snapshot.result.assets.find(a => a.id === (kind === 'video' ? 'media-2' : 'media-1'))!.acquisition = { state: 'unavailable' };
    if (kind === 'missing-cover') delete snapshot.blobs['media-1'];
    if (kind === 'read-error') snapshot.readErrors['media-1'] = 'Read failed';
    await transferToLocus(snapshot, newTransfer(snapshot.result.id, 3), connection, async () => {}, { transport: api.transport });
    expect(api.transport).not.toHaveBeenCalled();
  });
  it.each(['video', 'cover', 'import'] as const)('observes a lost %s response without repeating accepted work', async lost => {
    const snapshot = bilibiliSnapshot(), transfer = newTransfer(snapshot.result.id, 3), api = backend({ lost });
    await transferToLocus(snapshot, transfer, connection, async () => {}, { transport: api.transport });
    expect(transfer.state).toBe('unverified'); const restored = structuredClone(transfer); api.reconnect();
    await transferToLocus(snapshot, restored, connection, async () => {}, { transport: api.transport });
    expect(restored.state).toBe('complete'); expect(api.mutations).toEqual(['video', 'cover', 'import']);
  });
  it.each(['failed', 'uncertain'] as const)('exposes a nested %s cover stage without reporting whole success', async cover => {
    const snapshot = bilibiliSnapshot(), transfer = newTransfer(snapshot.result.id, 3), api = backend({ cover });
    await transferToLocus(snapshot, transfer, connection, async () => {}, { transport: api.transport });
    expect(transfer.state).toBe(cover === 'uncertain' ? 'unverified' : 'failed');
    expect(transfer.message).toContain('Cover association needs attention'); expect(transfer.entityIds).toEqual(['video-entity']);
    await transferToLocus(snapshot, transfer, connection, async () => {}, { transport: api.transport });
    expect(api.mutations).toEqual(['video', 'cover', 'import']);
  });
  it('does not import after failed cover registration or replay across backend runs', async () => {
    const snapshot = bilibiliSnapshot(), failed = backend({ rejectCover: true }), transfer = newTransfer(snapshot.result.id, 3);
    await transferToLocus(snapshot, transfer, connection, async () => {}, { transport: failed.transport });
    expect(failed.mutations).toEqual(['video', 'cover']); expect(transfer.state).toBe('failed');
    const api = backend({ lost: 'cover' }), interrupted = newTransfer(snapshot.result.id, 3);
    await transferToLocus(snapshot, interrupted, connection, async () => {}, { transport: api.transport }); api.restart();
    await transferToLocus(snapshot, interrupted, connection, async () => {}, { transport: api.transport });
    expect(interrupted.message).toContain('restarted'); expect(api.mutations).toEqual(['video', 'cover']);
  });
});
