export const TWITTER_ORIGINS = ['https://x.com/*', 'https://twitter.com/*', 'https://pbs.twimg.com/*', 'https://video.twimg.com/*'];
export function postUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !['x.com', 'twitter.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Unsupported Twitter post URL');
  const match = /^\/([A-Za-z0-9_]{1,30})\/status\/([0-9]{1,25})\/?$/.exec(url.pathname);
  if (!match || url.search || url.hash) throw new Error('Select an exact Twitter post permalink');
  return { id: match[2]!, url: `https://x.com/${match[1]}/status/${match[2]}` };
}
export function isTwitterDocument(input: string) {
  try { const u = new URL(input); return u.protocol === 'https:' && ['x.com', 'twitter.com'].includes(u.hostname) && !u.port && !u.username && !u.password; } catch { return false; }
}
export function mediaUrl(input: string, motion: boolean): string {
  if (input.length > 2048) throw new Error('Media URL exceeds the supported length');
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) throw new Error('Unsafe media URL');
  const allowed = motion
    ? u.hostname === 'video.twimg.com' && /^\/(amplify_video|ext_tw_video|tweet_video)\/[A-Za-z0-9_./-]+\.mp4$/.test(u.pathname)
    : u.hostname === 'pbs.twimg.com' && /^\/media\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(u.pathname);
  if (!allowed) throw new Error('Unsupported media origin, path or encoding');
  return u.href;
}
