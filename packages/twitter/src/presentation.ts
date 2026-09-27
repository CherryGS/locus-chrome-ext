import type { Json } from '@locus/capture-core/model';

/** A read-only projection of the retained Twitter schema, not source extraction. */
export function twitterPresentation(payload: Json | undefined) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema !== 'twitter-post/1' || typeof payload.fullText !== 'string') return null;
  const author = payload.author && typeof payload.author === 'object' && !Array.isArray(payload.author) ? payload.author : {};
  const text = (value: Json | undefined) => typeof value === 'string' ? value : null;
  const username = text(author.username);
  return {
    text: payload.fullText, displayName: text(author.displayName), username,
    // Build navigation only from a valid retained handle, never arbitrary payload URLs.
    authorUrl: username && /^[A-Za-z0-9_]{1,30}$/.test(username) ? `https://x.com/${username}` : null,
    accountId: text(author.accountId), publishedAt: text(payload.publishedAt),
    observedAt: text(payload.observedAt), sourceId: text(payload.sourceId),
  };
}
