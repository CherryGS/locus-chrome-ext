import { describe, expect, it, vi } from 'vitest';
import { sourceSummaries, summarizeResult } from './result-summary';
import * as sites from './sites';
import { availability, type Acquisition } from '@locus/capture-core/model';
import { syntheticSnapshot } from '@/testing/result-fixture';

describe('source-bound summary projection',()=>{
  it('preserves request order, missing entries and the first capture when timestamps tie', () => {
    const first = { ...syntheticSnapshot().result, site: 'twitter', sourceUrl: 'https://x.com/first/status/123' };
    const tied = { ...first, id: 'tied', sourceUrl: 'https://twitter.com/renamed/status/123' };
    const invalid = { ...first, id: 'invalid', sourceUrl: 'not a URL', createdAt: '2027-01-01' };
    const input = [first, tied, invalid, { ...first, site: 'bilibili' }];
    expect(sourceSummaries(input, ['789', '123', '123']).map(row => [row.sourceId, row.summary?.id ?? null]))
      .toEqual([['789', null], ['123', first.id], ['123', first.id]]);
    expect(input.map(row => row.id)).toEqual([first.id, 'tied', 'invalid', first.id]);
    expect(sourceSummaries(input, [])).toEqual([]);
  });
  it('keeps Bilibili parts separate and filters results from other sites', () => {
    const make = (p: number) => ({ ...syntheticSnapshot().result, site: 'bilibili', sourceUrl: `https://www.bilibili.com/video/BV145PxzCEoE/?p=${p}` });
    const one = make(1), two = make(2);
    const ids = ['bilibili:BV145PxzCEoE:2', 'bilibili:BV145PxzCEoE:1', 'bilibili:BV145PxzCEoE:3'];
    expect(sourceSummaries([one, two], ids, 'bilibili').map(row => row.summary?.id ?? null)).toEqual([two.id, one.id, null]);
    expect(sourceSummaries([one, two], ids).every(row => row.summary === null)).toBe(true);
  });
  it('bounds URL parsing by library size when many sources are visible', () => {
    const base = syntheticSnapshot().result;
    const results = Array.from({ length: 200 }, (_, index) => ({ ...base, id: String(index), site: 'twitter', sourceUrl: `https://x.com/test/status/${index + 1}` }));
    const sourceIds = Array.from({ length: 50 }, (_, index) => String(index + 151));
    const parse = vi.spyOn(sites, 'sourceSelection');
    try {
      expect(sourceSummaries(results, sourceIds).map(row => row.summary?.id)).toEqual(sourceIds.map(id => String(Number(id) - 1)));
      expect(parse.mock.calls.length).toBeLessThanOrEqual(results.length);
    } finally { parse.mockRestore(); }
  });
  it('returns newest exact numeric identity across username changes, without record or Blob payload',()=>{
    const make=(url:string,date:string)=>({...syntheticSnapshot().result,site:'twitter',sourceUrl:url,createdAt:date});
    const old=make('https://x.com/old/status/123','2026-01-01'),latest=make('https://twitter.com/new/status/123','2026-02-01'),other=make('https://x.com/other/status/456','2026-03-01');
    const rows=sourceSummaries([old,latest,other],['123','789']);expect(rows[0]?.summary?.id).toBe(latest.id);expect(rows[1]).toEqual({sourceId:'789',summary:null});expect(rows[0]?.summary).not.toHaveProperty('records');expect(sourceSummaries([old,other],['123'])[0]?.summary?.id).toBe(old.id);expect(sourceSummaries([other],['123'])[0]?.summary).toBeNull();
  });
});

describe('shared acquisition projection', () => {
  it.each([
    ['acquired', 'acquired', 'complete', 2, false],
    ['acquired', 'pending', 'pending', 1, true],
    ['unavailable', 'pending', 'pending', 0, true],
    ['acquired', 'unavailable', 'partial', 1, false],
    ['unavailable', 'acquired', 'partial', 1, false],
    ['unavailable', 'unavailable', 'unavailable', 0, false],
  ] as [Acquisition['state'], Acquisition['state'], string, number, boolean][])(
    'combines %s metadata with %s bytes as %s', (record, asset, state, acquired, pending) => {
      const { result } = syntheticSnapshot();
      result.records[0]!.acquisition = { state: record };
      result.assets[0]!.acquisition = { state: asset };
      expect(summarizeResult(result).acquisition).toBe(state);
      expect(availability(result)).toEqual({ acquired, pending, complete: state === 'complete' });
    },
  );
  it('does not treat an empty selection as complete, and supports metadata-only captures', () => {
    const { result } = syntheticSnapshot();
    result.assets = [];
    expect(summarizeResult(result).acquisition).toBe('complete');
    result.records = [];
    expect(summarizeResult(result).acquisition).toBe('unavailable');
    expect(availability(result).complete).toBe(false);
  });
});
