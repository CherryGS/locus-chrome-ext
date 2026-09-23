import { availability, type Json, type Snapshot } from '@locus/capture-core/model';

/** The existing Locus Twitter wire fields; this adapter does not enrich captures. */
export interface TwitterImportSnapshot {
  post_id: string; page_url: string; requested_url?: string; text: string;
  author?: { user_id?: string; handle?: string; display_name?: string };
  published_at_unix_ms?: string; observed_at_unix_ms?: string;
  hashtags?: string[];
  references?: { kind: 'reply_to' | 'quote' | 'repost'; post_id: string }[];
  occurrence?: { media_id?: string; capture_local_id: string; label: 'photo' | 'video' | 'animated_image'; alt_text?: string; claims?: { width: number; height: number } };
  representation?: { url: string; claims: { bitrate_bps?: string; quality?: string } };
  preview?: { url: string };
}
const object = (value: Json | undefined): Record<string, Json> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
function text(value: Json | undefined, name: string, limit = 65_536): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string' || value.includes('\0') || new TextEncoder().encode(value).length > limit) throw new Error(`${name} is not valid within Locus's byte limit`);
  return value;
}
function identifier(value: Json | undefined, name: string): string | undefined {
  const result = text(value, name, 20);
  if (result !== undefined && (!/^[1-9]\d*$/.test(result) || BigInt(result) > 18_446_744_073_709_551_615n)) throw new Error(`${name} is not a supported Locus identifier`);
  return result;
}
function url(value: Json | undefined, name: string): string | undefined {
  const result = text(value, name, 8192);
  if (result === undefined) return undefined;
  const parsed = new URL(result);
  if (!/^https?:\/\//.test(result) || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\s\\]/.test(result) || [...result].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127) || /%(?![\da-f]{2})/i.test(result)) throw new Error(`${name} is not a supported URL`);
  return result;
}
function time(value: Json | undefined, name: string): string | undefined {
  if (value == null) return undefined;
  const number = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > 253_402_300_799_999) throw new Error(`${name} is not a supported timestamp`);
  return String(number);
}

export function twitterImportItems(snapshot: Snapshot): { assetId?: string; twitter: TwitterImportSnapshot }[] {
  const { result, blobs, readErrors } = snapshot;
  if (result.site !== 'twitter' || !availability(result).complete) throw new Error('The entire selected Twitter capture must be complete before sending to Locus');
  if (result.records.length !== 1) throw new Error('Unsupported Twitter record layout');
  const record = result.records[0]!;
  if (record.assetIds.length !== result.assets.length || new Set(record.assetIds).size !== record.assetIds.length || result.assets.some(asset => asset.recordId !== record.id || !record.assetIds.includes(asset.id))) throw new Error('Twitter file associations are incomplete');
  for (const asset of result.assets) if (readErrors[asset.id] || !(blobs[asset.id] instanceof Blob) || blobs[asset.id]!.size !== asset.size) throw new Error(`Selected file ${asset.id} is unavailable; nothing was sent`);
  const payload = object(record.payload), author = object(payload.author);
  const postId = identifier(payload.sourceId, 'Post ID'), pageUrl = url(payload.sourceUrl, 'Post URL'), body = text(payload.fullText, 'Post text');
  if (!postId || !pageUrl || body === undefined) throw new Error('Complete post identity, URL and text are required');
  const handle = text(author.username, 'Author handle', 15);
  if (handle !== undefined && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('Author handle is not supported by Locus');
  const base: TwitterImportSnapshot = {
    post_id: postId, page_url: pageUrl, requested_url: url(payload.requestedUrl, 'Requested URL'), text: body,
    author: { user_id: identifier(author.accountId, 'Author ID'), handle, display_name: text(author.displayName, 'Author name', 1024) },
    published_at_unix_ms: time(payload.publishedAt, 'Publication time'), observed_at_unix_ms: time(payload.observedAt, 'Observation time'),
  };
  const hashtags = object(payload.entities).hashtags;
  if (Array.isArray(hashtags)) {
    // Only a completely understood observation may claim an observed list.
    const tags = hashtags.map(tag => text(object(tag).text, 'Hashtag', 1024));
    if (tags.every((tag): tag is string => tag !== undefined && tag.length > 0)) base.hashtags = tags;
    if (tags.length > 128) throw new Error('Too many hashtags for Locus');
  }
  const relationships = object(payload.relationships);
  for (const [field, kind] of [['replyTo', 'reply_to'], ['quote', 'quote']] as const) {
    const post_id = identifier(object(relationships[field]).postId, `${kind} ID`);
    if (post_id) (base.references ??= []).push({ kind, post_id });
  }
  // A repost wrapper is the requested context, not a repost authored by the
  // resolved subject. requested_url already retains that navigation context.
  const items = result.assets.length ? result.assets.map(asset => {
    const media = object(asset.description);
    const label = media.kind === 'animated_gif' ? 'animated_image' : media.kind;
    if (label !== 'photo' && label !== 'video' && label !== 'animated_image') throw new Error('Unsupported selected Twitter media');
    const dimensions = object(media.sourceDimensions);
    const width = dimensions.width, height = dimensions.height;
    if ((width != null || height != null) && (![width, height].every(v => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0xffffffff))) throw new Error('Invalid source dimensions');
    const bitrate = media.bitrate;
    if (bitrate != null && (typeof bitrate !== 'number' || !Number.isSafeInteger(bitrate) || bitrate <= 0)) throw new Error('Invalid representation bitrate');
    const resource = url(media.url, 'Selected resource'), preview = url(media.previewUrl, 'Preview URL');
    if (!resource) throw new Error('Selected media resource is missing');
    return { assetId: asset.id, twitter: { ...base,
      occurrence: { media_id: identifier(media.sourceId, 'Media ID'), capture_local_id: asset.id, label, alt_text: text(media.altText, 'Alternative text'), ...(typeof width === 'number' && typeof height === 'number' ? { claims: { width, height } } : {}) },
      representation: { url: resource, claims: { bitrate_bps: bitrate == null ? undefined : String(bitrate), quality: text(media.quality, 'Quality', 1024) } },
      ...(preview ? { preview: { url: preview } } : {}),
    } satisfies TwitterImportSnapshot };
  }) : [{ twitter: base }];
  for (const item of items) if (new TextEncoder().encode(JSON.stringify(item.twitter)).length > 262_144 - 256) throw new Error('Twitter metadata exceeds Locus’s payload limit');
  return items;
}
