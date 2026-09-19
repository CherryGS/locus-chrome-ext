import type { Json, Snapshot } from './model';

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4' };
export function serializeSnapshot(snapshot: Snapshot, failed: Record<string, string> = {}) {
  const { result, blobs, readErrors } = snapshot;
  const files = result.assets.map((asset, index) => {
    const reason = failed[asset.id] ?? readErrors[asset.id];
    const blob = blobs[asset.id];
    const path = asset.acquisition.state === 'acquired' && blob && !reason
      ? `files/asset-${String(index + 1).padStart(3, '0')}.${extensions[blob.type] ?? 'bin'}` : null;
    return { ...asset, path, receiver: path ? { state: 'included' } : { state: 'missing', reason: reason ?? asset.acquisition.reason ?? 'Bytes unavailable to receiver' } };
  });
  const metadata = { schema: 'locus-result/1', result, files, receiver: { state: 'snapshot', note: 'Archive inclusion is separate from native download completion.' } };
  // Each JSONL row carries its own selected associations, including missing files.
  const rows: Json[] = result.records.map(record => ({ schema: 'locus-record/1', resultId: result.id, revision: result.revision, site: result.site, sourceUrl: result.sourceUrl, createdAt: result.createdAt, label: result.label, record, files: files.filter(file => record.assetIds.includes(file.id)) } as unknown as Json));
  return { metadata, files, json: JSON.stringify(metadata, null, 2), jsonl: rows.map(row => JSON.stringify(row)).join('\n') + '\n' };
}
