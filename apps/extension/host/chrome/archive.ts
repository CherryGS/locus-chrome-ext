import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { Snapshot } from '@/core/results/model';
import { serializeSnapshot } from '@/core/results/serialization';

export async function createArchive(snapshot: Snapshot) {
  // Store entries without compression: media is already encoded. Disabling both
  // workers and compression streams also prevents remote worker/codec loading.
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false, useCompressionStream: false, level: 0 });
  const failed: Record<string, string> = {};
  const initial = serializeSnapshot(snapshot);
  for (const file of initial.files) if (file.path) {
    // Check readability before appending an entry: a broken writer cannot safely
    // be continued. Any actual ZIP write failure fails this delivery as a whole.
    try { await snapshot.blobs[file.id]!.slice(0, 1).arrayBuffer(); }
    catch (error) { failed[file.id] = `Receiver read failed: ${String(error)}`; continue; }
    await writer.add(file.path, new BlobReader(snapshot.blobs[file.id]!));
  }
  const serialized = serializeSnapshot(snapshot, failed);
  await writer.add('metadata.json', new TextReader(serialized.json));
  await writer.add('records.jsonl', new TextReader(serialized.jsonl));
  return { blob: await writer.close(), partial: serialized.files.some(file => !file.path) || snapshot.result.records.some(record => record.acquisition.state !== 'acquired') };
}
