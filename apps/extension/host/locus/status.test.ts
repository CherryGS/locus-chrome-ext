import { describe, expect, it } from 'vitest';
import { getCaptureStatus } from '@/ui/shared/capture-status';
import { resultView } from '@/ui/results/presentation';
import type { ResultSummary } from '../chrome/protocol';
const summary:ResultSummary={id:'id',sourceUrl:'https://x.com/example/status/123',label:'Example',createdAt:'2026-09-23',revision:2,acquisition:'complete',retention:{state:'retained',revision:2}};
describe('capture and Locus feedback',()=>{
  it('does not show upload or local retention as Locus success',()=>{
    expect(getCaptureStatus(summary)).toBe('saved');
    expect(getCaptureStatus({...summary,locus:{state:'uploading',message:'Uploading'}})).toBe('saving');
    expect(getCaptureStatus({...summary,locus:{state:'failed',message:'Rejected'}})).toBe('failed');
    expect(getCaptureStatus({...summary,locus:{state:'unverified',message:'Offline'}})).toBe('unknown');
    const complete={...summary,locus:{state:'complete' as const,message:'Saved'}};
    expect(getCaptureStatus(complete)).toBe('locus-saved');expect(resultView(complete)).toBe('ready');
    expect(resultView({...summary,locus:{state:'importing',message:'Saving'}})).toBe('progress');
  });
});
