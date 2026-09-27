import { describe, expect, it } from 'vitest';
import { captureStates, getCaptureStatus } from '@/ui/shared/capture-status';
import { captureGlyphPaths } from '@/ui/shared/capture-glyph';
import { resultView } from '@/ui/results/presentation';
import type { ResultSummary } from '../chrome/protocol';
const summary:ResultSummary={id:'id',sourceUrl:'https://x.com/example/status/123',label:'Example',createdAt:'2026-09-23',revision:2,acquisition:'complete',retention:{state:'retained',revision:2}};
describe('capture and Locus feedback',()=>{
  it('distinguishes neutral staging from errors and confirmed Locus saving',()=>{
    expect(captureStates.saved.label).toBe('Staged locally');
    expect(captureStates.saved.tone).toBe('neutral');
    expect(new Set([captureGlyphPaths.saved,captureGlyphPaths.failed,captureGlyphPaths['locus-saved']]).size).toBe(3);
  });
  it('shows setup as staging only with complete, current retained content', () => {
    const staged = { ...summary, locus: { state: 'configuration-required' as const, message: 'Setup required' } };
    expect(getCaptureStatus(staged)).toBe('saved'); expect(resultView(staged)).toBe('inbox');
    expect(getCaptureStatus({ ...staged, acquisition: 'partial' })).toBe('partial');
    expect(getCaptureStatus({ ...staged, unresolvedReason: 'Cannot read' })).toBe('unknown');
    expect(getCaptureStatus({ ...staged, retention: { state: 'failed', revision: 0 } })).toBe('failed');
    expect(getCaptureStatus({ ...staged, retention: { state: 'retained', revision: 0 } })).toBe('unknown');
    expect(getCaptureStatus({ ...staged, retention: { state: 'failed', revision: 0 }, locus: { state: 'complete', message: 'Saved' } })).toBe('failed');
  });
  it('does not show upload or local retention as Locus success',()=>{
    expect(getCaptureStatus(summary)).toBe('saved');
    expect(getCaptureStatus({...summary,locus:{state:'uploading',message:'Uploading'}})).toBe('saving');
    expect(getCaptureStatus({...summary,locus:{state:'failed',message:'Rejected'}})).toBe('failed');
    expect(getCaptureStatus({...summary,locus:{state:'unverified',message:'Offline'}})).toBe('unknown');
    const complete={...summary,locus:{state:'complete' as const,message:'Saved'}};
    expect(getCaptureStatus(complete)).toBe('locus-saved');expect(resultView(complete)).toBe('saved');
    expect(resultView({...summary,locus:{state:'importing',message:'Saving'}})).toBe('progress');
  });
});
