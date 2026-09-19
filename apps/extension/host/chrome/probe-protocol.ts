import { postUrl } from '@locus/twitter/urls';
export const PROBE_FRAGMENT='__locus_probe=';
export const PROBE_CHANNEL='locus-authenticated-source-v1';
export const PROBE_TIMEOUT=25_000;
export function probeIdentity(input:string): {token:string;url:string}|null {
  try {const url=new URL(input);const match=/^#__locus_probe=([0-9a-f-]{36})$/.exec(url.hash);if(!match)return null;url.hash='';const source=postUrl(url.href);return {token:match[1]!,url:source.url};}catch{return null;}
}
export function probeUrl(url:string,token:string){return `${postUrl(url).url}#${PROBE_FRAGMENT}${token}`;}
export function probeMessageSize(value:unknown){return new TextEncoder().encode(JSON.stringify(value)).byteLength;}
export function outsideAuthenticatedProbe(main:()=>void){return ()=>{if(!probeIdentity(location.href))main();};}
