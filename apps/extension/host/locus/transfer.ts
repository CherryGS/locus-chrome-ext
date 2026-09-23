import { twitterImportItems } from '@locus/twitter/locus';
import type { Snapshot } from '@locus/capture-core/model';
import { bootstrap, LocusClient, LocusError, type ImportBatch, type Outcome, type Submission } from './client';
import type { LocusConnection, LocusRequest, LocusTransfer } from './model';

export function newTransfer(resultId: string, revision: number): LocusTransfer {
  return { resultId, revision, state: 'waiting', message: 'Waiting for complete capture before saving to Locus', uploads: [] };
}

/** Persist intent before every mutation. Re-entry observes dispatched requests;
 * it never replays uploads/imports whose acceptance might have been lost. */
export async function transferToLocus(snapshot: Snapshot, transfer: LocusTransfer, connection: LocusConnection | undefined,
  save: (value: LocusTransfer) => Promise<void>, options: { transport?: typeof fetch; pause?: () => Promise<void>; signal?: AbortSignal } = {}) {
  const persist = () => save(structuredClone(transfer));
  const pause = options.pause ?? (() => new Promise<void>(resolve => setTimeout(resolve, 750)));
  let uncertain = false;
  let knownFailure = false;
  const deadline = Date.now() + 10 * 60_000;
  const check = () => {
    options.signal?.throwIfAborted();
    if (Date.now() > deadline) throw new Error('Locus is still processing or unavailable. Check the original result to continue');
  };
  try {
    if (transfer.state === 'complete') return;
    check();
    const items = twitterImportItems(snapshot);
    if (!connection) throw new Error('Configure the Locus address and Token in the extension’s connection settings, then continue this save');
    if (transfer.origin && transfer.origin !== connection.origin) throw new Error('This save belongs to another Locus address. Restore that connection to check its result');
    const runId = await bootstrap(connection, options.transport);
    if (transfer.runId && transfer.runId !== runId) {
      uncertain = true;
      throw new Error('Locus restarted. This save belongs to an earlier run; check Locus before starting a new capture. Nothing was replayed');
    }
    transfer.origin = connection.origin; transfer.runId = runId;
    if(!transfer.items)transfer.revision=snapshot.result.revision;
    transfer.items ??= items;
    const client = new LocusClient(connection, runId, options.transport);
    // Check authorization before uploading bytes. Bootstrap alone is public.
    await client.request('tasks');
    async function outcome(request: LocusRequest, send: () => Promise<Submission>): Promise<Outcome & { status: 'complete' }> {
      let submission: Submission;
      check();
      uncertain = true;
      if (request.dispatched) submission = await client.request<Submission>(`requests/${request.id}`);
      else {
        request.dispatched = true;
        await persist();
        check();
        try { submission = await send(); }
        catch {
          // Even an HTTP error can occur after accepted work (e.g. Token reset).
          // Ask about the same request; never infer non-acceptance from transport.
          submission = await client.request<Submission>(`requests/${request.id}`);
        }
      }
      while (submission.status === 'admission_pending') { check(); await pause(); submission = await client.request<Submission>(`requests/${request.id}`); }
      if (submission.status === 'rejected') { uncertain = false; knownFailure=true; throw new LocusError(submission.error.message, submission.error.code); }
      if (submission.status !== 'accepted' || submission.receipt.run_id !== runId || submission.receipt.request_id !== request.id) throw new Error('Locus receipt does not match this save');
      while (true) {
        check();
        const value = await client.request<Outcome>(`tasks/${submission.receipt.task_id}/outcome`);
        if (value.status === 'complete') return value;
        if (value.status !== 'pending') throw new Error('Unsupported Locus task response');
        await pause();
      }
    }
    for (const item of transfer.items) {
      if (!item.assetId) continue;
      let upload = transfer.uploads.find(value => value.assetId === item.assetId);
      if (!upload) { upload = { assetId: item.assetId, request: { id: crypto.randomUUID() } }; transfer.uploads.push(upload); }
      if (upload.fileId) continue;
      const bytes = snapshot.blobs[item.assetId]!;
      transfer.state = 'uploading'; transfer.message = `Uploading file ${transfer.uploads.filter(value => value.fileId).length + 1} of ${snapshot.result.assets.length}`;
      await persist();
      const query = new URLSearchParams({ request_id: upload.request.id, byte_count: String(bytes.size), filename: `${snapshot.result.id}-${item.assetId}` });
      const completed = await outcome(upload.request, () => client.request<Submission>(`uploads?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }));
      if (completed.outcome.status !== 'upload' || !completed.outcome.result) throw new Error('Locus did not confirm a File upload result');
      const observation = completed.outcome.result;
      if (!observation.confirmed_file_id) { uncertain = observation.uncertain;knownFailure=!uncertain; throw new Error(observation.problem ?? 'Locus did not confirm File registration. Inspect this upload in Locus'); }
      upload.fileId = observation.confirmed_file_id;
      uncertain = false;
      await persist();
    }
    transfer.state = 'importing'; transfer.message = 'Files uploaded; saving media and source information in Locus';
    transfer.importRequest ??= { id: crypto.randomUUID() };
    await persist();
    const completed = await outcome(transfer.importRequest, () => client.post<Submission>('import-batches', {
      request_id: transfer.importRequest!.id,
      items: transfer.items!.map(item => ({ file_id: item.assetId ? transfer.uploads.find(value => value.assetId === item.assetId)!.fileId : null, twitter: item.twitter })),
    }));
    if (completed.outcome.status !== 'import_batch' || !completed.outcome.batch_id) throw new Error('Locus did not confirm an import batch');
    transfer.batchId = completed.outcome.batch_id;
    const observed = await client.request<{ run_id: string; batches: ImportBatch[] }>('import-batches');
    const batch = observed.batches.find(value => value.batch_id === transfer.batchId && value.original_request_id === transfer.importRequest!.id);
    if (observed.run_id !== runId || !batch || !batch.original_ended || batch.items.length !== transfer.items.length) throw new Error('The complete import result is not yet attributable. Check again');
    transfer.entityIds = batch.items.flatMap(item => item.current.confirmed_entity_id ? [item.current.confirmed_entity_id] : []);
    uncertain = batch.items.some(item => Object.values(item.current).some(value => value !== null && typeof value === 'object' && 'state' in value && value.state === 'uncertain'));
    if (batch.items.some(item => item.current.overall !== 'success' || !item.current.complete || !item.current.confirmed_entity_id)) {
      knownFailure=!uncertain;
      const reasons = batch.items.flatMap(item => Object.values(item.current).flatMap(value => value !== null && typeof value === 'object' && 'reason' in value && typeof value.reason === 'string' ? [value.reason] : []));
      throw new Error(`Locus import needs attention (${transfer.entityIds.length}/${batch.items.length} entries established). ${reasons.join('; ') || 'Inspect the import stages in Locus; uploaded files and successful stages remain saved'}`);
    }
    transfer.state = 'complete'; transfer.message = `Saved to Locus · ${transfer.entityIds.length} ${transfer.entityIds.length === 1 ? 'entry' : 'entries'}`;
    await persist();
  } catch (error) {
    transfer.state = !knownFailure && (uncertain || transfer.importRequest?.dispatched || transfer.uploads.some(upload=>upload.request.dispatched&&!upload.fileId)) ? 'unverified' : 'failed';
    transfer.message = (error instanceof Error ? error.message : String(error)).replaceAll(connection?.token || '\0', '[redacted]');
    await persist();
  }
}
