import { describe, expect, it } from 'vitest';
import { boundedBody, validateMedia } from './network';

describe('complete media boundaries', () => {
  it('rejects partial HTTP, exceeded limits, empty and mismatched lengths', async () => {
    await expect(boundedBody(new Response('part', { status:206 }),100)).rejects.toThrow('Incomplete');
    await expect(boundedBody(new Response('abc'),2)).rejects.toThrow('limit');
    await expect(boundedBody(new Response(''),100)).rejects.toThrow('Empty');
    await expect(boundedBody(new Response('abc', { headers:{'content-length':'4'} }),100)).rejects.toThrow('Truncated');
  });
  it('rejects error HTML, playlists, static motion previews and truncated MP4 boxes', async () => {
    await expect(validateMedia(new Blob(['<html>login</html>'], {type:'image/jpeg'}),false)).rejects.toThrow();
    await expect(validateMedia(new Blob(['#EXTM3U'], {type:'video/mp4'}),true)).rejects.toThrow();
    await expect(validateMedia(new Blob([new Uint8Array([255,216,255,217])], {type:'image/jpeg'}),true)).rejects.toThrow();
    const box = new Uint8Array([0,0,0,20,102,116,121,112]);
    await expect(validateMedia(new Blob([box], {type:'video/mp4'}),true)).rejects.toThrow();
  });
});
