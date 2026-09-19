import type { CaptureResult, Json } from '@locus/capture-core/model';
import { object, type Data, type DataObject } from './relay-parser';
import { mediaUrl, postUrl } from './urls';

export interface MediaCandidate { id: string; sourceId: string | null; kind: string; url: string | null; previewUrl?: string | null; reason: string | null; bitrate: number | null; sourceDimensions: { width: number; height: number } | null; representationDimensions: null; sourceOrder: null; quality: string; altText: string | null }
export interface TwitterCandidate { sourceId: string; sourceUrl: string; label: string; text: string | null; textFailure: string | null; payload: Json; media: MediaCandidate[] }
const string = (value: Data) => typeof value === 'string' ? value : null;
const numeric = (value: Data) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const idString = (value: Data) => typeof value === 'string' && /^\d{1,25}$/.test(value) ? value : null;

/** A bound public result can explicitly withhold the selected content. */
export class PublicTwitterSourceUnavailableError extends Error {
  override name = 'PublicTwitterSourceUnavailableError';
}

export function normalizeTwitter(records: Record<string, DataObject>, requestedUrl: string, observedAt = new Date().toISOString()): TwitterCandidate {
  const requested = postUrl(requestedUrl);
  const deref = (value: Data): DataObject | null => { const ref = object(value).__ref; return typeof ref === 'string' ? records[ref] ?? null : null; };
  const resultOf = (value: Data) => { const wrapper = deref(value); return wrapper ? deref(wrapper.result) : null; };
  const roots = Object.values(records).filter(r => r.__typename === 'TweetResults' && r.rest_id === requested.id);
  if (roots.length !== 1) throw new Error('Cannot bind the requested source post');
  let tweet = deref(roots[0]!.result);
  if (tweet?.__typename === 'TweetTombstone') {
    const tombstone = deref(tweet.tombstone);
    const notice = deref(tombstone?.text);
    const reason = notice?.__typename === 'TimelineRichText' ? string(notice.text)?.trim().slice(0, 500) : null;
    throw new PublicTwitterSourceUnavailableError(`X did not provide this post to the public source${reason ? `: ${reason}` : '.'}`);
  }
  if (!tweet || tweet.__typename !== 'Tweet') throw new Error('Requested post has an unsupported source shape');
  if (tweet.rest_id !== requested.id) throw new Error('Requested post identity does not match the returned source');
  let repost: Json = null;
  const visited = new Set<string>();
  while (true) {
    const sourceId = idString(tweet.rest_id);
    if (!sourceId || visited.has(sourceId) || visited.size > 5) throw new Error('Unresolved repost binding');
    visited.add(sourceId);
    const legacy = deref(tweet.legacy);
    if (!legacy || !Object.hasOwn(legacy, 'retweeted_status_results')) throw new Error('Unknown repost semantics in this source format');
    if (legacy.retweeted_status_results === null) break;
    const target = resultOf(legacy.retweeted_status_results);
    if (!target || target.__typename !== 'Tweet') throw new Error('Reposted target is unavailable');
    repost = { presentationPostId: requested.id, targetPostId: idString(target.rest_id) };
    tweet = target;
  }
  const sourceId = idString(tweet.rest_id)!;
  const details = deref(tweet.details);
  const author = resultOf(deref(tweet.core)?.user_results);
  const authorCore = deref(author?.core);
  const rawUsername = string(authorCore?.screen_name);
  const username = rawUsername && /^[A-Za-z0-9_]{1,30}$/.test(rawUsername) ? rawUsername : null;
  const sourceUrl = username && /^[A-Za-z0-9_]{1,30}$/.test(username) ? `https://x.com/${username}/status/${sourceId}` : `https://x.com/i/status/${sourceId}`;
  // Only the observed ordinary TBirdData binding establishes complete text. A note
  // or article requires a separately verified binding, never an excerpt fallback.
  let textFailure: string | null = null;
  if (tweet.note_tweet !== null || tweet.article !== null || details?.__typename !== 'TBirdData' || typeof details.full_text !== 'string' || details.truncated === true) textFailure = 'Full text unavailable: unsupported long-form/article or incomplete source binding';
  const text = textFailure ? null : details!.full_text as string;
  const refs = object(tweet.media_entities2).__refs;
  if (!Array.isArray(refs) || refs.length > 16) throw new Error('Media discovery unavailable or exceeds the 16 attachment capability limit');
  const media = refs.map((ref, index): MediaCandidate => {
    if (typeof ref !== 'string' || !records[ref] || records[ref].__typename !== 'ApiMediaEntity') throw new Error('Unresolved direct-media binding');
    const raw = records[ref];
    if (raw.source_status_id_str != null && raw.source_status_id_str !== sourceId) throw new Error('Media belongs to another post; direct ownership is unresolved');
    const kind = ['photo', 'video', 'animated_gif'].includes(String(raw.type)) ? String(raw.type) : 'unknown';
    const dimensions = deref(raw.original_info);
    const item: MediaCandidate = { id: `media-${index + 1}`, sourceId: idString(raw.id_str), kind, url: null, reason: null, bitrate: null, sourceDimensions: typeof dimensions?.width === 'number' && typeof dimensions.height === 'number' ? { width: dimensions.width, height: dimensions.height } : null, representationDimensions: null, sourceOrder: null, quality: 'Source-provided representation; ranking unverified', altText: string(raw.ext_alt_text) };
    try { item.previewUrl = typeof raw.media_url_https === 'string' ? mediaUrl(raw.media_url_https, false) : null; } catch { item.previewUrl = null; }
    try {
      if (kind === 'photo' && typeof raw.media_url_https === 'string') item.url = mediaUrl(raw.media_url_https, false);
      else if (kind === 'video' || kind === 'animated_gif') {
        const variants = object(deref(raw.video_info)?.variants).__refs;
        if (!Array.isArray(variants)) throw new Error('Video variants unavailable');
        const supported = variants.map(ref => typeof ref === 'string' ? records[ref] : null).filter((v): v is DataObject => !!v && v.__typename === 'ApiMediaEntityVideoVariant' && v.content_type === 'video/mp4' && typeof v.url === 'string');
        if (!supported.length) throw new Error('No complete MP4 representation; playlists and static previews are unsupported');
        const comparable = supported.every(v => typeof v.bitrate === 'number' && v.bitrate > 0);
        if (comparable) supported.sort((a,b) => (b.bitrate as number) - (a.bitrate as number));
        item.url = mediaUrl(supported[0]!.url as string, true);
        item.bitrate = numeric(supported[0]!.bitrate);
        if (comparable) item.quality = 'Highest source-reported bitrate among complete MP4 variants';
      } else throw new Error('Unsupported media kind');
    } catch (error) { item.reason = error instanceof Error ? error.message : String(error); }
    return item;
  });
  function relationship(value: Data): Json {
    if (value === null) return null;
    const wrapper = deref(value);
    const target = wrapper && deref(wrapper.result);
    return { state: target?.__typename === 'Tweet' ? 'resolved' : 'unresolved', postId: idString(target?.rest_id) ?? idString(wrapper?.rest_id) };
  }
  let entityBudget = 10_000;
  function expand(value: Data, depth = 0, seen = new Set<string>()): Json {
    if (--entityBudget < 0) throw new Error('Source entities exceed the 10,000-node capability limit');
    if (depth > 12) return { state: 'unresolved', reason: 'Entity depth limit' };
    if (value === undefined) return { state: 'unknown' };
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => expand(v, depth + 1, seen));
    if (typeof value.__ref === 'string') {
      if (seen.has(value.__ref) || !records[value.__ref]) return { state: 'unresolved' };
      return expand(records[value.__ref], depth + 1, new Set([...seen, value.__ref]));
    }
    if (Array.isArray(value.__refs)) return value.__refs.map(ref => expand({ __ref: ref }, depth + 1, seen));
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__id' && key !== '__typename').map(([key, v]) => [key, expand(v, depth + 1, seen)]));
  }
  const timestamp = numeric(details?.created_at_ms);
  const payload: Json = { schema: 'twitter-post/1', sourceId, sourceUrl, requestedUrl: requested.url, fullText: text, author: { accountId: idString(author?.rest_id), username, displayName: string(authorCore?.name) }, publishedAt: timestamp !== null && Math.abs(timestamp) < 8.64e15 ? new Date(timestamp).toISOString() : null, observedAt, relationships: { repost, replyTo: relationship(tweet.reply_to_results), quote: relationship(tweet.quoted_tweet_results), conversationRoot: { state: 'unknown' } }, entities: { mentions: expand(tweet.mention_entities), links: expand(tweet.url_entities), hashtags: expand(details?.hashtag_entities), displayTextRange: expand(details?.display_text_range) }, selectedMedia: [] };
  return { sourceId, sourceUrl, label: `${username ? '@' + username : 'Twitter'} · ${sourceId}`, text, textFailure, payload, media };
}
export function selectTwitter(candidate: TwitterCandidate, selectedIds: string[], id: string): CaptureResult {
  if (selectedIds.length > 16 || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !candidate.media.some(m => m.id === id))) throw new Error('Invalid media selection');
  const media = candidate.media.filter(m => selectedIds.includes(m.id));
  return { id, site: 'twitter', sourceUrl: candidate.sourceUrl, label: candidate.label, createdAt: new Date().toISOString(), revision: 1, retention: { state: 'pending', revision: 0 }, records: [{ id: 'post', assetIds: media.map(m => m.id), acquisition: candidate.textFailure ? { state: 'unavailable', reason: candidate.textFailure } : { state: 'acquired' }, ...(candidate.textFailure ? {} : { payload: { ...(candidate.payload as Record<string, Json>), selectedMedia: media as unknown as Json } }) }], assets: media.map(m => ({ id: m.id, recordId: 'post', description: m as unknown as Json, acquisition: m.reason ? { state: 'unavailable', reason: m.reason } : { state: 'pending' } })) };
}
