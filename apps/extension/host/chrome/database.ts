import type { CaptureResult, Delivery, Snapshot } from '@locus/capture-core/model';

export class ClearedError extends Error { constructor() { super('This result was cleared'); } }
const done = (tx: IDBTransaction) => {
  const completion = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted')); tx.onerror = () => {}; });
  // Request failure may reject a caller before it reaches its completion await.
  // Observe both failures while still returning the rejecting commit promise.
  void completion.catch(() => {});
  return completion;
};
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export class ResultDatabase {
  private connection?: Promise<IDBDatabase>;
  constructor(private name = 'locus-results-v1') {}
  private open() {
    return this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.name, 1); let blocked = false;
      req.onupgradeneeded = () => {
        for (const name of ['results', 'blobs', 'guards', 'deliveries']) req.result.createObjectStore(name);
      };
      req.onsuccess = () => { if (blocked) { req.result.close(); return; } req.result.onversionchange = () => { req.result.close(); this.connection = undefined; }; resolve(req.result); };
      req.onerror = () => { this.connection = undefined; reject(req.error); };
      req.onblocked = () => { blocked = true; this.connection = undefined; reject(new Error('Storage upgrade blocked by another extension view')); };
    });
  }
  async list(): Promise<CaptureResult[]> {
    const db = await this.open(); const tx = db.transaction('results'); const end = done(tx);
    const values = await request(tx.objectStore('results').getAll()); await end; return values;
  }
  async metadata(id: string): Promise<CaptureResult | null> {
    const db=await this.open();const tx=db.transaction('results');const end=done(tx);
    const result=await request<CaptureResult | undefined>(tx.objectStore('results').get(id));await end;return result??null;
  }
  async read(id: string): Promise<Snapshot | null> {
    const db = await this.open(); const tx = db.transaction(['results', 'blobs']); const end = done(tx);
    const result = await request<CaptureResult | undefined>(tx.objectStore('results').get(id));
    const blobs: Record<string, Blob> = {}; const readErrors: Record<string, string> = {};
    if (result) await Promise.all(result.assets.filter(a => a.acquisition.state === 'acquired').map(async asset => {
      const blob = await request<Blob | undefined>(tx.objectStore('blobs').get([id, asset.id]));
      if (blob instanceof Blob) blobs[asset.id] = blob; else readErrors[asset.id] = 'Retained bytes could not be read';
    }));
    await end; return result ? { result, blobs, readErrors } : null;
  }
  async commit(snapshot: Snapshot): Promise<CaptureResult> {
    const db = await this.open(); const tx = db.transaction(['results', 'blobs', 'guards'], 'readwrite'); const end = done(tx);
    try {
      const id = snapshot.result.id;
      if (await request(tx.objectStore('guards').get(id))) throw new ClearedError();
      const previous = await request<CaptureResult | undefined>(tx.objectStore('results').get(id));
      if (previous && previous.revision >= snapshot.result.revision) throw new Error('Stale result revision');
      const result = structuredClone(snapshot.result);
      result.retention = { state: 'retained', revision: result.revision };
      for (const asset of result.assets) if (asset.acquisition.state === 'acquired') {
        const blob = snapshot.blobs[asset.id];
        if (!(blob instanceof Blob) || blob.size !== asset.size || blob.type !== asset.mime) throw new Error('Acquired state requires coherent bytes');
        tx.objectStore('blobs').put(blob, [id, asset.id]);
      }
      tx.objectStore('results').put(result, id); await end; return result;
    } catch (error) { try { tx.abort(); } catch {} await end.catch(() => {}); throw error; }
  }
  async clear(id: string) {
    const db = await this.open(); const tx = db.transaction(['results', 'blobs', 'guards'], 'readwrite'); const end = done(tx);
    const result = await request<CaptureResult | undefined>(tx.objectStore('results').get(id));
    tx.objectStore('guards').put(true, id);
    tx.objectStore('results').delete(id);
    for (const asset of result?.assets ?? []) tx.objectStore('blobs').delete([id, asset.id]);
    await end;
  }
  async isCleared(id: string) { const db = await this.open(); const tx = db.transaction('guards'); const end = done(tx); const guard = await request(tx.objectStore('guards').get(id)); await end; return !!guard; }
  async deliveries(): Promise<Delivery[]> { const db = await this.open(); const tx = db.transaction('deliveries'); const end = done(tx); const rows = await request(tx.objectStore('deliveries').getAll()); await end; return rows; }
  async saveDelivery(delivery: Delivery): Promise<Delivery> {
    const db = await this.open(); const tx = db.transaction('deliveries', 'readwrite'); const end = done(tx);
    const previous = await request<Delivery | undefined>(tx.objectStore('deliveries').get(delivery.id));
    // Confirmed native completion is an absorbing fact, including writes from a
    // late offscreen response or an older worker reconciliation.
    const current = previous?.state === 'complete' ? previous : delivery;
    tx.objectStore('deliveries').put(current, current.id); await end; return current;
  }
  async close() { (await this.connection)?.close(); this.connection = undefined; }
}
