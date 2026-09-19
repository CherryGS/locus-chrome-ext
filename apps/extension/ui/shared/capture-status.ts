import type { ResultSummary } from '@/host/chrome/protocol';
import { availability, type CaptureResult } from '@/core/results/model';

export type CaptureState = 'uncaptured' | 'checking' | 'queued' | 'importing' | 'saving' | 'saved' | 'partial' | 'failed' | 'unknown';
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';

export const captureStates = {
  uncaptured: { label: 'Not captured', description: 'No capture for this source is currently available in your local library.', tone: 'neutral' },
  checking: { label: 'Checking status', description: 'Reading the local capture state.', tone: 'info' },
  queued: { label: 'Queued', description: 'This selection has been accepted and is waiting for an available capture slot.', tone: 'info' },
  importing: { label: 'Importing', description: 'The selected message and files are still being acquired.', tone: 'info' },
  saving: { label: 'Saving', description: 'Current content is available but has not finished saving locally.', tone: 'info' },
  saved: { label: 'Saved locally', description: 'The selected message and files are complete and saved on this device.', tone: 'success' },
  partial: { label: 'Partial capture', description: 'Some selected content is available; missing portions remain identified.', tone: 'warning' },
  failed: { label: 'Needs attention', description: 'Acquisition or local storage failed. Inspect the result for details and any usable content.', tone: 'destructive' },
  unknown: { label: 'Status unavailable', description: 'Capture state could not be verified. This does not mean the source has not been captured.', tone: 'warning' },
} satisfies Record<CaptureState, { label: string; description: string; tone: StatusTone }>;

/** Green means the entire selected scope is committed at its current revision. */
export function getCaptureStatus(result: Pick<ResultSummary, 'acquisition' | 'retention' | 'revision'> & { queuePosition?: number; unresolvedReason?: string }): CaptureState {
  if (result.unresolvedReason) return 'unknown';
  if (result.queuePosition !== undefined) return 'queued';
  if (result.retention.state === 'failed' || result.acquisition === 'unavailable') return 'failed';
  if (result.acquisition === 'pending') return 'importing';
  if (result.acquisition === 'partial') return 'partial';
  if (result.acquisition === 'complete' && result.retention.state === 'retained' && result.retention.revision === result.revision) return 'saved';
  if (result.retention.state === 'pending') return 'saving';
  return 'unknown';
}

export function getResultCaptureStatus(result: CaptureResult): CaptureState {
  const state = availability(result);
  return getCaptureStatus({ ...result, acquisition: state.complete ? 'complete' : state.pending ? 'pending' : state.acquired ? 'partial' : 'unavailable' });
}
