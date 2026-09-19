import { describe, expect, it } from 'vitest';
import { diagnosticError, diagnosticReport } from '@locus/capture-core/diagnostics';
import { boundedBody } from './network';
import { summarizeResult } from './result-summary';
import { syntheticSnapshot } from '@/testing/result-fixture';

describe('default technical capture diagnostics', () => {
  it('preserves failure stage, measured facts and frames without signed URLs or credentials', () => {
    const cause = new Error('Failed to fetch https://user:password@cdn.bilivideo.com/upgcxcode/1/2/file.m4s?deadline=private&sign=private#private');
    const error = diagnosticError('BILI_RESOURCE_FAILED', 'video.fetch', 'Acquisition failed', { limitBytes: 67108864, receivedBytes: 70000000, source: 'https://www.bilibili.com/video/BV145PxzCEoE/?p=2&vd_source=private', headers: { Authorization: 'private' }, inspectionToken: 'private', cookie: 'private' }, cause);
    expect(error.message).toContain('video.fetch'); expect(error.message).toContain('67108864'); expect(error.message).toContain('70000000');
    expect(error.message).toContain('file.m4s'); expect(error.message).toContain('?p=2'); expect(error.message).toContain('stack:');
    for (const hidden of ['password', 'deadline=', 'sign=', '#private', 'vd_source=', '"private"']) expect(error.message).not.toContain(hidden);
    expect(diagnosticReport(error.message, { resultId: 'result-1' })).toContain('result-1');
  });
  it('reports announced and streamed byte-limit evidence separately', async () => {
    await expect(boundedBody(new Response('abc', { headers: { 'content-length': '900' } }), 100)).rejects.toThrow('"announcedBytes": 900');
    await expect(boundedBody(new Response('abc'), 2)).rejects.toThrow('"receivedBytes": 3');
    await expect(boundedBody(new Response('abc', { headers: { 'content-length': '4' } }), 100)).rejects.toThrow('"expectedBytes": 4');
    await expect(boundedBody(new Response('denied', { status: 403 }), 100)).rejects.toThrow('HTTP_INCOMPLETE_RESPONSE');
  });
  it('keeps per-portion legacy and detailed reasons in both live and retained summaries', () => {
    const { result } = syntheticSnapshot();
    result.records[0]!.acquisition = { state: 'unavailable', reason: 'Legacy metadata failure' };
    result.assets[0]!.acquisition = { state: 'unavailable', reason: diagnosticError('BILI_VIDEO_ASSEMBLY_FAILED', 'video.color-validation', 'Unsupported color', { actual: { primaries: null }, expected: { primaries: 'bt709' } }).message };
    const summary = summarizeResult(result);
    expect(summary.issues).toHaveLength(2);
    expect(summary.issues?.[0]).toEqual({ target: `record/${result.records[0]!.id}`, reason: 'Legacy metadata failure' });
    expect(summary.issues?.[1]?.reason).toContain('video.color-validation');
    expect(summary.issues?.[1]?.reason).toContain('"primaries": null');
    expect(summarizeResult(structuredClone(result))).toEqual(summary);
  });
  it('bounds excessive or cyclic context while retaining the primary diagnostic', () => {
    const context: Record<string, unknown> = {}; context.self = context; context.long = 'x'.repeat(20000);
    const report = diagnosticError('BOUNDED', 'test', 'Primary failure', context).message;
    expect(report).toContain('Primary failure'); expect(report.length).toBeLessThan(8250);
  });
});
