import type { Data, DataObject } from './relay-parser';
import { postUrl } from './urls';

export const AUTHENTICATED_SOURCE_LIMIT = 262_144;
export interface AuthenticatedTweetSource { schema: 'twitter-session/1'; requestedId: string; textContext: { notesRequested: boolean; articlesRequested: boolean }; tweet: DataObject }
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const id = (value: unknown): string | null => typeof value === 'string' && /^\d{1,25}$/.test(value) ? value : null;
function text(value: unknown, limit = 65_536): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > limit) throw new Error('Signed-in source field exceeds its capability limit');
  return value;
}
function list(value: unknown, limit: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Signed-in ${label} is unavailable or exceeds its capability limit`);
  return value;
}
function indices(value: unknown): number[] | null {
  return Array.isArray(value) && value.length === 2 && value.every(v => Number.isSafeInteger(v) && v >= 0) && value[1] >= value[0] ? value as number[] : null;
}
function relationshipField(source: ObjectValue, key: string): DataObject {
  // Omitted/invalid auxiliary IDs are unknown, not a statement that no relation
  // exists. Omission survives JSON transport and the second projection pass.
  if (source[key] === null) return { [key]: null };
  const value = id(source[key]);
  return value ? { [key]: value } : {};
}
function entities(value: unknown, fields: string[]): Data {
  if (value == null) return null;
  return list(value, 512, 'text entities').map(raw => {
    const entry = object(raw);
    return { ...Object.fromEntries(fields.map(field => [field, text(entry[field], 2048)])), indices: indices(entry.indices) };
  });
}
function bounded<T>(value: T): T {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Signed-in source envelope is unavailable');
  if (json.length > AUTHENTICATED_SOURCE_LIMIT || new TextEncoder().encode(json).length > AUTHENTICATED_SOURCE_LIMIT) throw new Error('Signed-in source exceeds the 256 KiB capability limit');
  return value;
}

/** Project only the selected ordinary Tweet; never copy viewer or session state. */
function projectTweet(raw: unknown, requestedId: string): DataObject {
  const tweet = object(raw), legacy = object(tweet.legacy);
  if (tweet.__typename === 'TweetTombstone' || tweet.__typename === 'TweetUnavailable') throw new Error('X did not make this post available to the current signed-in session');
  if (tweet.__typename !== 'Tweet') throw new Error('Unsupported signed-in Tweet shape');
  if (id(tweet.rest_id) !== requestedId || id(legacy.id_str) !== requestedId) throw new Error('Signed-in post identity does not match the selected source');
  if (legacy.truncated !== undefined && typeof legacy.truncated !== 'boolean') throw new Error('Signed-in text completeness flag is unsupported');
  // Repost target bindings differ from the verified ordinary TweetDetail shape.
  // The public producer still handles its verified repost representation.
  if (legacy.retweeted_status_result != null || legacy.retweeted_status_results != null || tweet.retweeted_status_result != null) throw new Error('Signed-in repost binding is unsupported');
  const user = object(object(object(tweet.core).user_results).result), userCore = object(user.core);
  const authorId = user.__typename === 'User' ? id(user.rest_id) : null;
  if (authorId && id(legacy.user_id_str) && authorId !== legacy.user_id_str) throw new Error('Signed-in author identity is inconsistent');
  if (!legacy.entities || typeof legacy.entities !== 'object' || Array.isArray(legacy.entities)) throw new Error('Signed-in media discovery is unavailable');
  if (legacy.extended_entities !== undefined && (!legacy.extended_entities || typeof legacy.extended_entities !== 'object' || Array.isArray(legacy.extended_entities))) throw new Error('Signed-in direct-media details are unavailable');
  const sourceEntities = object(legacy.entities), extended = object(legacy.extended_entities);
  const announced = sourceEntities.media === undefined ? [] : list(sourceEntities.media, 16, 'media discovery');
  const sourceMedia = extended.media === undefined ? [] : list(extended.media, 16, 'direct media');
  if (announced.some(raw => !id(object(raw).id_str) || !sourceMedia.some(media => object(media).id_str === object(raw).id_str))) throw new Error('Signed-in direct-media details are incomplete');
  if (new Set(sourceMedia.map(raw => id(object(raw).id_str))).size !== sourceMedia.length) throw new Error('Signed-in direct-media identity is ambiguous');
  const media: DataObject[] = sourceMedia.map(raw => {
    const item = object(raw), mediaId = id(item.id_str);
    if (!mediaId) throw new Error('Signed-in direct-media identity is unavailable');
    if (item.source_status_id_str != null && id(item.source_status_id_str) !== requestedId) throw new Error('Signed-in media belongs to another post');
    const expanded = text(item.expanded_url, 2048);
    let expandedId: string | null = null;
    if (expanded) {
      const url = new URL(expanded);
      const match = /^\/([A-Za-z0-9_]{1,30})\/status\/(\d{1,25})\/(photo|video)\/\d+$/.exec(url.pathname);
      if (url.protocol !== 'https:' || !['x.com', 'twitter.com'].includes(url.hostname) || url.username || url.password || url.port || !match) throw new Error('Signed-in media ownership link is unsupported');
      expandedId = match[2]!;
      if (expandedId !== requestedId) throw new Error('Signed-in media belongs to another post');
    }
    if (!expandedId && item.source_status_id_str !== requestedId) throw new Error('Signed-in direct-media ownership is unavailable');
    const original = object(item.original_info), video = object(item.video_info);
    const dimension = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000 ? value : null;
    const variants = video.variants == null ? null : list(video.variants, 32, 'video variants').map(rawVariant => {
      const variant = object(rawVariant);
      return { content_type: text(variant.content_type, 128), url: text(variant.url, 2048), bitrate: typeof variant.bitrate === 'number' && Number.isFinite(variant.bitrate) && variant.bitrate > 0 ? variant.bitrate : null };
    });
    return { id_str: mediaId, type: text(item.type, 64), source_status_id_str: requestedId, expanded_url: expanded, media_url_https: text(item.media_url_https, 2048), ext_alt_text: text(item.ext_alt_text, 10_000), original_info: { width: dimension(original.width), height: dimension(original.height) }, video_info: { variants } };
  });
  return {
    __typename: 'Tweet', rest_id: requestedId,
    core: { user_results: { result: { __typename: 'User', rest_id: authorId, core: { screen_name: text(userCore.screen_name, 128), name: text(userCore.name, 1024) } } } },
    // Presence of any unverified note/article forbids using the legacy excerpt.
    note_tweet: tweet.note_tweet == null ? null : { unsupported: true }, article: tweet.article == null ? null : { unsupported: true },
    legacy: {
      id_str: requestedId, user_id_str: id(legacy.user_id_str), full_text: text(legacy.full_text), truncated: legacy.truncated === true,
      created_at: text(legacy.created_at, 128), display_text_range: indices(legacy.display_text_range),
      ...relationshipField(legacy, 'in_reply_to_status_id_str'), ...relationshipField(legacy, 'quoted_status_id_str'), ...relationshipField(legacy, 'conversation_id_str'),
      entities: { user_mentions: entities(sourceEntities.user_mentions, ['id_str', 'screen_name', 'name']), urls: entities(sourceEntities.urls, ['url', 'expanded_url', 'display_url']), hashtags: entities(sourceEntities.hashtags, ['text']), media: announced.map(raw => ({ id_str: id(object(raw).id_str) })) },
      extended_entities: { media },
    },
  };
}

/** The focal entry is an explicit binding; a nested parent/quote is not one. */
export function selectAuthenticatedTweetDetail(response: unknown, requestedUrl: string, requestUrl: string): AuthenticatedTweetSource | null {
  const requested = postUrl(requestedUrl);
  if (typeof requestUrl !== 'string' || requestUrl.length > 32_768) throw new Error('Signed-in request context is unavailable or exceeds its capability limit');
  const endpoint = new URL(requestUrl);
  if (endpoint.protocol !== 'https:' || !['x.com', 'twitter.com'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.port || !/^\/i\/api\/graphql\/[A-Za-z0-9_-]+\/TweetDetail$/.test(endpoint.pathname)) throw new Error('Unsupported signed-in request context');
  const variables = object(JSON.parse(endpoint.searchParams.get('variables') ?? '{}'));
  if (variables.focalTweetId !== requested.id) return null;
  const features = object(JSON.parse(endpoint.searchParams.get('features') ?? '{}'));
  const toggles = object(JSON.parse(endpoint.searchParams.get('fieldToggles') ?? '{}'));
  // Legacy text can be an excerpt if the site's query omitted its long-form
  // discriminants. Preserve media while withholding complete-text attribution.
  const textContext = { notesRequested: features.longform_notetweets_consumption_enabled === true, articlesRequested: features.responsive_web_twitter_article_tweet_consumption_enabled === true && features.articles_preview_enabled === true && toggles.withArticleRichContentState === true };
  const timeline = object(object(object(response).data).threaded_conversation_with_injections_v2);
  const instructions = list(timeline.instructions, 100, 'TweetDetail response');
  const matches: ObjectValue[] = [];
  let entryCount = 0;
  for (const rawInstruction of instructions) {
    const instruction = object(rawInstruction);
    if (instruction.type !== 'TimelineAddEntries') continue;
    const entries = list(instruction.entries, 1000, 'timeline entries');
    entryCount += entries.length;
    if (entryCount > 5000) throw new Error('Signed-in timeline exceeds its capability limit');
    for (const rawEntry of entries) { const entry = object(rawEntry); if (entry.entryId === `tweet-${requested.id}`) matches.push(entry); }
  }
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('Signed-in selected entry is ambiguous');
  const content = object(matches[0]!.content), item = object(content.itemContent);
  if (content.entryType !== 'TimelineTimelineItem' || item.itemType !== 'TimelineTweet') throw new Error('Unsupported signed-in timeline entry');
  return bounded({ schema: 'twitter-session/1', requestedId: requested.id, textContext, tweet: projectTweet(object(item.tweet_results).result, requested.id) });
}

/** Validate the page projection again at the extension's ownership boundary. */
export function validateAuthenticatedTweetSource(input: unknown, requestedUrl: string): AuthenticatedTweetSource {
  const requested = postUrl(requestedUrl), source = object(bounded(input));
  if (source.schema !== 'twitter-session/1' || source.requestedId !== requested.id) throw new Error('Signed-in source envelope does not match the selected post');
  const context = object(source.textContext);
  return { schema: 'twitter-session/1', requestedId: requested.id, textContext: { notesRequested: context.notesRequested === true, articlesRequested: context.articlesRequested === true }, tweet: projectTweet(source.tweet, requested.id) };
}
