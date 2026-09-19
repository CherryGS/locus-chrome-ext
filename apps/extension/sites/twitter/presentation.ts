import type { Json } from '@/core/results/model';

/** A read-only projection of the retained Twitter schema, not source extraction. */
export function twitterPresentation(payload: Json | undefined) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema !== 'twitter-post/1' || typeof payload.fullText !== 'string') return null;
  const author = payload.author && typeof payload.author === 'object' && !Array.isArray(payload.author) ? payload.author : {};
  const text = (value: Json | undefined) => typeof value === 'string' ? value : null;
  return { text: payload.fullText, displayName: text(author.displayName), username: text(author.username), accountId: text(author.accountId), publishedAt: text(payload.publishedAt), sourceId: text(payload.sourceId) };
}
