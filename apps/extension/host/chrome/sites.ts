import { postUrl, TWITTER_ORIGINS, isTwitterDocument } from '@locus/twitter/urls';
import { partUrl, BILIBILI_ORIGINS } from '@locus/bilibili/urls';
export type CaptureSite = 'twitter' | 'bilibili';
export const siteOrigins = { twitter: TWITTER_ORIGINS, bilibili: BILIBILI_ORIGINS };
export function sourceSelection(url: string) { if (new URL(url).hostname === 'www.bilibili.com') return { ...partUrl(url), site: 'bilibili' as const }; return { ...postUrl(url), site: 'twitter' as const }; }
export function documentSite(url?: string): CaptureSite | undefined { if (!url) return; if (isTwitterDocument(url)) return 'twitter'; try { partUrl(url); return 'bilibili'; } catch { return; } }
