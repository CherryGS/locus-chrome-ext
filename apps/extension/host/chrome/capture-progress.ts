import { availability, type CaptureResult } from '@locus/capture-core/model';

export interface TransferProgress { receivedBytes: number; totalBytes: number | null }
export type TransferObserver = (progress: TransferProgress) => void;
export interface FractionProgress { fraction: number | null }
export type AcquisitionProgress = TransferProgress | FractionProgress;
export interface CaptureProgress { percent: number | null; completedFiles: number; totalFiles: number }

export type AssetTransfers = ReadonlyMap<string, AcquisitionProgress>;

const fraction = (transfer?: AcquisitionProgress): number | null =>
  transfer && 'fraction' in transfer ? transfer.fraction : transfer?.totalBytes === null ? null : transfer?.totalBytes ? transfer.receivedBytes / transfer.totalBytes : 0;

/** Files have equal weight; byte fractions describe each active file.
 * Unknown lengths stay indeterminate and 100 requires a committed full result.
 * This is presentation data, never a persisted acquisition/retention claim. */
export function captureProgress(result: CaptureResult, transfer?: AcquisitionProgress | AssetTransfers): CaptureProgress {
  const totalFiles = result.assets.length;
  const completedFiles = result.assets.filter(asset => asset.acquisition.state !== 'pending').length;
  const saved = availability(result).complete && result.retention.state === 'retained' && result.retention.revision === result.revision;
  if (saved) return { percent: 100, completedFiles, totalFiles };
  const values = transfer && 'get' in transfer
    ? result.assets.filter(asset => asset.acquisition.state === 'pending').map(asset => fraction(transfer.get(asset.id)))
    : [fraction(transfer)];
  if (values.some(value => value === null)) return { percent: null, completedFiles, totalFiles };
  const active = values.reduce<number>((sum, value) => sum + Math.max(0, Math.min(1, value!)), 0);
  return { percent: totalFiles ? Math.min(99, Math.floor(100 * (completedFiles + active) / totalFiles)) : 99, completedFiles, totalFiles };
}
