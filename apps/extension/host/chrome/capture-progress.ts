import { availability, type CaptureResult } from '@locus/capture-core/model';

export interface TransferProgress { receivedBytes: number; totalBytes: number | null }
export type TransferObserver = (progress: TransferProgress) => void;
export interface FractionProgress { fraction: number | null }
export type AcquisitionProgress = TransferProgress | FractionProgress;
export interface CaptureProgress { percent: number | null; completedFiles: number; totalFiles: number }

/** Files have equal weight; byte fractions only describe the current file.
 * Unknown lengths stay indeterminate and 100 requires a committed full result.
 * This is presentation data, never a persisted acquisition/retention claim. */
export function captureProgress(result: CaptureResult, transfer?: AcquisitionProgress): CaptureProgress {
  const totalFiles = result.assets.length;
  const completedFiles = result.assets.filter(asset => asset.acquisition.state !== 'pending').length;
  const saved = availability(result).complete && result.retention.state === 'retained' && result.retention.revision === result.revision;
  if (saved) return { percent: 100, completedFiles, totalFiles };
  const current = transfer && 'fraction' in transfer ? transfer.fraction : transfer?.totalBytes === null ? null : transfer?.totalBytes ? transfer.receivedBytes / transfer.totalBytes : 0;
  if (current === null) return { percent: null, completedFiles, totalFiles };
  const fraction = Math.max(0, Math.min(1, current));
  return { percent: totalFiles ? Math.min(99, Math.floor(100 * (completedFiles + fraction) / totalFiles)) : 99, completedFiles, totalFiles };
}
