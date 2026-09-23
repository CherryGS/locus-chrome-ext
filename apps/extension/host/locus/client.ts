import type { LocusConnection } from './model';

export class LocusError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}
export interface Receipt { run_id: string; request_id: string; task_id: string }
export type Submission = { status: 'admission_pending' } | { status: 'accepted'; receipt: Receipt } | { status: 'rejected'; error: { message: string; code: string } };
export interface UploadObservation { confirmed_file_id?: string; problem?: string; uncertain: boolean; actions: string[] }
export interface ImportItem { item_id: string; active_request_id?: string; actions: string[]; current: { overall?: string; confirmed_entity_id?: string; complete: boolean; [key: string]: unknown } }
export interface ImportBatch { batch_id: string; original_request_id: string; original_ended: boolean; items: ImportItem[] }
export type Outcome = { status: 'pending' } | { status: 'complete'; outcome: { status: string; result?: UploadObservation; batch_id?: string } };
export class LocusClient {
  constructor(private connection: LocusConnection, readonly runId: string, private transport: typeof fetch = fetch) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.connection.token}`);
    headers.set('X-Locus-Run', this.runId);
    const transport=this.transport;
    const response = await transport(`${this.connection.origin}/external/v1/${path}`, { ...init, headers, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(180_000) });
    const value = await response.json();
    if (!response.ok) throw new LocusError(typeof value.message === 'string' ? value.message : `Locus returned HTTP ${response.status}`, value.code);
    return value as T;
  }
  post<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
}
export async function bootstrap(connection: LocusConnection, transport: typeof fetch = fetch): Promise<string> {
  const response = await transport(`${connection.origin}/external/v1/bootstrap`, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Locus connection failed: HTTP ${response.status}`);
  const value = await response.json();
  if (typeof value.run_id !== 'string' || !value.run_id) throw new Error('Locus returned no backend run');
  return value.run_id;
}
export async function checkConnection(connection: LocusConnection) {
  const runId = await bootstrap(connection);
  await new LocusClient(connection, runId).request('tasks',{signal:AbortSignal.timeout(10_000)});
}
