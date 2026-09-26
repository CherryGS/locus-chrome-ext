import type { TwitterImportSnapshot } from '@locus/twitter/locus';
import type { BilibiliImportSnapshot } from '@locus/bilibili/locus';

// Keep the original Twitter shape readable in already persisted transfers.
export type LocusImportItem =
  | { assetId?: string; twitter: TwitterImportSnapshot; coverAssetId?: never; bilibili?: never }
  | { assetId: string; coverAssetId: string; bilibili: BilibiliImportSnapshot; twitter?: never };

export interface LocusConnection { origin: string; token: string }
export interface LocusRequest { id: string; dispatched?: boolean }
export interface LocusUpload { assetId: string; request: LocusRequest; fileId?: string }
export interface LocusTransfer {
  resultId: string; revision: number;
  state: 'waiting' | 'uploading' | 'importing' | 'complete' | 'failed' | 'unverified';
  message: string; origin?: string; runId?: string;
  uploads: LocusUpload[]; items?: LocusImportItem[];
  importRequest?: LocusRequest; batchId?: string; entityIds?: string[];
}
export type LocusSummary = Pick<LocusTransfer, 'state' | 'message'>;
export const transferActive = (transfer?: LocusSummary) => !!transfer && ['waiting', 'uploading', 'importing'].includes(transfer.state);
export function connectionInput(origin: string, token: string): LocusConnection {
  const value = new URL(origin.trim());
  if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1' || value.username || value.password || value.pathname !== '/' || value.search || value.hash) throw new Error('Use the active http://127.0.0.1:port address from Locus Settings');
  const secret = token.trim();
  if (!secret || secret.length > 4096 || /[^\x21-\x7e]/.test(secret)) throw new Error('Enter the current Locus Token');
  return { origin: value.origin, token: secret };
}
