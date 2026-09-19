import { describe, expect, it } from 'vitest';
import { sourceSummaries } from './result-summary';
import { syntheticSnapshot } from '@/testing/result-fixture';

describe('source-bound summary projection',()=>{
  it('returns newest exact numeric identity across username changes, without record or Blob payload',()=>{
    const make=(url:string,date:string)=>({...syntheticSnapshot().result,site:'twitter',sourceUrl:url,createdAt:date});
    const old=make('https://x.com/old/status/123','2026-01-01'),latest=make('https://twitter.com/new/status/123','2026-02-01'),other=make('https://x.com/other/status/456','2026-03-01');
    const rows=sourceSummaries([old,latest,other],['123','789']);expect(rows[0]?.summary?.id).toBe(latest.id);expect(rows[1]).toEqual({sourceId:'789',summary:null});expect(rows[0]?.summary).not.toHaveProperty('records');expect(sourceSummaries([old,other],['123'])[0]?.summary?.id).toBe(old.id);expect(sourceSummaries([other],['123'])[0]?.summary).toBeNull();
  });
});
