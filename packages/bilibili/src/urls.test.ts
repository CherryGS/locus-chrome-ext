import { describe, expect, it } from 'vitest';
import { bilibiliPage, partUrl, watchlaterPartUrl, bilibiliResource, bilibiliTrackResource } from './urls';

describe('Bilibili watch-later entry surfaces', () => {
  const entry = 'https://www.bilibili.com/list/watchlater/?bvid=BV145PxzCEoE&oid=116182891959963&watchlater_cfg=%7B%22viewed%22%3A0%7D&spm_id_from=333.881.0.0';
  it('normalizes a card to its ordinary first part without list bookkeeping', () => {
    expect(bilibiliPage('https://www.bilibili.com/watchlater/list')).toBe('listing');
    expect(bilibiliPage(entry)).toBe('watchlater');
    expect(watchlaterPartUrl(entry)).toEqual(partUrl('https://www.bilibili.com/video/BV145PxzCEoE/'));
    expect(() => partUrl(entry)).toThrow();
  });
  it('preserves the explicitly selected player part', () => {
    expect(watchlaterPartUrl(entry + '&p=2&vd_source=fixture')).toEqual(partUrl('https://www.bilibili.com/video/BV145PxzCEoE/?p=2'));
  });
  it.each([
    entry.replace('https:', 'http:'), entry.replace('www.bilibili.com', 'evil.test'),
    entry.replace('www.bilibili.com', 'www.bilibili.com:8443'), entry.replace('www.bilibili.com', 'user@www.bilibili.com'),
    entry.replace('/list/watchlater/', '/list/favorites/'), entry.replace('bvid=BV145PxzCEoE', 'bvid=ep123'),
    entry.replace('bvid=BV145PxzCEoE', 'bvid='), entry + '&bvid=BV145PxzCEoE',
    entry + '&p=0', entry + '&p=10000', entry + '&p=1&p=2', entry + '&p=2%26p%3D3', entry + '&list=all',
  ])('rejects an unverified or ambiguous selection %s', url => {
    expect(() => watchlaterPartUrl(url)).toThrow();
  });
  it('does not classify a watch-later player with no selected video as a candidate page', () => {
    expect(bilibiliPage('https://www.bilibili.com/list/watchlater/')).toBeUndefined();
  });
});

describe('Bilibili search entry surfaces', () => {
  it.each(['all', 'video'])('recognizes the %s search listing without accepting it as a video selection', route => {
    const page = `https://search.bilibili.com/${route}?keyword=fixture&search_source=5`;
    expect(bilibiliPage(page)).toBe('listing');
    expect(() => partUrl(page)).toThrow();
    expect(() => partUrl('https://search.bilibili.com/video/BV145PxzCEoE/')).toThrow();
  });
  it.each(['http://search.bilibili.com/all', 'https://search.bilibili.com.evil.test/all', 'https://search.bilibili.com:8443/all', 'https://user@search.bilibili.com/all', 'https://live.bilibili.com/123'])('rejects unapproved listing origin %s', page => {
    expect(bilibiliPage(page)).toBeUndefined();
  });
});

const cid = '1234567890123';
const path = (suffix = '', directoryCid = cid, filenameCid = cid) => `/upgcxcode/23/01/${directoryCid}/${filenameCid}${suffix}-1-30080.m4s`;
const resource = (pathname: string) => `https://synthetic.bilivideo.com${pathname}?sign=ephemeral`;

describe('Bilibili track path identity', () => {
  it.each(['', '_t6', '_t12', '_qe1', '_nb2', '_x6', '_tagA9', '_variant'])('preserves the opaque filename marker %j without changing CID or the signed address', suffix => {
    const url = resource(path(suffix));
    expect(bilibiliResource(url, 'track', cid)).toBe(url);
  });
  it.each(['_t6', '_qe1'])('selects an approved %s mirror of the same MCDN representation', suffix => {
    const pathname = path(suffix), approved = resource(pathname);
    expect(bilibiliTrackResource({ baseUrl: `https://synthetic.mcdn.bilivideo.cn:8082/v1/resource${pathname}`, backup_url: [approved] }, cid)).toBe(approved);
  });
  it.each([
    { directory: '999', filename: cid, expected: cid },
    { directory: cid, filename: '999', expected: cid },
    { directory: cid, filename: cid, expected: '999' },
  ])('reports actual directory and filename identities for a CID mismatch: %j', value => {
    let failure = '';
    try { bilibiliResource(resource(path('_t6', value.directory, value.filename)), 'track', value.expected); }
    catch (error) { failure = (error as Error).message; }
    expect(failure).toContain('BILI_TRACK_CID_MISMATCH');
    expect(failure).toContain(`"expectedCid": "${value.expected}"`);
    expect(failure).toContain(`"directoryCid": "${value.directory}"`);
    expect(failure).toContain(`"filenameCid": "${value.filename}"`);
    expect(failure).not.toContain('sign=');
  });
  it.each(['_', '_qe-1', '_qe/1', '_qe%31', '_qe.1', '_t6_qe1', '_' + 'a'.repeat(33)])('rejects malformed or unbounded filename markers %j', suffix => {
    expect(() => bilibiliResource(resource(path(suffix)), 'track', cid)).toThrow('BILI_TRACK_PATH_UNSUPPORTED');
  });
  it.each([['_t6', '_t7'], ['_qe1', '_qe2'], ['_t6', '_qe1']])('keeps %s and %s as distinct mirror identities', (first, second) => {
    expect(() => bilibiliTrackResource({ baseUrl: resource(path(first)), backupUrl: [resource(path(second))] }, cid)).toThrow('representation path');
  });
});
