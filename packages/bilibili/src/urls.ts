export const BILIBILI_ORIGINS = ['https://www.bilibili.com/*', 'https://api.bilibili.com/*', 'https://*.bilivideo.com/*', 'https://*.hdslb.com/*'];
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
    const path = /^\/upgcxcode\/\d+\/\d+\/(\d+)\/\1-1-\d+\.m4s$/.exec(url.pathname);
    if (!path || (cid !== undefined && path[1] !== cid)) throw new Error('Track does not bind the selected Bilibili CID');
  }
  return url.href;
}
export function sourceResource(input: string) { const url = new URL(input); return url.origin + url.pathname; }
