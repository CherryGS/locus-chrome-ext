import type { CaptureResult, Delivery, Snapshot } from '@locus/capture-core/model';
import type { CaptureProgress } from './capture-progress';

export const CHANNEL = 'locus-results-v1';
export interface ResultSummary { id: string; label: string; sourceUrl: string; createdAt: string; revision: number; acquisition: string; retention: CaptureResult['retention']; unresolvedReason?: string; queuePosition?: number; progress?: CaptureProgress; issues?: { target: string; reason: string }[] }
export interface SourceStatus { sourceId: string; summary: ResultSummary | null; unresolvedReason?: string }
export interface Inspection { token: string; expiresAt: number; sourceUrl: string; label: string; textPreview: string | null; textFailure: string | null; media: { id: string; kind: string; sourceId: string | null; previewUrl?: string | null; reason: string | null; quality: string }[] }
export interface Collection { items: ResultSummary[]; deliveries: Delivery[]; storageError?: string }
export interface ReadResponse { snapshot: Snapshot | null; deliveries: Delivery[] }
export async function coordinator<T>(op: string, values: Record<string, unknown> = {}): Promise<T> {
  const reply = await chrome.runtime.sendMessage({ target: 'coordinator', op, ...values });
  if (!reply?.ok) throw new Error(reply?.error ?? 'Extension coordinator unavailable');
  return reply.value as T;
}
export async function ownerRequest<T>(op: 'list' | 'read' | 'clear' | 'export', id?: string): Promise<T> {
  // The channel is same-origin structured clone, carrying real Blobs and large
  // payloads. A one-use coordinator grant scopes each consumer operation.
  const grant = await coordinator<string>('grant', { operation: op, id });
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL);
    const timeout = setTimeout(() => { channel.close(); reject(new Error('Result owner did not answer. Retry the read; this is not evidence of removal.')); }, 30_000);
    channel.onmessage = event => { if (event.data?.requestId !== grant) return; clearTimeout(timeout); channel.close(); if (event.data.ok) resolve(event.data.value); else reject(new Error(event.data.error)); };
    channel.postMessage({ requestId: grant });
  });
}
