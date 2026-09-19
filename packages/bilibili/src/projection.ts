import { partUrl } from './urls';
export const BILIBILI_SOURCE_LIMIT = 512 * 1024;
type Obj = Record<string, unknown>;
export const object = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.map(key => [key, object(value)[key] ?? null]));
export function identity(value: unknown): string { if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value); if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value; throw new Error('Unsafe or missing source identifier'); }
/** Read only the JSON assignment, including a script node removed before observer delivery. */
export function assignment(script: string, name: '__INITIAL_STATE__' | '__playinfo__'): unknown | undefined {
  if (script.length > 4 * 1024 * 1024) throw new Error('Bilibili initial script exceeds source limit');
  const start = new RegExp(`(?:window\\.)?${name}\\s*=\\s*`).exec(script); if (!start) return;
  const from = start.index + start[0].length; if (script[from] !== '{') throw new Error('Unverified Bilibili JSON assignment');
  let depth = 0, quoted = false, escaped = false;
  for (let i = from; i < script.length; i++) { const c = script[i]; if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; } else if (c === '"') quoted = true; else if (c === '{' || c === '[') { if (++depth > 64) throw new Error('Bilibili JSON depth limit'); } else if (c === '}' || c === ']') { if (--depth === 0) return JSON.parse(script.slice(from, i + 1)); } }
  throw new Error('Incomplete Bilibili initial JSON');
}
export function projectBilibili(initial: unknown, playinfo: unknown, requested: string, login: unknown) {
  const root = object(initial), video = object(root.videoData), play = object(playinfo), data = object(play.data), target = partUrl(requested);
  if (login !== true) throw new Error('Sign in to Bilibili before capturing this part');
  if (root.bvid !== target.bvid || video.bvid !== target.bvid || Number(root.p) !== target.p) throw new Error('Bilibili initial document does not match the selected part');
  const pages = Array.isArray(video.pages) ? video.pages : [];
  const selected = pages.filter(value => object(value).page === target.p);
  if (selected.length !== 1 || identity(root.cid) !== identity(object(selected[0]).cid)) throw new Error('Bilibili selected CID is missing or conflicting');
  const tracks = (value: unknown) => Array.isArray(value) && value.length <= 128 ? value.map(item => pick(item, ['id', 'baseUrl', 'base_url', 'backupUrl', 'backup_url', 'codecs', 'codecid', 'bandwidth', 'width', 'height', 'frameRate', 'frame_rate', 'mimeType', 'mime_type'])) : null;
  const dash = object(data.dash);
  const result = { schema: 'bilibili-source/1', requested: target.url, login: true, root: { bvid: root.bvid, aid: identity(root.aid), cid: identity(root.cid), p: target.p }, video: { ...pick(video, ['bvid', 'title', 'desc', 'pubdate', 'pic', 'state', 'is_story', 'is_upower_exclusive', 'is_upower_play', 'is_upower_preview']), desc_v2: Array.isArray(video.desc_v2) ? video.desc_v2.map(segment => pick(segment, ['type', 'raw_text'])) : null, owner: pick(video.owner, ['mid', 'name']), rights: pick(video.rights, ['ugc_pay', 'ugc_pay_preview', 'is_stein_gate']), part: pick(selected[0], ['cid', 'page', 'part', 'duration']) }, play: { code: play.code, ...pick(data, ['timelength', 'accept_quality', 'is_preview', 'preview']), support_formats: Array.isArray(data.support_formats) ? data.support_formats.map(format => pick(format, ['quality', 'display_desc', 'codecs'])) : null, dash: { duration: dash.duration ?? null, video: tracks(dash.video), audio: tracks(dash.audio) } } };
  if (new TextEncoder().encode(JSON.stringify(result)).length > BILIBILI_SOURCE_LIMIT) throw new Error('Bilibili projected source exceeds limit');
  return result;
}
