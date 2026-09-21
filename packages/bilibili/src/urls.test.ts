import { describe, expect, it } from 'vitest';
import { bilibiliResource, bilibiliTrackResource } from './urls';

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
