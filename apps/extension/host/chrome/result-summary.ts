import { availability, type CaptureResult } from '@locus/capture-core/model';
import { sourceSelection, type CaptureSite } from './sites';
import type { ResultSummary, SourceStatus } from './protocol';
import { redactDiagnostic } from '@locus/capture-core/diagnostics';

export function summarizeResult(result: CaptureResult): ResultSummary {
  const state=availability(result);
  const issues=[...result.records.map(record=>({target:`record/${record.id}`,acquisition:record.acquisition})),...result.assets.map(asset=>({target:`asset/${asset.id}`,acquisition:asset.acquisition}))].filter(portion=>portion.acquisition.state==='unavailable').map(portion=>({target:portion.target,reason:redactDiagnostic(portion.acquisition.reason??'Producer returned unavailable without a diagnostic reason.')}));
  return {id:result.id,label:result.label,sourceUrl:result.sourceUrl,createdAt:result.createdAt,revision:result.revision,acquisition:state.complete?'complete':state.pending?'pending':state.acquired?'partial':'unavailable',retention:result.retention,...(issues.length?{issues}:{})};
}
export function sourceSummaries(results: CaptureResult[], sourceIds: string[], site:CaptureSite='twitter'): SourceStatus[] {
  const sorted=[...results].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return sourceIds.map(sourceId=>{
    const result=sorted.find(item=>{if(item.site!==site)return false;try{return sourceSelection(item.sourceUrl).id===sourceId;}catch{return false;}});
    return {sourceId,summary:result?summarizeResult(result):null};
  });
}
