import type { Data, DataObject } from './relay-parser';

/** Note IDs are distinct from their attaching Tweet IDs. The Tweet's explicit
 * result reference establishes ownership; the encoded ID corroborates the note. */
export function noteTweetId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 128) return null;
  try { return /^NoteTweet:(\d{1,25})$/.exec(atob(value))?.[1] ?? null; } catch { return null; }
}

export function readNoteTweet(value: Data, deref: (value: Data) => DataObject | null) {
  const data = deref(value);
  const results = data?.__typename === 'NoteTweetData' ? deref(data.note_tweet_results) : null;
  const note = results?.__typename === 'NoteTweetResults' ? deref(results.result) : null;
  if (note?.__typename !== 'NoteTweet' || typeof note.rest_id !== 'string' || noteTweetId(note.id) !== note.rest_id ||
    typeof note.text !== 'string' || note.text.length > 65_536 || (note.truncated !== undefined && note.truncated !== false)) return null;
  const entities = deref(note.entity_set);
  return { id: note.rest_id, text: note.text, entities: entities?.__typename === 'EntitySet' ? entities : null };
}
