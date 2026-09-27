import { describe, expect, it } from 'vitest';
import { bilibiliPresentation } from './presentation';

describe('retained Bilibili presentation', () => {
  it('links the exact uploader ID and exposes current-part metadata', () => {
    expect(bilibiliPresentation({ schema: 'bilibili-part/1', title: 'Example', description: '', uploader: { id: '9007199254740993123', name: 'Uploader' }, source: { bvid: 'BV145PxzCEoE', cid: '36531930223', aid: '116182891959963' }, part: { index: 2, name: 'Second', duration: 12.5, durationPrecision: 'playinfo' } })).toMatchObject({
      authorUrl: 'https://space.bilibili.com/9007199254740993123', description: '', part: 'P2 · Second', duration: 12.5, cid: '36531930223', aid: '116182891959963',
    });
  });
  it('distinguishes silent source video from AAC audio and missing representation', () => {
    const representation = { quality: 64, width: 1280, height: 720, videoCodec: 'avc1.64001f', audioCodec: 'mp4a.40.2' };
    expect(bilibiliPresentation({ schema: 'bilibili-part/1', representation })?.quality).toContain('AVC/AAC');
    expect(bilibiliPresentation({ schema: 'bilibili-part/1', representation: { ...representation, audioCodec: null, audioAbsent: true } })?.quality).toBe('Supported video · 1280×720 · No audio');
    expect(bilibiliPresentation({ schema: 'bilibili-part/1' })).toMatchObject({ title: 'Untitled video', uploader: null, part: 'Part unknown', quality: 'Video representation unavailable', authorUrl: null });
  });
  it.each(['123/other', '123?redirect=other', '', null])('omits a profile link for an invalid uploader ID: %s', id => {
    expect(bilibiliPresentation({ schema: 'bilibili-part/1', uploader: { id } })?.authorUrl).toBeNull();
  });
});
