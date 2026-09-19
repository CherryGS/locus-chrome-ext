import { describe, expect, it } from 'vitest';
import { availability } from '@locus/capture-core/model';
import { AUTHENTICATED_SOURCE_LIMIT, normalizeAuthenticatedTwitter, selectAuthenticatedTweetDetail as selectDetail } from './authenticated-source';
import { selectTwitter } from './source';

// Synthetic structural equivalents of the signed-in TweetDetail reply observed
// on 2026-09-20. No account, session, or downloaded public media fixture.
const sourceId = '9007199254740993123';
const url = `https://x.com/synthetic/status/${sourceId}`;
function signedRequest(focalId = sourceId, notes = true) {
  const params = new URLSearchParams({ variables: JSON.stringify({ focalTweetId: focalId }), features: JSON.stringify({ longform_notetweets_consumption_enabled: notes, responsive_web_twitter_article_tweet_consumption_enabled: true, articles_preview_enabled: true }), fieldToggles: JSON.stringify({ withArticleRichContentState: true }) });
  return `https://x.com/i/api/graphql/synthetic/TweetDetail?${params}`;
}
const selectAuthenticatedTweetDetail = (value: unknown, sourceUrl: string) => selectDetail(value, sourceUrl, signedRequest());
function tweet(id = sourceId): any {
  return {
    __typename: 'Tweet', rest_id: id,
    core: { user_results: { result: { __typename: 'User', rest_id: '44', core: { screen_name: 'synthetic', name: 'Synthetic author' }, relationship_perspectives: { following: true } } } },
    legacy: {
      id_str: id, user_id_str: '44', full_text: '@parent Hidden prefix\nOwn message https://t.co/synthetic', created_at: 'Fri Sep 18 03:48:33 +0000 2026',
      in_reply_to_status_id_str: '21', quoted_status_id_str: '22', conversation_id_str: '20', display_text_range: [8, 32], favorite_count: 999,
      entities: { media: [{ id_str: '55' }], user_mentions: [{ id_str: '43', screen_name: 'parent', name: 'Synthetic parent', indices: [0, 7] }], urls: [], hashtags: [] },
      extended_entities: { media: [{
        id_str: '55', type: 'video', expanded_url: `https://x.com/synthetic/status/${id}/video/1`,
        media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/55/preview.jpg', original_info: { width: 480, height: 836 },
        video_info: { variants: [
          { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/55/pl/video.m3u8' },
          { content_type: 'video/mp4', bitrate: 100, url: 'https://video.twimg.com/amplify_video/55/vid/low.mp4' },
          { content_type: 'video/mp4', bitrate: 200, url: 'https://video.twimg.com/amplify_video/55/vid/high.mp4' },
        ] },
      }] },
    },
  };
}
function entry(value: any, id = value.rest_id) {
  return { entryId: `tweet-${id}`, content: { entryType: 'TimelineTimelineItem', itemContent: { itemType: 'TimelineTweet', tweet_results: { result: value } } } };
}
function response(...entries: unknown[]): any { return { data: { threaded_conversation_with_injections_v2: { instructions: [{ type: 'TimelineClearCache' }, { type: 'TimelineAddEntries', entries }] } } }; }
function project(value = tweet()) { return selectAuthenticatedTweetDetail(response(entry(value)), url)!; }

describe('authenticated TweetDetail source binding', () => {
  it('selects only the exact focal entry and drops unrelated/private state', () => {
    const target = tweet(); target.quoted_status_result = { result: tweet('22') };
    const selected = selectAuthenticatedTweetDetail(response(entry(tweet('21')), entry(target), entry(tweet('23'))), url)!;
    const serialized = JSON.stringify(selected);
    expect(serialized).not.toContain('relationship_perspectives'); expect(serialized).not.toContain('favorite_count'); expect(serialized).not.toContain('quoted_status_result');
    const candidate = normalizeAuthenticatedTwitter(selected, url, '2026-09-20T00:00:00.000Z');
    expect(candidate.sourceId).toBe(sourceId); expect(candidate.text).toBe(target.legacy.full_text);
    expect(candidate.payload).toMatchObject({ author: { accountId: '44', username: 'synthetic' }, publishedAt: '2026-09-18T03:48:33.000Z', observedAt: '2026-09-20T00:00:00.000Z', acquisitionSource: 'signed-in-page', relationships: { replyTo: { postId: '21' }, quote: { postId: '22' }, conversationRoot: { postId: '20', state: 'resolved' } } });
    expect(candidate.media).toHaveLength(1);
    expect(candidate.media[0]).toMatchObject({ sourceId: '55', kind: 'video', url: 'https://video.twimg.com/amplify_video/55/vid/high.mp4', bitrate: 200, sourceDimensions: { width: 480, height: 836 }, sourceOrder: null, previewUrl: null });
    expect(selectTwitter(candidate, [], 'local').assets).toHaveLength(0);
  });
  it('does not use a nested quoted target or another post when its entry is absent', () => {
    const parent = tweet('21'); parent.quoted_status_result = { result: tweet() };
    expect(selectAuthenticatedTweetDetail(response(entry(parent)), url)).toBeNull();
    expect(() => selectAuthenticatedTweetDetail(response(entry(tweet('21'), sourceId)), url)).toThrow('identity');
  });
  it('rejects ambiguous, unsupported, and unavailable focal entries', () => {
    expect(() => selectAuthenticatedTweetDetail(response(entry(tweet()), entry(tweet())), url)).toThrow('ambiguous');
    const module = entry(tweet()); module.content.entryType = 'TimelineTimelineModule';
    expect(() => selectAuthenticatedTweetDetail(response(module), url)).toThrow('Unsupported');
    const wrapped = { __typename: 'TweetWithVisibilityResults', tweet: tweet() };
    expect(() => selectAuthenticatedTweetDetail(response(entry(wrapped, sourceId)), url)).toThrow('Unsupported signed-in Tweet');
    expect(() => selectAuthenticatedTweetDetail(response(entry({ __typename: 'TweetTombstone' }, sourceId)), url)).toThrow('current signed-in session');
    expect(() => selectAuthenticatedTweetDetail({ errors: [{ message: 'Sign in' }] }, url)).toThrow('TweetDetail response');
  });
  it('revalidates the projected envelope, source and author in the extension owner', () => {
    const selected = project(); selected.requestedId = '21';
    expect(() => normalizeAuthenticatedTwitter(selected, url)).toThrow('envelope');
    selected.requestedId = sourceId; (selected.tweet.legacy as any).id_str = '21';
    expect(() => normalizeAuthenticatedTwitter(selected, url)).toThrow('identity');
    const inconsistent = tweet(); inconsistent.core.user_results.result.rest_id = '45';
    expect(() => project(inconsistent)).toThrow('author identity');
    expect(() => normalizeAuthenticatedTwitter(project(), 'https://evil.test/synthetic/status/1')).toThrow();
  });
  it('keeps an authored RT prefix but rejects unverified signed-in repost bindings', () => {
    const own = tweet(); own.legacy.full_text = 'RT authored content';
    expect(normalizeAuthenticatedTwitter(project(own), url).text).toBe('RT authored content');
    own.legacy.retweeted_status_result = { result: tweet('21') };
    expect(() => project(own)).toThrow('repost binding');
  });
});

describe('authenticated message and direct-media completeness', () => {
  it('requires matching focal request context and verified text query capabilities', () => {
    expect(selectDetail(response(entry(tweet())), url, signedRequest('21'))).toBeNull();
    const selected = selectDetail(response(entry(tweet())), url, signedRequest(sourceId, false))!;
    const candidate = normalizeAuthenticatedTwitter(selected, url);
    expect(candidate.text).toBeNull(); expect(candidate.textFailure).toContain('required long-form'); expect(candidate.media[0]!.url).toContain('high.mp4');
    const missingContext = project(); delete (missingContext as any).textContext;
    expect(normalizeAuthenticatedTwitter(missingContext, url).text).toBeNull();
    expect(() => selectDetail(response(entry(tweet())), url, 'https://evil.test/TweetDetail')).toThrow('request context');
  });
  it('preserves verified empty text and no attachments as a complete text-only result', () => {
    const empty = tweet(); empty.legacy.full_text = ''; delete empty.legacy.entities.media; delete empty.legacy.extended_entities;
    const candidate = normalizeAuthenticatedTwitter(project(empty), url);
    expect(candidate.text).toBe(''); expect(candidate.media).toEqual([]);
    expect(availability(selectTwitter(candidate, [], 'local')).complete).toBe(true);
  });
  it.each(['missing', 'truncated', 'note', 'article'])('does not count %s text as a complete payload', kind => {
    const value = tweet();
    if (kind === 'missing') delete value.legacy.full_text;
    if (kind === 'truncated') value.legacy.truncated = true;
    if (kind === 'note') value.note_tweet = { note_tweet_results: { result: { text: 'Unverified long form' } } };
    if (kind === 'article') value.article = { article_results: {} };
    const candidate = normalizeAuthenticatedTwitter(project(value), url);
    expect(candidate.text).toBeNull(); expect(candidate.textFailure).toBeTruthy(); expect(candidate.media[0]!.url).toContain('high.mp4');
  });
  it('does not turn missing discovery into an empty selection', () => {
    const value = tweet(); delete value.legacy.extended_entities;
    expect(() => project(value)).toThrow('direct-media details are incomplete');
    delete value.legacy.entities; expect(() => project(value)).toThrow('media discovery');
    const malformed = tweet(); malformed.legacy.extended_entities.media = null;
    expect(() => project(malformed)).toThrow('direct media');
  });
  it.each([null, [], 'missing'])('rejects malformed present extended entities at projection and owner boundaries: %j', malformed => {
    const value = tweet(); delete value.legacy.entities.media; value.legacy.extended_entities = malformed;
    expect(() => project(value)).toThrow('direct-media details');
    const projected = project(); (projected.tweet.legacy as any).extended_entities = malformed;
    expect(() => normalizeAuthenticatedTwitter(projected, url)).toThrow('direct-media details');
  });
  it.each(['true', 0, null])('rejects malformed text completeness at both boundaries: %j', malformed => {
    const value = tweet(); value.legacy.truncated = malformed;
    expect(() => project(value)).toThrow('completeness flag');
    const projected = project(); (projected.tweet.legacy as any).truncated = malformed;
    expect(() => normalizeAuthenticatedTwitter(projected, url)).toThrow('completeness flag');
  });
  it('preserves unknown relationship fields separately from explicit absence', () => {
    const value = tweet(); delete value.legacy.in_reply_to_status_id_str; delete value.legacy.quoted_status_id_str;
    const projected = JSON.parse(JSON.stringify(project(value)));
    expect(projected.tweet.legacy).not.toHaveProperty('in_reply_to_status_id_str');
    expect(normalizeAuthenticatedTwitter(projected, url).payload).toMatchObject({ relationships: { replyTo: { state: 'unresolved', postId: null }, quote: { state: 'unresolved', postId: null } } });
    value.legacy.in_reply_to_status_id_str = null; value.legacy.quoted_status_id_str = null;
    expect(normalizeAuthenticatedTwitter(JSON.parse(JSON.stringify(project(value))), url).payload).toMatchObject({ relationships: { replyTo: null, quote: null } });
  });
  it('rejects foreign media and rechecks ownership after the page bridge', () => {
    const value = tweet(); value.legacy.extended_entities.media[0].source_status_id_str = '21';
    expect(() => project(value)).toThrow('another post');
    delete value.legacy.extended_entities.media[0].source_status_id_str; value.legacy.extended_entities.media[0].expanded_url = 'https://x.com/quoted/status/22/video/1';
    expect(() => project(value)).toThrow('another post');
    const projected = project(); (projected.tweet.legacy as any).extended_entities.media[0].expanded_url = 'https://x.com/other/status/21/video/1';
    expect(() => normalizeAuthenticatedTwitter(projected, url)).toThrow('another post');
  });
  it('retains unavailable motion media without substituting a static thumbnail', () => {
    const value = tweet(); value.legacy.extended_entities.media[0].video_info.variants.splice(1);
    const candidate = normalizeAuthenticatedTwitter(project(value), url);
    expect(candidate.media[0]!.url).toBeNull(); expect(candidate.media[0]!.reason).toContain('playlists');
    expect(selectTwitter(candidate, ['media-1'], 'local').assets[0]!.acquisition.state).toBe('unavailable');
  });
  it('never turns injected media URLs into privileged arbitrary network access', () => {
    const selected = project();
    for (const variant of (selected.tweet.legacy as any).extended_entities.media[0].video_info.variants) variant.url = 'https://evil.test/secret.mp4';
    const candidate = normalizeAuthenticatedTwitter(selected, url);
    expect(candidate.media[0]!.url).toBeNull(); expect(candidate.media[0]!.reason).toContain('Unsupported media');
  });
  it('bounds text, response shape, attachments and the owner envelope', () => {
    const value = tweet(); value.legacy.full_text = 'x'.repeat(65_537);
    expect(() => project(value)).toThrow('capability limit');
    expect(() => normalizeAuthenticatedTwitter({ extra: 'x'.repeat(AUTHENTICATED_SOURCE_LIMIT) }, url)).toThrow('256 KiB');
    const oversized = tweet(); oversized.legacy.extended_entities.media = Array(17).fill(oversized.legacy.extended_entities.media[0]);
    expect(() => project(oversized)).toThrow('capability limit');
    const broken = response(); broken.data.threaded_conversation_with_injections_v2.instructions = Array(101).fill({});
    expect(() => selectAuthenticatedTweetDetail(broken, url)).toThrow('capability limit');
  });
});
