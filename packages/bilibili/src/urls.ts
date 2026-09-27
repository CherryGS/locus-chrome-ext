import { diagnosticError } from '@locus/capture-core/diagnostics';

export const BILIBILI_PAGE_ORIGINS = ['https://www.bilibili.com/*', 'https://space.bilibili.com/*', 'https://search.bilibili.com/*'];
export const BILIBILI_ORIGINS = [...BILIBILI_PAGE_ORIGINS, 'https://api.bilibili.com/*', 'https://*.bilivideo.com/*', 'https://*.hdslb.com/*'];

/** Page entry surfaces do not broaden the ordinary-video source selection. */
export function bilibiliPage(input: string): 'home' | 'favorites' | 'video' | 'listing' | undefined {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return;
    if (url.hostname === 'search.bilibili.com') return 'listing';
    if (url.hostname === 'space.bilibili.com') return /^\/\d+\/favlist\/?$/.test(url.pathname) ? 'favorites' : 'listing';
    if (url.hostname !== 'www.bilibili.com') return;
    if (url.pathname === '/') return 'home';
    if (url.pathname.startsWith('/video/')) { partUrl(input); return 'video'; }
    return 'listing';
  } catch { return; }
}
export function partUrl(input: string) {
  const url = new URL(input);
  const match = /^\/video\/(BV[0-9A-Za-z]{10})\/?$/.exec(url.pathname);
  const parts = url.searchParams.getAll('p');
  if (url.protocol !== 'https:' || url.hostname !== 'www.bilibili.com' || url.port || url.username || url.password || !match || parts.length > 1 || parts.some(p => !/^[1-9]\d{0,3}$/.test(p))) throw new Error('Unsupported Bilibili ordinary-video selection');
  for (const key of url.searchParams.keys()) if (!['p', 'vd_source', 'spm_id_from', 'trackid', 'share_source'].includes(key)) throw new Error('Unverified Bilibili selection query');
  const p = Number(parts[0] ?? 1), bvid = match[1]!;
  return { bvid, p, id: `bilibili:${bvid}:${p}`, url: `https://www.bilibili.com/video/${bvid}/?p=${p}` };
}
export function bilibiliResource(input: string, role: 'cover' | 'track', cid?: string) {
  const url = new URL(input);
  const suffix = role === 'cover' ? '.hdslb.com' : '.bilivideo.com';
  if (!url.hostname.endsWith(suffix) || url.username || url.password || url.port || url.hash || input.length > 4096) throw new Error('Unsupported Bilibili resource origin');
  if (role === 'cover' && url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') throw new Error('Bilibili resources require HTTPS');
  if (role === 'cover' && !/^\/bfs\/archive\/[A-Za-z0-9._-]+$/.test(url.pathname)) throw new Error('Unverified Bilibili cover path');
  if (role === 'track') {
    boundTrackPath(url.pathname, cid);
  }
  return url.href;
}
function boundTrackPath(pathname: string, cid?: string) {
  // Markers such as _t6 and _qe1 are opaque filename tokens, not part of the CID.
  // Bound their grammar, without enumerating names or erasing them from the
  // exact signed request and per-representation mirror comparison.
  const path = /^\/upgcxcode\/\d+\/\d+\/(\d+)\/(\d+)(?:_[A-Za-z0-9]{1,32})?-1-\d+\.m4s$/.exec(pathname);
  if (!path) throw diagnosticError('BILI_TRACK_PATH_UNSUPPORTED', 'bilibili.source.track-path', 'Unsupported Bilibili track path format', { pathname, expectedCid: cid ?? null });
  if (path[1] !== path[2] || (cid !== undefined && path[1] !== cid)) throw diagnosticError('BILI_TRACK_CID_MISMATCH', 'bilibili.source.track-path', 'Track does not bind the selected Bilibili CID', { pathname, expectedCid: cid ?? null, directoryCid: path[1], filenameCid: path[2] });
  return pathname;
}
/** Choose a source-supplied mirror without broadening the permitted CDN origins. */
export function bilibiliTrackResource(track: Record<string, unknown>, cid: string) {
  const primary = [track.baseUrl, track.base_url].filter(value => value !== null && value !== undefined);
  const backupLists = [track.backupUrl, track.backup_url].filter(value => value !== null && value !== undefined);
  if (!primary.length || backupLists.some(value => !Array.isArray(value) || value.length > 16)) throw new Error('Track locations are missing or exceed the 16-mirror limit');
  const candidates = [...new Set([...primary, ...backupLists.flatMap(value => value as unknown[])])];
  let boundPath: string | undefined, selected: string | undefined;
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length > 4096) throw new Error('Track location is not a bounded URL');
    const url = new URL(candidate);
    // MCDN adds this prefix to the same representation. Its path contributes
    // identity evidence only; bilibiliResource still denies its origin/port.
    const path = boundTrackPath(url.pathname.replace(/^\/v1\/resource\//, '/'), cid);
    if (boundPath !== undefined && path !== boundPath) throw new Error('Track mirrors disagree on the selected representation path');
    boundPath = path;
    try { const approved = bilibiliResource(candidate, 'track', cid); selected ??= approved; } catch { /* Try the next supplied mirror within the existing host grant. */ }
  }
  if (!selected) throw new Error('No approved HTTPS Bilibili CDN location for this representation');
  return selected;
}
export function sourceResource(input: string) { const url = new URL(input); return url.origin + url.pathname; }
