import { describe, expect, it } from 'vitest';
import type { Json, Snapshot } from '@locus/capture-core/model';
import { bilibiliImportItems } from './locus';
import { projectBilibili } from './projection';
import { normalizeBilibili, selectBilibili } from './source';

const pageUrl = 'https://www.bilibili.com/video/BV145PxzCEoE/?p=2';
const cid = '9007199254740993';
const videoUrl = `https://synthetic.bilivideo.com/upgcxcode/23/02/${cid}/${cid}_qe1-1-64.m4s`;
const coverUrl = 'https://i0.hdslb.com/bfs/archive/synthetic.jpg';
const object = (value: Json | undefined) => value as Record<string, Json>;
const payload = (snapshot: Snapshot) => object(snapshot.result.records[0]!.payload);
const selected = (snapshot: Snapshot) => object(payload(snapshot).representation);
function snapshot(silent = false): Snapshot {
  const initial = { bvid: 'BV145PxzCEoE', aid: '116182891959963', cid, p: 2, videoData: {
    bvid: 'BV145PxzCEoE', title: 'Synthetic title', desc: '', desc_v2: null,
    owner: { mid: '18446744073709551615', name: 'Synthetic uploader' }, pic: coverUrl, pubdate: 1710000000,
    rights: { ugc_pay: 0, ugc_pay_preview: 0, is_stein_gate: 0 },
    pages: [{ page: 1, cid: '123', duration: 10, part: 'First' }, { page: 2, cid, duration: 27, part: 'Second' }],
  } };
  const play = { code: 0, data: { timelength: 26422, accept_quality: [64], support_formats: [{ quality: 64, display_desc: 'HD' }], dash: {
    video: [{ id: 64, codecs: 'avc1.640028', width: 580, height: 1280, bandwidth: 1234567, baseUrl: `${videoUrl}?private=discard` }],
    audio: silent ? null : [{ id: 30280, codecs: 'mp4a.40.2', bandwidth: 12345, baseUrl: `https://synthetic.bilivideo.com/upgcxcode/23/02/${cid}/${cid}-1-30280.m4s` }],
    ...(silent ? { flac: null, dolby: { type: 0, audio: null } } : {}),
  } } };
  const result = selectBilibili(normalizeBilibili(projectBilibili(initial, play, pageUrl, true), pageUrl, '2026-09-26T00:00:00.001Z'), ['media-2', 'media-1'], 'result');
  const blobs: Record<string, Blob> = {};
  for (const asset of result.assets) {
    const blob = new Blob([asset.id], { type: object(asset.description).role === 'cover' ? 'image/jpeg' : 'video/mp4' });
    blobs[asset.id] = blob; asset.size = blob.size; asset.mime = blob.type; asset.acquisition = { state: 'acquired' };
  }
  return { result, blobs, readErrors: {} };
}

describe('Bilibili Locus mapping', () => {
  it('maps the real producer shape with exact IDs, selected P, milliseconds and separate cover provenance', () => {
    const input = snapshot(), before = structuredClone(input.result);
    expect(bilibiliImportItems(input)).toEqual([{ assetId: 'media-2', coverAssetId: 'media-1', bilibili: {
      bvid: 'BV145PxzCEoE', aid: '116182891959963', page_url: pageUrl, requested_url: pageUrl,
      title: 'Synthetic title', description: '', author: { user_id: '18446744073709551615', display_name: 'Synthetic uploader' },
      published_at_unix_ms: '1710000000000', observed_at_unix_ms: String(Date.parse('2026-09-26T00:00:00.001Z')),
      part: { cid, number: 2, title: 'Second', claims: { duration_ms: '26422' } },
      representation: { url: videoUrl, claims: { width: 580, height: 1280, bitrate_bps: '1234567', quality: '64 · HD' } },
      preview: { url: coverUrl },
    } }]);
    expect(input.result).toEqual(before);
  });
  it('accepts complete silent video and keeps unsupported audio and codec observations local', () => {
    const input = snapshot(true), item = bilibiliImportItems(input)[0]!;
    expect(selected(input).audioAbsent).toBe(true);
    expect(JSON.stringify(item)).not.toMatch(/audio|codec|profile_url|tags|private=/i);
    expect(item.assetId).toBe('media-2');
  });
  it('maps by associations and roles rather than array position or fixed local IDs', () => {
    const input = snapshot();
    input.result.assets.reverse();
    for (const asset of input.result.assets) {
      const oldId = asset.id;
      asset.id = `local-${oldId}`; asset.recordId = 'local-record';
      input.blobs[asset.id] = input.blobs[oldId]!; delete input.blobs[oldId];
    }
    input.result.records[0]!.id = 'local-record';
    input.result.records[0]!.assetIds = input.result.assets.map(asset => asset.id);
    expect(bilibiliImportItems(input)[0]).toMatchObject({ assetId: 'local-media-2', coverAssetId: 'local-media-1' });
  });
  it('omits unknown optional values and preserves observed empty strings', () => {
    const input = snapshot(), p = payload(input);
    p.uploader = { id: null, name: '' }; p.publishedAt = null; p.observedAt = null;
    Object.assign(object(p.part), { name: '', duration: null });
    Object.assign(selected(input), { width: null, height: null, videoBandwidth: null, quality: null, qualityLabel: '' });
    const mapped = bilibiliImportItems(input)[0]!.bilibili;
    expect(mapped.author).toEqual({ display_name: '' });
    expect(mapped.part).toEqual({ cid, number: 2, title: '' });
    expect(mapped.representation.claims).toEqual({ quality: '' });
    expect(mapped).not.toHaveProperty('published_at_unix_ms'); expect(mapped).not.toHaveProperty('observed_at_unix_ms');
    p.uploader = null; selected(input).qualityLabel = null;
    expect(bilibiliImportItems(input)[0]!.bilibili).not.toHaveProperty('author');
    expect(bilibiliImportItems(input)[0]!.bilibili.representation).not.toHaveProperty('claims');
  });
  it('does not impose Twitter text budgets on supported Bilibili metadata', () => {
    const input = snapshot(); payload(input).title = 'a'.repeat(2000); payload(input).description = 'b'.repeat(70000);
    expect(bilibiliImportItems(input)[0]!.bilibili.description).toHaveLength(70000);
  });
  it('recovers exact integer source milliseconds despite floating-point multiplication', () => {
    const input = snapshot(); object(payload(input).part).duration = 16.019;
    expect(bilibiliImportItems(input)[0]!.bilibili.part.claims?.duration_ms).toBe('16019');
  });
  const malformed: [string, (input: Snapshot) => void][] = [
    ['another site', s => { s.result.site = 'twitter'; }],
    ['missing metadata', s => { s.result.records[0]!.acquisition = { state: 'unavailable' }; }],
    ['pending cover', s => { s.result.assets[0]!.acquisition = { state: 'pending' }; }],
    ['unavailable video', s => { s.result.assets[1]!.acquisition = { state: 'unavailable' }; }],
    ['missing cover Blob', s => { delete s.blobs['media-1']; }],
    ['missing video Blob', s => { delete s.blobs['media-2']; }],
    ['cover read error', s => { s.readErrors['media-1'] = 'Read failed'; }],
    ['video read error', s => { s.readErrors['media-2'] = ''; }],
    ['empty video', s => { s.blobs['media-2'] = new Blob(); s.result.assets[1]!.size = 0; }],
    ['Blob size mismatch', s => { s.result.assets[1]!.size = 100; }],
    ['missing file size', s => { delete s.result.assets[0]!.size; }],
    ['missing record', s => { s.result.records = []; }],
    ['extra record', s => { s.result.records.push(structuredClone(s.result.records[0]!)); }],
    ['missing asset', s => { s.result.assets.pop(); }],
    ['extra asset', s => { s.result.assets.push(structuredClone(s.result.assets[0]!)); }],
    ['duplicate asset ID', s => { s.result.assets[1]!.id = s.result.assets[0]!.id; }],
    ['duplicate association', s => { s.result.records[0]!.assetIds = ['media-1', 'media-1']; }],
    ['foreign association', s => { s.result.assets[1]!.recordId = 'foreign'; }],
    ['unlisted association', s => { s.result.records[0]!.assetIds[1] = 'foreign'; }],
    ['duplicate cover role', s => { object(s.result.assets[1]!.description).role = 'cover'; }],
    ['foreign role', s => { object(s.result.assets[0]!.description).role = 'photo'; }],
    ['malformed asset description', s => { s.result.assets[0]!.description = []; }],
    ['wrong schema', s => { payload(s).schema = 'bilibili-source/1'; }],
    ['missing payload', s => { delete s.result.records[0]!.payload; }],
    ['missing title', s => { payload(s).title = null; }],
    ['missing description', s => { delete payload(s).description; }],
    ['NUL description', s => { payload(s).description = 'a\0b'; }],
    ['unsafe numeric ID', s => { object(payload(s).source).aid = 9007199254740992; }],
    ['overflow ID', s => { object(payload(s).source).cid = '18446744073709551616'; }],
    ['noncanonical ID', s => { object(payload(s).source).aid = '0123'; }],
    ['foreign BVID', s => { object(payload(s).source).bvid = 'BV245PxzCEoE'; }],
    ['foreign requested P', s => { s.result.sourceUrl = pageUrl.replace('p=2', 'p=1'); }],
    ['foreign record P', s => { object(payload(s).part).index = 1; }],
    ['zero P', s => { object(payload(s).part).index = 0; }],
    ['foreign track CID', s => { selected(s).videoSource = videoUrl.replaceAll(cid, '123'); }],
    ['foreign CDN', s => { selected(s).videoSource = videoUrl.replace('synthetic.bilivideo.com', 'evil.example'); }],
    ['foreign cover origin', s => { object(s.result.assets[0]!.description).source = 'https://example.com/image.jpg'; }],
    ['invalid URL escape', s => { selected(s).videoSource = `${videoUrl}?x=%zz`; }],
    ['credential URL', s => { selected(s).videoSource = videoUrl.replace('https://', 'https://secret@'); }],
    ['URL whitespace', s => { selected(s).videoSource = `${videoUrl} `; }],
    ['contradictory selected representation', s => { object(s.result.assets[1]!.description).selected = { ...selected(s), width: 100 }; }],
    ['zero width', s => { selected(s).width = 0; }],
    ['fractional height', s => { selected(s).height = 1.5; }],
    ['overflow dimensions', s => { selected(s).width = 0x100000000; }],
    ['unsafe bitrate', s => { selected(s).videoBandwidth = Number.MAX_SAFE_INTEGER + 1; }],
    ['zero bitrate', s => { selected(s).videoBandwidth = 0; }],
    ['malformed quality label', s => { selected(s).qualityLabel = {}; }],
    ['invalid uploader', s => { object(payload(s).uploader).id = '0'; }],
    ['malformed time', s => { payload(s).observedAt = 'not a date'; }],
    ['negative time', s => { payload(s).publishedAt = '1969-12-31T23:59:59.999Z'; }],
    ['overflow time', s => { payload(s).observedAt = '+010000-01-01T00:00:00.000Z'; }],
    ['negative duration', s => { object(payload(s).part).duration = -1; }],
    ['unsafe duration', s => { object(payload(s).part).duration = Number.MAX_SAFE_INTEGER; }],
    ['sub-millisecond duration', s => { object(payload(s).part).duration = 1.0001; }],
    ['nonfinite duration', s => { object(payload(s).part).duration = NaN; }],
  ];
  it.each(malformed)('rejects %s before producing import input', (_name, mutate) => {
    const input = snapshot(); mutate(input); expect(() => bilibiliImportItems(input)).toThrow();
  });
});
