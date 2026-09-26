import type { Snapshot } from '@locus/capture-core/model';
import { projectBilibili } from '@locus/bilibili/projection';
import { normalizeBilibili, selectBilibili } from '@locus/bilibili/source';

export function bilibiliSnapshot(): Snapshot {
  const bvid = 'BV145PxzCEoE', cid = '36531930223', url = `https://www.bilibili.com/video/${bvid}/?p=2`;
  const track = (id: number, codecs: string) => ({ id, codecs, width: 320, height: 180, bandwidth: 64000, baseUrl: `https://synthetic.bilivideo.com/upgcxcode/23/02/${cid}/${cid}-1-${id}.m4s` });
  const initial = { bvid, aid: '116182891959963', cid, p: 2, videoData: {
    bvid, title: 'Synthetic Bilibili', desc: '', desc_v2: null,
    pic: 'https://i0.hdslb.com/bfs/archive/synthetic.png', owner: { mid: '123', name: 'Uploader' }, pubdate: 1710000000,
    rights: { ugc_pay: 0, ugc_pay_preview: 0, is_stein_gate: 0 }, pages: [{ page: 2, cid, duration: 3, part: 'Second part' }],
  } };
  const play = { code: 0, data: { timelength: 3000, accept_quality: [64], support_formats: [{ quality: 64 }], dash: {
    video: [track(64, 'avc1.64000D')], audio: [track(30280, 'mp4a.40.2')],
  } } };
  const candidate = normalizeBilibili(projectBilibili(initial, play, url, true), url, '2026-09-26T00:00:00Z');
  const result = selectBilibili(candidate, ['media-1', 'media-2'], 'bilibili-capture');
  const blobs = { 'media-1': new Blob(['cover'], { type: 'image/png' }), 'media-2': new Blob(['video'], { type: 'video/mp4' }) };
  for (const asset of result.assets) { const blob = blobs[asset.id as keyof typeof blobs]; asset.acquisition = { state: 'acquired' }; asset.size = blob.size; asset.mime = blob.type; }
  result.revision = 3; result.retention = { state: 'retained', revision: 3 };
  return { result, blobs, readErrors: {} };
}
