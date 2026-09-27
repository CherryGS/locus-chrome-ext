import type { ResultSummary } from '@/host/chrome/protocol';
import { availability, type CaptureResult } from '@locus/capture-core/model';

export type CaptureState = 'uncaptured' | 'checking' | 'queued' | 'importing' | 'saving' | 'saved' | 'locus-saved' | 'partial' | 'failed' | 'unknown';
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';

export const captureStates = {
  uncaptured: { label: 'Not captured', description: 'No capture for this source is currently available in your local library.', tone: 'neutral' },
  checking: { label: 'Checking status', description: 'Reading the local capture state.', tone: 'info' },
  queued: { label: 'Queued', description: 'This selection has been accepted and is waiting for an available capture slot.', tone: 'info' },
  importing: { label: 'Importing', description: 'The selected content and files are still being acquired.', tone: 'info' },
  saving: { label: 'Saving', description: 'Captured content is available; the requested save is still in progress.', tone: 'info' },
  saved: { label: 'Staged locally', description: 'The selected content and files are complete and retained in the extension. This is separate from saving to Locus.', tone: 'neutral' },
  'locus-saved': { label: 'Saved to Locus', description: 'Locus confirmed every requested import item. This describes this save, not a live library lookup.', tone: 'success' },
  partial: { label: 'Partial capture', description: 'Some selected content is available; missing portions remain identified.', tone: 'warning' },
  failed: { label: 'Needs attention', description: 'Capture, local retention or Locus saving needs attention. Inspect the result for details.', tone: 'destructive' },
  unknown: { label: 'Status unavailable', description: 'Capture state could not be verified. This does not mean the source has not been captured.', tone: 'warning' },
} satisfies Record<CaptureState, { label: string; description: string; tone: StatusTone }>;

/** Staging, capture errors and confirmed receiver success have distinct meanings. */
export function getCaptureStatus(result: Pick<ResultSummary, 'acquisition' | 'retention' | 'revision' | 'locus'> & { queuePosition?: number; unresolvedReason?: string }): CaptureState {
  if (result.unresolvedReason) return 'unknown';
  if (result.retention.state === 'failed') return 'failed';
  if (result.queuePosition !== undefined) return 'queued';
  if (result.acquisition === 'unavailable') return 'failed';
  if (result.acquisition === 'pending') return 'importing';
  if (result.acquisition === 'partial') return 'partial';
  if (result.retention.state === 'pending') return 'saving';
  if (result.retention.revision !== result.revision) return 'unknown';
  if (result.locus?.state === 'complete') return 'locus-saved';
  if (result.locus && result.locus.state !== 'configuration-required') {
    if(result.locus.state==='failed')return 'failed';
    if(result.locus.state==='unverified')return 'unknown';
    return 'saving';
  }
  if (result.acquisition === 'complete' && result.retention.state === 'retained' && result.retention.revision === result.revision) return 'saved';
  return 'unknown';
}

export function getResultCaptureStatus(result: CaptureResult, locus?:ResultSummary['locus']): CaptureState {
  const state = availability(result);
  return getCaptureStatus({ ...result, locus, acquisition: state.complete ? 'complete' : state.pending ? 'pending' : state.acquired ? 'partial' : 'unavailable' });
}
