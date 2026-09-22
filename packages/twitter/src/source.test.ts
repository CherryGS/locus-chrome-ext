import { describe, expect, it } from 'vitest';
import { availability } from '@locus/capture-core/model';
import { normalizeTwitter, PublicTwitterSourceUnavailableError, selectTwitter } from './source';
import { parseRelay, type DataObject } from './relay-parser';
import { mediaUrl, postUrl } from './urls';

// Synthetic equivalents of the public Relay bindings observed 2026-09-19.
// No copied conversation, account data, tokens or downloaded public media.
export function syntheticRecords(id = '9007199254740993123') {
  const records: Record<string, DataObject> = {};
  const put = (key: string, type: string, fields: DataObject) => { records[key] = { __id: key, __typename: type, ...fields }; return { __ref: key }; };
  const core = put('author-core', 'UserCore', { screen_name: 'SyntheticAuthor', name: 'Synthetic author' });
  const author = put('author', 'User', { rest_id: '9007199254740993999', core });
  const users = put('users', 'UserResults', { result: author });
  const tweetCore = put('core', 'TweetCore', { user_results: users });
  const legacy = put('legacy', 'LegacyTweet', { retweeted_status_results: null });
  const details = put('details', 'TBirdData', { full_text: '@other Hidden reply\nFull message', display_text_range: [6,6], created_at_ms: 1711047760000, hashtag_entities: { __refs: [] } });
  const tweet = put('tweet', 'Tweet', { rest_id: id, core: tweetCore, legacy, details, article: null, note_tweet: null, media_entities2: { __refs: [] }, reply_to_results: null, quoted_tweet_results: null, mention_entities: { __refs: [] }, url_entities: { __refs: [] } });
  put('root', 'TweetResults', { rest_id: id, result: tweet });
  return records;
}
function addMedia(records: Record<string, DataObject>, type = 'photo') {
  records.media = { __id: 'media', __typename: 'ApiMediaEntity', type, id_str: '9007199254740993111', source_status_id_str: null, media_url_https: 'https://pbs.twimg.com/media/synthetic.jpg', original_info: { __ref: 'dimensions' }, video_info: { __ref: 'video' } };
  records.dimensions = { __id: 'dimensions', __typename: 'ApiMediaEntityOriginalInfo', width: 640, height: 360 };
  records.tweet!.media_entities2 = { __refs: ['media'] };
}
// Structural equivalent of the bound public NoteTweet observed 2026-09-22.
function addNote(records: Record<string, DataObject>) {
  records.tweet!.note_tweet = { __ref: 'note-data' };
  records['note-data'] = { __typename: 'NoteTweetData', is_expandable: true, note_tweet_results: { __ref: 'note-results' } };
  records['note-results'] = { __typename: 'NoteTweetResults', result: { __ref: 'note' } };
  records.note = { __typename: 'NoteTweet', rest_id: '77', id: btoa('NoteTweet:77'), text: 'Synthetic full long post\nwith a final paragraph 😀', entity_set: { __ref: 'note-entities' } };
  records['note-entities'] = { __typename: 'EntitySet', user_mentions: { __refs: [] }, urls: { __refs: ['note-url'] }, hashtags: { __refs: [] } };
  records['note-url'] = { __typename: 'UrlEntity', expanded_url: 'https://example.com/full-note', indices: [10, 20] };
  records.details!.full_text = 'Synthetic excerpt';records.details!.truncated = true;
}
const url = 'https://x.com/OldUsername/status/9007199254740993123';
describe('restricted Relay data grammar', () => {
  it('reads data assignments and reuse without running surrounding code', () => {
    const records = parseRelay('evil(); const x={relayRecords:$R[0]={a:$R[1]={__id:"a",__typename:"Test",empty:"",flag:!0,optional:void 0,list:$R[2]=[1]},b:{__id:"b",__typename:"Test",list:$R[2]}}};');
    expect(records.a!.empty).toBe(''); expect(records.b!.list).toEqual([1]);
    expect(parseRelay('({relayRecords:{a:{__id:"a",__typename:"Auxiliary",ratio:1.25}}})').a!.ratio).toBe(1.25);
  });
  it.each(['call()', 'new Evil()', '(()=>1)()', '{get x(){return 1}}', '{__proto__:null}', '{constructor:1}', '$R[99]', '9007199254740993', '{...x}', '{x:1,x:2}'])('rejects untrusted expression %s', expression => {
    expect(() => parseRelay(`const x={relayRecords:{a:{__id:"a",__typename:"Test",value:${expression}}}}`)).toThrow();
  });
  it('rejects excessive data depth and ambiguous maps', () => {
    expect(() => parseRelay(`({relayRecords:${'['.repeat(100)}0${']'.repeat(100)}})`)).toThrow();
    expect(() => parseRelay('({relayRecords:{},other:{relayRecords:{}}})')).toThrow();
  });
});
describe('Twitter selection and ownership', () => {
  it('reads the bound long-post text and note entities, never the ordinary excerpt or another note', () => {
    const records = syntheticRecords();addMedia(records);addNote(records);
    records.otherNote = { ...records.note!, rest_id: '88', id: btoa('NoteTweet:88'), text: 'Unrelated longer note'.repeat(20) };
    const candidate = normalizeTwitter(records, url), result = selectTwitter(candidate, [], 'local');
    expect(candidate.textFailure).toBeNull();expect(candidate.text).toBe(records.note!.text);expect(candidate.sourceId).toBe('9007199254740993123');expect(candidate.media).toHaveLength(1);
    expect(result.records[0]!.payload).toMatchObject({ noteId: '77', fullText: records.note!.text, entities: { links: [{ expanded_url: 'https://example.com/full-note', indices: [10, 20] }], mentions: [], hashtags: [], displayTextRange: { state: 'unknown' } } });
    expect(availability(result).complete).toBe(true);
  });
  it.each(['missing', 'wrong-type', 'id-mismatch', 'truncated', 'missing-text', 'article'])('does not promote an excerpt when the note binding is %s', fault => {
    const records = syntheticRecords();addMedia(records);addNote(records);
    if (fault === 'missing') delete records.note;
    if (fault === 'wrong-type') records['note-results']!.__typename = 'UnknownNoteResults';
    if (fault === 'id-mismatch') records.note!.rest_id = '88';
    if (fault === 'truncated') records.note!.truncated = true;
    if (fault === 'missing-text') delete records.note!.text;
    if (fault === 'article') records.tweet!.article = { __ref: 'article' };
    const candidate = normalizeTwitter(records, url);expect(candidate.text).toBeNull();expect(candidate.textFailure).toBeTruthy();expect(candidate.media).toHaveLength(1);
  });
  it('preserves known-empty note text and unknown auxiliary entities', () => {
    const records = syntheticRecords();addNote(records);records.note!.text = '';delete records['note-entities'];
    const candidate = normalizeTwitter(records, url);expect(candidate.text).toBe('');expect(candidate.textFailure).toBeNull();
    expect((candidate.payload as any).entities.links).toEqual({ state: 'unknown' });
  });
  it('reports a bound login tombstone without substituting a nearby accessible post', () => {
    const records = syntheticRecords();
    records.root!.result = { __ref: 'withheld' };
    records.withheld = { __id: 'withheld', __typename: 'TweetTombstone', tombstone: { __ref: 'notice' } };
    records.notice = { __id: 'notice', __typename: 'BlurredMediaTombstone', text: { __ref: 'notice-text' } };
    records['notice-text'] = { __id: 'notice-text', __typename: 'TimelineRichText', text: 'Log in to X to view this post.' };
    expect(() => normalizeTwitter(records, url)).toThrow(PublicTwitterSourceUnavailableError);
    expect(() => normalizeTwitter(records, url)).toThrow('Log in to X');
    records.tweet!.rest_id = '21';
    expect(() => normalizeTwitter(records, url)).toThrow(PublicTwitterSourceUnavailableError);
  });
  it('keeps unknown source shapes and conflicting identity distinct from public unavailability', () => {
    const records = syntheticRecords();
    records.tweet!.__typename = 'UnknownTweetWrapper';
    expect(() => normalizeTwitter(records, url)).toThrow('unsupported source shape');
    records.tweet!.__typename = 'Tweet'; records.tweet!.rest_id = '21';
    expect(() => normalizeTwitter(records, url)).toThrow('identity does not match');
  });
  it('preserves hidden full text, large IDs and author identity despite changed username', () => {
    const candidate = normalizeTwitter(syntheticRecords(), url);
    expect(candidate.text).toBe('@other Hidden reply\nFull message');
    expect(candidate.sourceId).toBe('9007199254740993123');
    expect(candidate.sourceUrl).toContain('SyntheticAuthor');
    expect(availability(selectTwitter(candidate, [], 'local')).complete).toBe(true);
    expect(availability({ ...selectTwitter(candidate, [], 'local'), records: [] }).complete).toBe(false);
  });
  it('distinguishes known-empty from absent and unsupported full text', () => {
    const records = syntheticRecords(); records.details!.full_text = '';
    expect(normalizeTwitter(records, url).text).toBe('');
    delete records.details!.full_text;
    expect(normalizeTwitter(records, url).textFailure).toBeTruthy();
    records.details!.full_text = 'Excerpt'; records.tweet!.note_tweet = { __ref: 'unknown-note' };
    expect(normalizeTwitter(records, url).textFailure).toBeTruthy();
    records.tweet!.note_tweet = null; records.tweet!.article = { __ref: 'article' };
    expect(normalizeTwitter(records, url).text).toBeNull();
  });
  it('keeps quote and reply references separate without selecting target media', () => {
    const records = syntheticRecords(); addMedia(records);
    records.reply = { __id: 'reply', __typename: 'TweetResults', rest_id: '21', result: { __ref: 'missing-reply' } };
    records.quote = { __id: 'quote', __typename: 'TweetResults', rest_id: '22', result: { __ref: 'quoted' } };
    records.quoted = { __id: 'quoted', __typename: 'Tweet', rest_id: '22', media_entities2: { __refs: ['other-media'] } };
    records.tweet!.reply_to_results = { __ref: 'reply' }; records.tweet!.quoted_tweet_results = { __ref: 'quote' };
    const candidate = normalizeTwitter(records, url); const result = selectTwitter(candidate, [], 'local');
    expect(candidate.media).toHaveLength(1); expect(result.assets).toHaveLength(0); expect(availability(result).complete).toBe(true);
    expect((candidate.payload as any).relationships).toMatchObject({ replyTo: { postId: '21', state: 'unresolved' }, quote: { postId: '22', state: 'resolved' } });
  });
  it('resolves explicit repost target, never an authored RT prefix', () => {
    const records = syntheticRecords();
    records.wrapper = { ...records.tweet!, __id: 'wrapper', rest_id: '30', legacy: { __ref: 'wrapper-legacy' } };
    records['wrapper-legacy'] = { __id: 'wrapper-legacy', __typename: 'LegacyTweet', retweeted_status_results: { __ref: 'root' } };
    records.presentation = { __id: 'presentation', __typename: 'TweetResults', rest_id: '30', result: { __ref: 'wrapper' } };
    expect(normalizeTwitter(records, 'https://x.com/reposter/status/30').sourceId).toBe('9007199254740993123');
    records['wrapper-legacy']!.retweeted_status_results = { __ref: 'missing' };
    expect(() => normalizeTwitter(records, 'https://x.com/reposter/status/30')).toThrow('unavailable');
    records.details!.full_text = 'RT original authored content';
    expect(normalizeTwitter(records, url).sourceId).toBe('9007199254740993123');
  });
  it('does not reinterpret failed discovery as a text-only selection', () => {
    const records = syntheticRecords(); delete records.tweet!.media_entities2;
    expect(() => normalizeTwitter(records, url)).toThrow('discovery');
  });
  it('keeps unsupported selected media and refuses injected membership/foreign ownership', () => {
    const records = syntheticRecords(); addMedia(records, 'unknown');
    const candidate = normalizeTwitter(records, url);
    const selected = selectTwitter(candidate, ['media-1'], 'local');
    expect(selected.assets[0]!.acquisition.state).toBe('unavailable'); expect(availability(selected).complete).toBe(false);
    expect(() => selectTwitter(candidate, ['https://evil.test/a'], 'local')).toThrow();
    records.media!.source_status_id_str = '22'; expect(() => normalizeTwitter(records, url)).toThrow('another post');
  });
  it('ranks comparable complete MP4s, preserves unknown order and actual representation uncertainty', () => {
    const records = syntheticRecords(); addMedia(records, 'animated_gif');
    records.video = { __id: 'video', __typename: 'ApiMediaEntityVideoInfo', variants: { __refs: ['playlist', 'low', 'high'] } };
    for (const [key, bitrate] of [['low', 100], ['high', 200]] as const) records[key] = { __id: key, __typename: 'ApiMediaEntityVideoVariant', bitrate, content_type: 'video/mp4', url: `https://video.twimg.com/amplify_video/123/vid/${key}.mp4` };
    records.playlist = { __id: 'playlist', __typename: 'ApiMediaEntityVideoVariant', content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/123/a.m3u8' };
    const media = normalizeTwitter(records, url).media[0]!;
    expect(media.bitrate).toBe(200); expect(media.kind).toBe('animated_gif'); expect(media.sourceDimensions).toEqual({ width:640, height:360 }); expect(media.representationDimensions).toBeNull(); expect(media.sourceOrder).toBeNull();
    records.low!.bitrate = null; expect(normalizeTwitter(records, url).media[0]!.quality).toContain('unverified');
    records.video!.variants = { __refs: ['playlist'] }; expect(normalizeTwitter(records, url).media[0]!.reason).toContain('playlists');
  });
  it.each(['http://x.com/a/status/1','https://x.com.evil/a/status/1','https://evil@x.com/a/status/1','https://x.com/a/status/1?url=evil','https://x.com/a/status/no'])('rejects unscoped source %s', source => expect(() => postUrl(source)).toThrow());
  it('restricts binary URLs to verified origins and path families', () => {
    expect(() => mediaUrl('https://pbs.twimg.com/profile_images/a.jpg', false)).toThrow();
    expect(() => mediaUrl('https://video.twimg.com/amplify_video/1/a.m3u8', true)).toThrow();
    expect(() => mediaUrl('https://evil.test/media/a.jpg', false)).toThrow();
  });
});
