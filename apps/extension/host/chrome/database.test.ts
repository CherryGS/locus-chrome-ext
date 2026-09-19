import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultDatabase } from './database';
import { syntheticSnapshot } from '@/testing/result-fixture';

afterEach(() => vi.restoreAllMocks());
describe('transactional results', () => {
  it('keeps confirmed delivery completion against late weaker writes', async () => {
    const database = new ResultDatabase(crypto.randomUUID());
    const row = { id: crypto.randomUUID(), resultId: crypto.randomUUID(), revision: 1, createdAt: new Date().toISOString(), state: 'complete' as const, partial: false };
    await database.saveDelivery(row);
    expect((await database.saveDelivery({ ...row, state: 'unverified', reason: 'Late lost response' })).state).toBe('complete');
    expect((await database.deliveries())[0]!.state).toBe('complete'); await database.close();
  });
  it('retains coherent Blobs across reopen and grants immutable snapshots through clear', async () => {
    const name = crypto.randomUUID(); const database = new ResultDatabase(name); const snapshot = syntheticSnapshot();
    const saved = await database.commit(snapshot); expect(saved.retention).toEqual({ state:'retained', revision:1 });
    await database.close(); const reopened = new ResultDatabase(name); const grant = (await reopened.read(snapshot.result.id))!;
    expect(await grant.blobs.file!.text()).toBe('synthetic bytes');
    await reopened.clear(snapshot.result.id); expect(await reopened.read(snapshot.result.id)).toBeNull();
    expect(await grant.blobs.file!.text()).toBe('synthetic bytes');
    snapshot.result.revision++; await expect(reopened.commit(snapshot)).rejects.toThrow('cleared');
    await reopened.close();
  });
  it('rejects stale revisions and aborts incoherent updates without losing committed content', async () => {
    const database = new ResultDatabase(crypto.randomUUID()); const snapshot = syntheticSnapshot(); await database.commit(snapshot);
    await expect(database.commit(snapshot)).rejects.toThrow('Stale');
    snapshot.result.revision++; snapshot.blobs = {};
    await expect(database.commit(snapshot)).rejects.toThrow('coherent');
    expect((await database.read(snapshot.result.id))!.result.revision).toBe(1);
    await database.close();
  });
  it('observes transaction aborts and preserves existing results and clear state', async () => {
    const database = new ResultDatabase(crypto.randomUUID()); const snapshot = syntheticSnapshot(); await database.commit(snapshot);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const request = original.apply(this, args); this.transaction.abort(); return request;
    });
    snapshot.result.revision++;
    await expect(database.commit(snapshot)).rejects.toThrow();
    await expect(database.clear(snapshot.result.id)).rejects.toThrow();
    expect((await database.read(snapshot.result.id))!.result.revision).toBe(1);
    await database.close();
  });
});
