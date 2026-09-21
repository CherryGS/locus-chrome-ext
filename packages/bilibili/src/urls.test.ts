import { describe, expect, it } from 'vitest';
import { bilibiliResource, bilibiliTrackResource } from './urls';

const cid = '1234567890123';
const path = (suffix = '', directoryCid = cid, filenameCid = cid) => `/upgcxcode/23/01/${directoryCid}/${filenameCid}${suffix}-1-30080.m4s`;
const resource = (pathname: string) => `https://synthetic.bilivideo.com${pathname}?sign=ephemeral`;

describe('Bilibili track path identity', () => {
  it.each(['', '_t6', '_t12'])('accepts the numeric filename suffix %j without changing CID or the signed address', suffix => {
    const url = resource(path(suffix));
    expect(bilibiliResource(url, 'track', cid)).toBe(url);
  });
  it('selects an approved suffixed mirror of the same MCDN representation', () => {
    const pathname = path('_t6'), approved = resource(pathname);
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
  it.each(['_t', '_tA', '_t6extra', '_x6'])('distinguishes unsupported suffix %j from a CID mismatch', suffix => {
    expect(() => bilibiliResource(resource(path(suffix)), 'track', cid)).toThrow('BILI_TRACK_PATH_UNSUPPORTED');
  });
  it('keeps the filename suffix in mirror identity instead of merging distinct representations', () => {
    expect(() => bilibiliTrackResource({ baseUrl: resource(path('_t6')), backupUrl: [resource(path('_t7'))] }, cid)).toThrow('representation path');
  });
});
