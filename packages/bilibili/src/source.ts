import type { CaptureResult, Json } from '@locus/capture-core/model';
import { identity, object, BILIBILI_SOURCE_LIMIT } from './projection';
import { bilibiliResource, bilibiliTrackResource, partUrl, sourceResource } from './urls';
import { diagnosticError } from '@locus/capture-core/diagnostics';
export interface BilibiliTrack { url: string; codec: string; bandwidth: number; width?: number; height?: number; quality: number }
export interface BilibiliMedia { id: string; kind: 'cover' | 'video'; sourceId: string; previewUrl: string | null; reason: string | null; quality: string; url?: string; tracks?: { video: BilibiliTrack; audio: BilibiliTrack | null; duration: number }; description: Json }
export interface BilibiliCandidate { site: 'bilibili'; sourceUrl: string; label: string; text: string | null; textFailure: string | null; payload: Json | null; media: BilibiliMedia[] }
const text = (value: unknown) => typeof value === 'string' ? value : null;
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
export function normalizeBilibili(input: unknown, requested: string, observedAt = new Date().toISOString()): BilibiliCandidate {
  try { return normalizeSource(input, requested, observedAt); }
  catch (error) { const source = object(input), video = object(source.video); throw diagnosticError('BILI_SOURCE_BINDING_FAILED', 'bilibili.source.binding', 'Cannot bind the selected Bilibili source', { requested, schema: source.schema, loginVerified: source.login === true, root: source.root, part: video.part }, error); }
}
function normalizeSource(input: unknown, requested: string, observedAt: string): BilibiliCandidate {
  if (new TextEncoder().encode(JSON.stringify(input)).length > BILIBILI_SOURCE_LIMIT) throw new Error('Bilibili source limit exceeded');
  const source = object(input), root = object(source.root), video = object(source.video), part = object(video.part), play = object(source.play), target = partUrl(requested);
  if (source.schema !== 'bilibili-source/1' || source.login !== true || source.requested !== target.url || root.bvid !== target.bvid || video.bvid !== target.bvid || root.p !== target.p || part.page !== target.p) throw new Error('Unbound Bilibili current-part source');
  const aid = identity(root.aid), cid = identity(root.cid); if (identity(part.cid) !== cid) throw new Error('Conflicting selected Bilibili CID');
  const rights = object(video.rights);
  const flagged = (value: unknown) => value !== null && value !== undefined && value !== false && value !== 0;
  const accessFailure = ![false, 0].includes(rights.ugc_pay_preview as boolean | number) || ![false, 0].includes(rights.is_stein_gate as boolean | number) || [rights.ugc_pay, video.is_upower_exclusive, video.is_upower_play, video.is_upower_preview, play.is_preview, play.preview].some(flagged) || (typeof video.state === 'number' && video.state < 0) ? 'Paid preview, interactive, or unverified complete-source access' : null;
  let description: string | null = null;
  if (Array.isArray(video.desc_v2) && video.desc_v2.length) {
    const segments = video.desc_v2.map(value => {
      const segment = object(value), raw = text(segment.raw_text);
      if (raw === null) return null;
      if (segment.type === 1) return raw;
      if (segment.type === 2 && raw.length) {
        try { identity(segment.biz_id); } catch { return null; }
        // Native mention links render both the @ prefix and a trailing space.
        return `@${raw} `;
      }
      return null;
    });
    if (segments.every(segment => segment !== null)) description = segments.join('');
  }
  else if (video.desc === '' && (video.desc_v2 === null || Array.isArray(video.desc_v2) && !video.desc_v2.length)) description = '';
  const title = text(video.title), duration = positive(play.timelength) ? Number(play.timelength) / 1000 : null;
  const metadataFailure = title === null || description === null ? 'Complete title/description unavailable; unsupported description source' : null;
  const owner = object(video.owner); let uploaderId: string | null = null; try { uploaderId = identity(owner.mid); } catch {}
  const coarseDuration = positive(part.duration);
  const published = positive(video.pubdate) ? new Date(Number(video.pubdate) * 1000) : null;
  const metadata = { schema: 'bilibili-part/1', source: { bvid: target.bvid, aid, cid, url: target.url }, title, description, uploader: { id: uploaderId, name: text(owner.name) }, part: { index: target.p, name: text(part.part), duration: coarseDuration, durationPrecision: coarseDuration ? 'coarse-seconds' : null }, publishedAt: published && Number.isFinite(published.getTime()) ? published.toISOString() : null, observedAt };
  let coverUrl: string | undefined, coverReason: string | null = null;
  try { coverUrl = bilibiliResource(String(video.pic), 'cover'); } catch (error) { coverReason = diagnosticError('BILI_COVER_SOURCE_INVALID', 'bilibili.source.cover', 'Cover source is missing or unsupported', { source: video.pic }, error).message; }
  const media: BilibiliMedia[] = [{ id: 'media-1', kind: 'cover', sourceId: target.bvid, previewUrl: null, url: coverUrl, reason: coverReason, quality: 'Parent submission cover', description: { role: 'cover', source: coverUrl ? sourceResource(coverUrl) : null } }];
  let tracks: BilibiliMedia['tracks'], reason = accessFailure; let selection: Json = null, qualityLabel: string | null = null;
  let stage = 'bilibili.source.access';
  try {
    if (accessFailure) throw new Error(accessFailure);
    stage = 'bilibili.source.duration';
    if (play.code !== 0 || !duration || !positive(part.duration) || Math.abs(Number(part.duration) - duration) > 1.5) throw new Error('Playinfo duration does not bind the selected part');
    if (duration > 600) throw new Error('Video exceeds the current 600-second assembly capability');
    const qualities = play.accept_quality, formats = play.support_formats, dash = object(play.dash);
    stage = 'bilibili.source.quality-order';
    if (!Array.isArray(qualities) || !qualities.length || qualities.some(q => !Number.isSafeInteger(q) || q <= 0) || new Set(qualities).size !== qualities.length || !Array.isArray(formats) || formats.length !== qualities.length || formats.some((f, i) => object(f).quality !== qualities[i])) throw new Error('Source quality ordering is missing or contradictory');
    stage = 'bilibili.source.dash';
    const silent = dash.audioAbsent === true && dash.audio === null;
    if (!Array.isArray(dash.video) || !dash.video.length || !silent && (!Array.isArray(dash.audio) || !dash.audio.length)) throw new Error('Complete DASH picture and required audio are unavailable');
    const normalize = (value: unknown, kind: 'video' | 'audio'): BilibiliTrack => {
      const t = object(value), bandwidth = positive(t.bandwidth), q = Number(t.id), codec = String(t.codecs);
      if (!bandwidth || !Number.isSafeInteger(q)) throw new Error('Representation attributes are unverified');
      const url = bilibiliTrackResource(t, cid);
      if (kind === 'video' && (!qualities.includes(q) || !positive(t.width) || !positive(t.height))) throw new Error('Actual video representation is outside verified quality membership');
      return { url, codec, bandwidth, quality: q, ...(kind === 'video' ? { width: Number(t.width), height: Number(t.height) } : {}) };
    };
    // Every supplied path must agree on selected CID; no unrelated track can silently participate.
    stage = 'bilibili.source.representation-binding';
    const videos = dash.video.map(value => normalize(value, 'video')), audios = (Array.isArray(dash.audio) ? dash.audio : []).map(value => normalize(value, 'audio'));
    stage = 'bilibili.source.codec-selection';
    const supported = videos.filter(v => /^avc1\.[0-9a-f]{6}$/i.test(v.codec));
    for (const q of qualities) { const equivalent=supported.filter(v=>v.quality===q);if(equivalent.some(v=>v.width!==equivalent[0]?.width||v.height!==equivalent[0]?.height))throw new Error('Equivalent quality representations disagree on dimensions'); }
    const ranked = qualities.map(q => supported.filter(v => v.quality === q).sort((a, b) => b.bandwidth - a.bandwidth)[0]).filter((v): v is BilibiliTrack => !!v);
    if (!ranked.length) throw new Error('No qualified AVC representation; AV1/HEVC/HDR are not supported');
    for (let i = 1; i < ranked.length; i++) if (ranked[i]!.width! > ranked[i - 1]!.width! || ranked[i]!.height! > ranked[i - 1]!.height!) throw new Error('Actual representation dimensions contradict quality ordering');
    const audio = audios.filter(a => a.codec === 'mp4a.40.2').sort((a, b) => b.bandwidth - a.bandwidth)[0] ?? null; if (!audio && !silent) throw new Error('Required AAC audio is unavailable');
    tracks = { video: ranked[0]!, audio, duration };
    qualityLabel = text(object(formats.find(format => object(format).quality === tracks!.video.quality)).display_desc);
    selection = { quality: tracks.video.quality, qualityLabel, width: tracks.video.width!, height: tracks.video.height!, videoCodec: tracks.video.codec, audioCodec: audio?.codec ?? null, videoBandwidth: tracks.video.bandwidth, audioBandwidth: audio?.bandwidth ?? null, excludedCodecs: [...new Set(videos.filter(v => !supported.includes(v)).map(v => v.codec))], videoSource: sourceResource(tracks.video.url), audioSource: audio ? sourceResource(audio.url) : null, audioAbsent: silent };
  } catch (error) {
    const dash = object(play.dash), representations = (items: unknown) => Array.isArray(items) ? items.map(item => { const value = object(item); return { quality: value.id, codec: value.codecs, width: value.width, height: value.height, bandwidth: value.bandwidth, source: value.baseUrl ?? value.base_url, backups: value.backupUrl ?? value.backup_url }; }) : null;
    reason = diagnosticError('BILI_VIDEO_SOURCE_REJECTED', stage, error instanceof Error ? error.message : 'Video source unavailable', { requested, cid, playCode: play.code, durationSeconds: duration, partDurationSeconds: part.duration, limitSeconds: 600, acceptQuality: play.accept_quality, formatQualities: Array.isArray(play.support_formats) ? play.support_formats.map(format => object(format).quality) : null, rights, preview: { isPreview: play.is_preview, preview: play.preview, exclusive: video.is_upower_exclusive, upowerPlay: video.is_upower_play, upowerPreview: video.is_upower_preview }, video: representations(dash.video), audio: representations(dash.audio), audioAbsent: dash.audioAbsent }, error).message;
  }
  if (tracks) { metadata.part.duration = tracks.duration; metadata.part.durationPrecision = 'playinfo'; }
  media.push({ id: 'media-2', kind: 'video', sourceId: cid, previewUrl: null, tracks, reason, quality: tracks ? `${qualityLabel ?? 'Supported video'} · ${tracks.video.width}×${tracks.video.height} · ${tracks.audio ? 'AVC/AAC' : 'AVC · no audio'}` : 'Video unavailable', description: { role: 'current-part-video', selected: selection } });
  const textFailure = metadataFailure ? diagnosticError('BILI_METADATA_INCOMPLETE', 'bilibili.source.metadata', metadataFailure, { requested, titleAvailable: title !== null, descriptionAvailable: description !== null, descriptionLength: typeof video.desc === 'string' ? video.desc.length : null, descriptionSegmentTypes: Array.isArray(video.desc_v2) ? video.desc_v2.map(segment => object(segment).type) : null }).message : null;
  return { site: 'bilibili', sourceUrl: target.url, label: `${target.bvid} · P${target.p}${title ? ` · ${title}` : ''}`, text: textFailure ? null : `${title}\n\n${description}`, textFailure, payload: textFailure ? null : { ...metadata, representation: selection }, media };
}
export function selectBilibili(candidate: BilibiliCandidate, selected: string[], id: string): CaptureResult {
  if (selected.length !== 2 || !['media-1', 'media-2'].every(key => selected.includes(key))) throw new Error('Bilibili capture expects the current part video and parent cover');
  return { id, site: 'bilibili', label: candidate.label, sourceUrl: candidate.sourceUrl, createdAt: new Date().toISOString(), revision: 1, retention: { state: 'pending', revision: 0 }, records: [{ id: 'part', assetIds: selected, acquisition: candidate.payload ? { state: 'acquired' } : { state: 'unavailable', reason: candidate.textFailure ?? 'Metadata unavailable' }, ...(candidate.payload ? { payload: candidate.payload } : {}) }], assets: candidate.media.map(media => ({ id: media.id, recordId: 'part', description: media.description, acquisition: media.reason ? { state: 'unavailable', reason: media.reason } : { state: 'pending' } })) };
}
