import { availability, type Json, type Snapshot } from '@locus/capture-core/model';
import { bilibiliResource, partUrl } from './urls';

/** Existing Locus Bilibili wire fields supported by the retained capture. */
export interface BilibiliImportSnapshot {
  bvid: string; aid: string; page_url: string; requested_url: string;
  title: string; description: string;
  author?: { user_id?: string; display_name?: string };
  published_at_unix_ms?: string; observed_at_unix_ms?: string;
  part: { cid: string; number: number; title?: string; claims?: { duration_ms: string } };
  representation: { url: string; claims?: { width?: number; height?: number; bitrate_bps?: string; quality?: string } };
  preview: { url: string };
}

function object(value: Json | undefined): Record<string, Json> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Bilibili metadata object');
  return value;
}
function text(value: Json | undefined, name: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`${name} is not supported by Locus`);
  return value;
}
function requiredText(value: Json | undefined, name: string): string {
  const result = text(value, name);
  if (result === undefined) throw new Error(`${name} is missing`);
  return result;
}
function identifier(value: Json | undefined, name: string): string | undefined {
  const result = text(value, name);
  if (result !== undefined && (!/^[1-9]\d{0,19}$/.test(result) || BigInt(result) > 18_446_744_073_709_551_615n)) throw new Error(`${name} is not a supported Locus identifier`);
  return result;
}
function url(value: Json | undefined, name: string): string {
  const result = requiredText(value, name), parsed = new URL(result);
  if (!/^https?:\/\//i.test(result) || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || result.includes('\\') || [...result].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || /%(?![\da-f]{2})/i.test(result)) throw new Error(`${name} is not a supported URL`);
  return result;
}
function integer(value: Json | undefined, name: string, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new Error(`${name} is not a supported positive integer`);
  return value;
}
function time(value: Json | undefined, name: string): string | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 253_402_300_799_999) throw new Error(`${name} is not a supported timestamp`);
  return String(parsed);
}
function duration(value: Json | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid Bilibili duration');
  // Source seconds originated in integer playinfo milliseconds. Recover that
  // precision without truncating floating-point multiplication artifacts.
  const milliseconds = Math.round(value * 1000);
  if (!Number.isSafeInteger(milliseconds) || Math.abs(value * 1000 - milliseconds) > Number.EPSILON * Math.max(1, Math.abs(value * 1000))) throw new Error('Bilibili duration is not exact safe milliseconds');
  return String(milliseconds);
}
function same(left: Json | undefined, right: Json | undefined): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.entries(left), b = Object.entries(right);
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && same(value, (right as Record<string, Json>)[key]));
}

export function bilibiliImportItems(snapshot: Snapshot): { assetId: string; coverAssetId: string; bilibili: BilibiliImportSnapshot }[] {
  const { result, blobs, readErrors } = snapshot;
  if (result.site !== 'bilibili' || !availability(result).complete) throw new Error('The entire selected Bilibili capture must be complete before sending to Locus');
  if (result.records.length !== 1 || result.assets.length !== 2) throw new Error('Unsupported Bilibili record layout');
  const record = result.records[0]!;
  if (!record.id || record.assetIds.length !== 2 || new Set(record.assetIds).size !== 2 || new Set(result.assets.map(asset => asset.id)).size !== 2 || result.assets.some(asset => !asset.id || asset.recordId !== record.id || !record.assetIds.includes(asset.id))) throw new Error('Bilibili file associations are incomplete');
  for (const asset of result.assets) {
    if (Object.hasOwn(readErrors, asset.id) || !(blobs[asset.id] instanceof Blob) || !Number.isSafeInteger(asset.size) || asset.size! <= 0 || blobs[asset.id]!.size !== asset.size) throw new Error(`Selected file ${asset.id} is unavailable; nothing was sent`);
  }
  const video = result.assets.find(asset => object(asset.description).role === 'current-part-video');
  const cover = result.assets.find(asset => object(asset.description).role === 'cover');
  if (!video || !cover || video === cover) throw new Error('Bilibili requires one current-part video and one parent cover');
  const payload = object(record.payload), source = object(payload.source), part = object(payload.part), selected = object(payload.representation);
  if (payload.schema !== 'bilibili-part/1' || !same(object(video.description).selected, selected)) throw new Error('Bilibili video provenance does not match the selected record');
  const bvid = requiredText(source.bvid, 'BVID'), aid = identifier(source.aid, 'AV ID'), cid = identifier(source.cid, 'Part CID');
  const pageUrl = url(source.url, 'Part URL'), requestedUrl = url(result.sourceUrl, 'Requested URL');
  const page = partUrl(pageUrl), requested = partUrl(requestedUrl), number = integer(part.index, 'Part number', 0xffffffff);
  if (!aid || !cid || page.bvid !== bvid || requested.bvid !== bvid || page.p !== number || requested.p !== number) throw new Error('Bilibili source does not bind the selected part');
  const videoUrl = url(selected.videoSource, 'Video representation URL'), coverUrl = url(object(cover.description).source, 'Cover URL');
  bilibiliResource(videoUrl, 'track', cid);
  bilibiliResource(coverUrl, 'cover');
  const title = requiredText(payload.title, 'Title'), description = requiredText(payload.description, 'Complete description');
  const uploader = payload.uploader == null ? {} : object(payload.uploader);
  const userId = identifier(uploader.id, 'Uploader ID'), displayName = text(uploader.name, 'Uploader name');
  const published = time(payload.publishedAt, 'Publication time'), observed = time(payload.observedAt, 'Observation time');
  const partTitle = text(part.name, 'Part title'), durationMs = duration(part.duration);
  const width = integer(selected.width, 'Video width', 0xffffffff), height = integer(selected.height, 'Video height', 0xffffffff);
  const bitrate = integer(selected.videoBandwidth, 'Video bitrate'), qualityId = integer(selected.quality, 'Video quality');
  const qualityLabel = text(selected.qualityLabel, 'Quality label');
  // Locus has one textual quality claim, so retain both observations there.
  // Codec and DASH audio facts have no native fields and remain local metadata.
  const quality = qualityId === undefined ? qualityLabel : `${qualityId}${qualityLabel === undefined ? '' : ` · ${qualityLabel}`}`;
  const claims = { ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }), ...(bitrate === undefined ? {} : { bitrate_bps: String(bitrate) }), ...(quality === undefined ? {} : { quality }) };
  return [{ assetId: video.id, coverAssetId: cover.id, bilibili: {
    bvid, aid, page_url: pageUrl, requested_url: requestedUrl, title, description,
    ...(userId === undefined && displayName === undefined ? {} : { author: { ...(userId === undefined ? {} : { user_id: userId }), ...(displayName === undefined ? {} : { display_name: displayName }) } }),
    ...(published === undefined ? {} : { published_at_unix_ms: published }), ...(observed === undefined ? {} : { observed_at_unix_ms: observed }),
    part: { cid, number: number!, ...(partTitle === undefined ? {} : { title: partTitle }), ...(durationMs === undefined ? {} : { claims: { duration_ms: durationMs } }) },
    representation: { url: videoUrl, ...(Object.keys(claims).length ? { claims } : {}) }, preview: { url: coverUrl },
  } }];
}
