import type { Json } from '@locus/capture-core/model';
import { object, type Data, type DataObject } from './relay-parser';
import { normalizeTwitter, type TwitterCandidate } from './source';
import { postUrl } from './urls';
import { validateAuthenticatedTweetSource } from './authenticated-projection';
export { AUTHENTICATED_SOURCE_LIMIT, selectAuthenticatedTweetDetail, type AuthenticatedTweetSource } from './authenticated-projection';

const id = (value: unknown): string | null => typeof value === 'string' && /^\d{1,25}$/.test(value) ? value : null;

/** Rebuild trusted local records from the untrusted, bounded page projection. */
export function normalizeAuthenticatedTwitter(input: unknown, requestedUrl: string, observedAt = new Date().toISOString()): TwitterCandidate {
  const requested = postUrl(requestedUrl), source = validateAuthenticatedTweetSource(input, requestedUrl);
  const tweet = source.tweet, legacy = object(tweet.legacy);
  const user = object(object(object(tweet.core).user_results).result), userCore = object(user.core), sourceEntities = object(legacy.entities);
  const records: Record<string, DataObject> = {};
  const put = (key: string, type: string, fields: DataObject) => { records[key] = { __id: key, __typename: type, ...fields }; return { __ref: key }; };
  const author = put('user', 'User', { rest_id: user.rest_id as Data, core: put('user-core', 'UserCore', userCore as DataObject) });
  const media = (object(legacy.extended_entities).media as DataObject[]).map((raw, index) => {
    const item = object(raw), variants = object(item.video_info).variants;
    const variantRefs = Array.isArray(variants) ? variants.map((value, variantIndex) => { const key = `variant-${index}-${variantIndex}`; put(key, 'ApiMediaEntityVideoVariant', value as DataObject); return key; }) : null;
    const key = `media-${index}`;
    put(key, 'ApiMediaEntity', { ...item as DataObject, original_info: put(`dimensions-${index}`, 'ApiMediaEntityOriginalInfo', item.original_info as DataObject), video_info: put(`video-${index}`, 'ApiMediaEntityVideoInfo', { variants: variantRefs === null ? null : { __refs: variantRefs } }) });
    return key;
  });
  const timestamp = typeof legacy.created_at === 'string' ? Date.parse(legacy.created_at) : NaN;
  const relationship = (kind: string, value: unknown): Data => value === null ? null : id(value) ? put(kind, 'TweetResults', { rest_id: id(value), result: null }) : undefined;
  put('root', 'TweetResults', { rest_id: requested.id, result: put('tweet', 'Tweet', {
    rest_id: requested.id, core: put('core', 'TweetCore', { user_results: put('user-results', 'UserResults', { result: author }) }),
    legacy: put('legacy', 'LegacyTweet', { retweeted_status_results: null }),
    details: put('details', 'TBirdData', { full_text: legacy.full_text as Data, truncated: legacy.truncated as Data, created_at_ms: Number.isFinite(timestamp) ? timestamp : null, display_text_range: legacy.display_text_range as Data, hashtag_entities: sourceEntities.hashtags as Data }),
    note_tweet: tweet.note_tweet, article: tweet.article, media_entities2: { __refs: media },
    reply_to_results: relationship('reply', legacy.in_reply_to_status_id_str), quoted_tweet_results: relationship('quote', legacy.quoted_status_id_str),
    mention_entities: sourceEntities.user_mentions as Data, url_entities: sourceEntities.urls as Data,
  }) });
  const candidate = normalizeTwitter(records, requested.url, observedAt);
  const payload = candidate.payload as Record<string, Json>;
  const context = object(source.textContext);
  if (context.notesRequested !== true || context.articlesRequested !== true) {
    candidate.text = null;
    candidate.textFailure = 'Complete text unavailable: the signed-in request did not enable the required long-form and article fields';
    payload.fullText = null;
  }
  payload.acquisitionSource = 'signed-in-page';
  const relationships = payload.relationships as Record<string, Json>;
  if (id(legacy.conversation_id_str)) relationships.conversationRoot = { state: 'resolved', postId: id(legacy.conversation_id_str) };
  return candidate;
}
