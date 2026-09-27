import type { Json } from '@locus/capture-core/model';
import { object } from './projection';

const text = (value: unknown) => typeof value === 'string' ? value : null;
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Read-only display fields from the retained part, without another source lookup. */
export function bilibiliPresentation(payload?: Json) {
  const p = object(payload);
  if (p.schema !== 'bilibili-part/1') return null;
  const part = object(p.part), owner = object(p.uploader), selected = object(p.representation), source = object(p.source);
  const uploaderId = text(owner.id), index = positive(part.index);
  const width = positive(selected.width), height = positive(selected.height);
  const videoCodec = text(selected.videoCodec), audioCodec = text(selected.audioCodec);
  const quality = selected.quality ? [
    text(selected.qualityLabel) ?? 'Supported video',
    width && height ? `${width}×${height}` : 'Dimensions unknown',
    selected.audioAbsent === true ? 'No audio' : audioCodec === 'mp4a.40.2' && videoCodec?.startsWith('avc1.') ? 'AVC/AAC' : videoCodec,
  ].filter(Boolean).join(' · ') : 'Video representation unavailable';
  return {
    title: text(p.title) ?? 'Untitled video', description: text(p.description) ?? '',
    uploader: text(owner.name), uploaderId,
    authorUrl: uploaderId && /^\d+$/.test(uploaderId) ? `https://space.bilibili.com/${uploaderId}` : null,
    part: `${index ? `P${index}` : 'Part unknown'}${text(part.name) ? ` · ${part.name}` : ''}`,
    quality, bvid: text(source.bvid), aid: text(source.aid), cid: text(source.cid),
    publishedAt: text(p.publishedAt), observedAt: text(p.observedAt),
    duration: positive(part.duration), durationPrecision: text(part.durationPrecision),
    videoCodec, audioCodec, audioAbsent: selected.audioAbsent === true,
  };
}
