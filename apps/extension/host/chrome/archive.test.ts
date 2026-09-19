import { describe, expect, it } from 'vitest';
import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import { createArchive } from './archive';
import { syntheticSnapshot } from '@/testing/result-fixture';

describe('receiver ZIP with real separate files', () => {
  it('exports exact bytes and safe matching JSON/JSONL paths with selection provenance', async () => {
    const snapshot = syntheticSnapshot(); const archive = await createArchive(snapshot);
    const reader = new ZipReader(new BlobReader(archive.blob), { useWebWorkers:false }); const entries = (await reader.getEntries()).filter(entry => !entry.directory);
    expect(entries.map(e => e.filename)).toEqual(['files/asset-001.jpg','metadata.json','records.jsonl']);
    const file = await entries[0]!.getData!(new BlobWriter()); expect(await file.text()).toBe('synthetic bytes');
    const metadata = JSON.parse(await entries[1]!.getData!(new TextWriter()));
    const row = JSON.parse((await entries[2]!.getData!(new TextWriter())).trim());
    expect(metadata.files[0].path).toBe(entries[0]!.filename); expect(row.files[0].path).toBe(entries[0]!.filename); expect(row.sourceUrl).toBe(snapshot.result.sourceUrl);
    expect(archive.partial).toBe(false); await reader.close();
  });
  it('preserves selected missing and receiver-read failures without fabricating delivered files', async () => {
    const snapshot = syntheticSnapshot(); snapshot.blobs = {}; snapshot.readErrors.file = 'Injected read failure';
    const archive = await createArchive(snapshot); expect(archive.partial).toBe(true);
    const reader = new ZipReader(new BlobReader(archive.blob), { useWebWorkers:false }); const entries = (await reader.getEntries()).filter(entry => !entry.directory); expect(entries.map(e=>e.filename)).toEqual(['metadata.json','records.jsonl']);
    const metadata = JSON.parse(await entries[0]!.getData!(new TextWriter())); expect(metadata.files[0].acquisition.state).toBe('acquired'); expect(metadata.files[0].receiver.reason).toBe('Injected read failure'); await reader.close();
  });
  it('exports deliberate text-only capture without missing media', async () => {
    const snapshot = syntheticSnapshot(); snapshot.result.assets = []; snapshot.result.records[0]!.assetIds = []; snapshot.blobs = {};
    expect((await createArchive(snapshot)).partial).toBe(false);
  });
});
