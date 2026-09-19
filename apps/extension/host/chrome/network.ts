import type { MediaCandidate } from '@locus/twitter/source';
import { parseRelay } from '@locus/twitter/relay-parser';
import { normalizeTwitter, PublicTwitterSourceUnavailableError, type TwitterCandidate } from '@locus/twitter/source';
import { mediaUrl, postUrl } from '@locus/twitter/urls';

export async function boundedBody(response: Response, limit: number): Promise<Blob> {
  if (!response.ok || response.status !== 200 || response.headers.has('content-range')) throw new Error(`Incomplete or failed HTTP response (${response.status})`);
  const announced = Number(response.headers.get('content-length'));
  if (announced > limit) throw new Error(`Resource exceeds the ${Math.floor(limit / 1048576)} MiB capability limit`);
  if (!response.body) throw new Error('Response body unavailable');
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) throw new Error(`Resource exceeds the ${Math.floor(limit / 1048576)} MiB capability limit`); chunks.push(next.value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (!size) throw new Error('Empty resource response');
  if (announced && !response.headers.get('content-encoding') && size !== announced) throw new Error('Truncated resource response');
  return new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? '' });
}
export async function loadTwitter(url: string, signal: AbortSignal, authenticated?:()=>Promise<TwitterCandidate>) {
  const requested = postUrl(url);
  const response = await fetch(requested.url, { credentials: 'omit', redirect: 'error', signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]) });
  const body = await boundedBody(response, 20 * 1048576);
  if (body.type !== 'text/html') throw new Error('Twitter returned an unsupported source response');
  const document = new DOMParser().parseFromString(await body.text(), 'text/html');
  // Initial hydration is the verified focal-post source. Later streamed reply
  // maps are a different scope and must not be merged into its selected records.
  const scripts = [...document.scripts].filter(script => script.textContent?.includes('dehydratedData:') && script.textContent?.includes('relayRecords:'));
  const fallback=()=>new Promise<TwitterCandidate>((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    const aborted=()=>reject(signal.reason);signal.addEventListener('abort',aborted,{once:true});
    void Promise.resolve().then(authenticated!).then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
  });
  if (scripts.length === 0&&authenticated) return fallback();
  if (scripts.length !== 1) throw new Error('Current public Twitter source format unavailable; login, access or source format may differ');
  try{return normalizeTwitter(parseRelay(scripts[0]!.textContent!), requested.url);}
  catch(error){if(error instanceof PublicTwitterSourceUnavailableError&&authenticated)return fallback();throw error;}
}
export async function validateMedia(blob: Blob, motion: boolean): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ascii = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
  const view = new DataView(bytes.buffer);
  let valid = false;
  if (motion) {
    if (blob.type !== 'video/mp4') throw new Error('Motion response is not an MP4 file');
    let offset = 0; const boxes = new Set<string>();
    while (offset + 8 <= bytes.length) {
      let size = view.getUint32(offset); const type = ascii(offset + 4, 4); let header = 8;
      if (size === 1) { if (offset + 16 > bytes.length) break; const large = view.getBigUint64(offset + 8); if (large > BigInt(Number.MAX_SAFE_INTEGER)) break; size = Number(large); header = 16; }
      if (size === 0) size = bytes.length - offset;
      if (size < header || offset + size > bytes.length) break;
      boxes.add(type); offset += size;
    }
    valid = offset === bytes.length && boxes.has('ftyp') && boxes.has('moov') && boxes.has('mdat');
  } else if (blob.type === 'image/jpeg') valid = bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  else if (blob.type === 'image/png') valid = bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(bytes.length - 8, 4) === 'IEND';
  else if (blob.type === 'image/gif') valid = ['GIF87a', 'GIF89a'].includes(ascii(0,6)) && bytes.at(-1) === 59;
  else if (blob.type === 'image/webp') valid = ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP' && view.getUint32(4, true) + 8 === bytes.length;
  if (!valid) throw new Error('Incomplete or unsupported media encoding; HTML, previews and playlists are not files');
  if (!motion && typeof createImageBitmap === 'function') { const bitmap = await createImageBitmap(blob); bitmap.close(); }
}
export async function acquireMedia(candidate: MediaCandidate, signal: AbortSignal) {
  if (!candidate.url) throw new Error(candidate.reason ?? 'No supported complete representation');
  const motion = candidate.kind === 'video' || candidate.kind === 'animated_gif';
  const url = mediaUrl(candidate.url, motion);
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal });
  const blob = await boundedBody(response, 256 * 1048576);
  await validateMedia(blob, motion); return blob;
}
