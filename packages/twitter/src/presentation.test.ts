import { describe, expect, it } from 'vitest';
import { twitterPresentation } from './presentation';

describe('retained Twitter presentation', () => {
  it('links a retained handle and preserves empty text and exact IDs', () => {
    expect(twitterPresentation({ schema: 'twitter-post/1', fullText: '', sourceId: '1979876543210987654', author: { username: 'field_notes', accountId: '9007199254740993123' }, observedAt: '2026-09-27T00:00:00Z' })).toMatchObject({
      authorUrl: 'https://x.com/field_notes', text: '', sourceId: '1979876543210987654', accountId: '9007199254740993123', observedAt: '2026-09-27T00:00:00Z',
    });
  });
  it.each([null, '', 'name/other', 'name?redirect=other', 'https://evil.test', 'name@evil.test'])('does not turn an invalid handle into navigation: %s', username => {
    expect(twitterPresentation({ schema: 'twitter-post/1', fullText: 'Retained text', author: { username } })?.authorUrl).toBeNull();
  });
  it('keeps unknown and unavailable schemas out of the supported preview', () => {
    expect(twitterPresentation({ schema: 'unknown/1', fullText: 'Text' })).toBeNull();
    expect(twitterPresentation({ schema: 'twitter-post/1', fullText: null })).toBeNull();
  });
});
