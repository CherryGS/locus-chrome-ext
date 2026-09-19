export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Acquisition = { state: 'pending' | 'acquired' | 'unavailable'; reason?: string };
export interface ResultRecord { id: string; assetIds: string[]; acquisition: Acquisition; payload?: Json }
export interface ResultAsset { id: string; recordId: string; description: Json; acquisition: Acquisition; mime?: string; size?: number }
export interface CaptureResult {
  id: string;
  site: string;
  label: string;
  sourceUrl: string;
  createdAt: string;
  revision: number;
  records: ResultRecord[];
  assets: ResultAsset[];
  retention: { state: 'pending' | 'retained' | 'failed'; revision: number; reason?: string };
}
export interface Snapshot { result: CaptureResult; blobs: Record<string, Blob>; readErrors: Record<string, string> }
export interface Delivery {
  id: string; resultId: string; revision: number; createdAt: string;
  state: 'packaging' | 'starting' | 'in_progress' | 'complete' | 'interrupted' | 'failed' | 'unverified';
  reason?: string; downloadId?: number; url?: string; partial: boolean;
  dispatch?: 'attempted';
}
export function availability(result: CaptureResult) {
  const portions = [...result.records, ...result.assets];
  const acquired = portions.filter(p => p.acquisition.state === 'acquired').length;
  return { acquired, pending: portions.some(p => p.acquisition.state === 'pending'), complete: portions.length > 0 && acquired === portions.length };
}
export function interrupt(result: CaptureResult): CaptureResult {
  const copy = structuredClone(result);
  for (const part of [...copy.records, ...copy.assets]) {
    if (part.acquisition.state === 'pending') part.acquisition = { state: 'unavailable', reason: 'Interrupted: the execution owner no longer exists. Start a new capture explicitly.' };
  }
  copy.revision++;
  return copy;
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
