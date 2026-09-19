import { partUrl } from '@locus/bilibili/urls';
export const BILI_CHANNEL = 'locus-bilibili-source-v1';
export const BILI_FRAGMENT = '__locus_bili_probe=';
export function biliProbeUrl(url: string, token: string) { return `${partUrl(url).url}#${BILI_FRAGMENT}${token}`; }
export function biliIdentity(input: string) { try { const url = new URL(input), match = /^#__locus_bili_probe=([0-9a-f-]{36})$/.exec(url.hash); if (!match) return null; return { token: match[1]!, url: partUrl(input).url }; } catch { return null; } }
export function sameBiliDocument(actual: unknown, url: string, token: string) { if (typeof actual !== 'string') return false; const identity = biliIdentity(actual); return identity?.url === url && identity.token === token; }
