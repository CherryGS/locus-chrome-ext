import { acquisitionState, type CaptureResult } from '@locus/capture-core/model';
import { sourceSelection, type CaptureSite } from './sites';
import type { ResultSummary, SourceStatus } from './protocol';
import { redactDiagnostic } from '@locus/capture-core/diagnostics';

export function summarizeResult(result: CaptureResult): ResultSummary {
  const issues=[...result.records.map(record=>({target:`record/${record.id}`,acquisition:record.acquisition})),...result.assets.map(asset=>({target:`asset/${asset.id}`,acquisition:asset.acquisition}))].filter(portion=>portion.acquisition.state==='unavailable').map(portion=>({target:portion.target,reason:redactDiagnostic(portion.acquisition.reason??'Producer returned unavailable without a diagnostic reason.')}));
  return {id:result.id,label:result.label,sourceUrl:result.sourceUrl,createdAt:result.createdAt,revision:result.revision,acquisition:acquisitionState(result),retention:result.retention,...(issues.length?{issues}:{})};
}
export function sourceSummaries(results: CaptureResult[], sourceIds: string[], site:CaptureSite='twitter'): SourceStatus[] {
  const wanted = new Set(sourceIds);
  const latest = new Map<string, CaptureResult>();
  if (!wanted.size) return [];
  // Parse each retained source once rather than sorting and scanning it for every visible URL.
  for (const result of results) {
    if (result.site !== site) continue;
    let sourceId: string;
    try { sourceId = sourceSelection(result.sourceUrl).id; } catch { continue; }
    if (!wanted.has(sourceId)) continue;
    const previous = latest.get(sourceId);
    if (!previous || result.createdAt.localeCompare(previous.createdAt) > 0) latest.set(sourceId, result);
  }
  return sourceIds.map(sourceId => {
    const result = latest.get(sourceId);
    return { sourceId, summary: result ? summarizeResult(result) : null };
  });
}
