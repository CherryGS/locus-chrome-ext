import { coordinator, type Inspection, type ResultSummary, type SourceStatus } from '@/host/chrome/protocol';
import { errorMessage } from '@locus/capture-core/model';
import { postUrl } from '@locus/twitter/urls';
import { captureStates, getCaptureStatus, type CaptureState } from '@/ui/shared/capture-status';

export interface CaptureDraft {
  sourceId: string; url: string; inspection?: Inspection; selected: string[];
  busy: 'inspect' | 'enqueue' | ''; error: string; enqueueFailed: boolean; generation: number;
  autoStart?: boolean;
}
export interface CaptureTask { summary: ResultSummary; sourceId: string; error: string }
interface PassiveStatus { summary?: ResultSummary | null; error?: string }
export interface QueueView {
  visible: boolean; expanded: boolean; selected?: string; drafts: Record<string, CaptureDraft>;
  tasks: CaptureTask[]; error: string;
}

/** One page observer, independent of X's virtualized article nodes. */
export class CaptureStore {
  private value: QueueView = { visible: false, expanded: false, drafts: {}, tasks: [], error: '' };
  private listeners = new Set<() => void>();
  private passive = new Map<string, PassiveStatus>();
  private latest = new Map<string, string>();
  private removed = new Set<string>();
  private alive = true;
  private refreshing = false;
  private quickStarts = new Set<string>();
  private inspectionRequests = new Map<string, Promise<boolean>>();
  private timer?: ReturnType<typeof setInterval>;
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<QueueView> = {}) {
    if (!this.alive) return;
    this.value = { ...this.value, ...patch };for (const listener of this.listeners) listener();
  }
  private draft(sourceId: string, patch: Partial<CaptureDraft>) {
    const existing = this.value.drafts[sourceId];if (existing) this.publish({ drafts: { ...this.value.drafts, [sourceId]: { ...existing, ...patch } } });
  }
  start() { if (!this.alive || this.timer) return;void this.refresh();this.timer = setInterval(() => void this.refresh(), 3000); }
  stop() { this.alive = false;clearInterval(this.timer);this.listeners.clear(); }
  minimize = () => this.publish({ expanded: false, selected: undefined });
  showQueue = () => { this.publish({ visible: true, expanded: true, selected: undefined });void this.refresh(); };
  private prepareDraft(url: string) {
    const { id: sourceId } = postUrl(url);
    let draft = this.value.drafts[sourceId];
    if (!draft) draft = { sourceId, url, selected: [], busy: '', error: '', enqueueFailed: false, generation: 0 };
    const drafts = { ...this.value.drafts, [sourceId]: { ...draft, url } };
    // Only unsubmitted drafts are bounded here. Accepted jobs live in the host.
    const disposable = Object.keys(drafts).filter(key => key !== sourceId && !drafts[key]!.busy);
    for (const key of disposable.slice(0, Math.max(0, Object.keys(drafts).length - 30))) delete drafts[key];
    this.publish({ drafts });return { sourceId, draft };
  }
  select(url: string) {
    const { sourceId, draft } = this.prepareDraft(url);
    if (!this.quickStarts.has(sourceId)) this.draft(sourceId, { autoStart: false });
    this.publish({ visible: true, expanded: true, selected: sourceId });
    if (!draft.inspection && !draft.busy) void this.inspect(sourceId);
  }
  async quickCapture(url: string) {
    const sourceId = postUrl(url).id;
    if (!this.alive) return;
    if (this.quickStarts.has(sourceId) || this.value.drafts[sourceId]?.busy === 'enqueue') { this.showQueue();return; }
    const processing = (summary: ResultSummary) => !summary.unresolvedReason && (summary.queuePosition !== undefined || summary.acquisition === 'pending' || summary.retention.state === 'pending');
    const active = this.value.tasks.find(task => task.sourceId === sourceId && processing(task.summary));
    const previous = active?.summary ?? this.sourceResult(sourceId);
    if (previous && processing(previous) && (active || !this.passive.get(sourceId)?.error)) {
      if (!active) this.upsert(previous, sourceId);this.showQueue();return;
    }
    // The trusted primary click authorizes fresh inspection and the entire
    // current post scope. Hold one pipeline per source through both awaits.
    this.quickStarts.add(sourceId);this.prepareDraft(url);
    this.draft(sourceId, { autoStart: true, inspection: undefined, selected: [], error: '', enqueueFailed: false });
    this.publish({ visible: true, expanded: false, selected: undefined });
    try {
      const ready = await this.inspect(sourceId);
      if (!ready || !this.alive) return;
      await this.enqueue(sourceId);
    } finally { this.quickStarts.delete(sourceId); }
  }
  inspect(sourceId: string): Promise<boolean> {
    const existing = this.inspectionRequests.get(sourceId);if (existing) return existing;
    const request = this.inspectSource(sourceId);this.inspectionRequests.set(sourceId, request);
    void request.finally(() => { if (this.inspectionRequests.get(sourceId) === request) this.inspectionRequests.delete(sourceId); });
    return request;
  }
  private async inspectSource(sourceId: string): Promise<boolean> {
    const draft = this.value.drafts[sourceId];if (!draft || draft.busy) return false;
    const generation = draft.generation + 1;
    this.draft(sourceId, { busy: 'inspect', error: '', enqueueFailed: false, inspection: undefined, generation });
    try {
      const inspection = await coordinator<Inspection>('inspect', { url: draft.url });
      if (!this.alive || this.value.drafts[sourceId]?.generation !== generation) return false;
      this.draft(sourceId, { inspection, selected: inspection.media.map(media => media.id) });
      return true;
    } catch (error) { if (this.value.drafts[sourceId]?.generation === generation) this.draft(sourceId, { error: errorMessage(error), enqueueFailed: !!this.value.drafts[sourceId]?.autoStart });return false; }
    finally { if (this.value.drafts[sourceId]?.generation === generation) this.draft(sourceId, { busy: '' }); }
  }
  choose(sourceId: string, id: string, checked: boolean) {
    const draft = this.value.drafts[sourceId];if (!draft?.inspection || draft.busy || !draft.inspection.media.some(media => media.id === id)) return;
    this.draft(sourceId, { selected: checked ? [...new Set([...draft.selected, id])] : draft.selected.filter(value => value !== id) });
  }
  async enqueue(sourceId: string) {
    const draft = this.value.drafts[sourceId];if (!draft?.inspection || draft.busy) return;
    this.draft(sourceId, { busy: 'enqueue', error: '', enqueueFailed: false });
    try {
      const summary = await coordinator<ResultSummary>('capture', { token: draft.inspection.token, selected: [...draft.selected] });
      if (!this.alive) return;
      this.latest.set(sourceId, summary.id);
      // A passive refresh may already have seen this accepted job progress.
      if (!this.value.tasks.some(task => task.summary.id === summary.id)) this.upsert(summary, sourceId);
      this.draft(sourceId, { inspection: undefined, selected: [], busy: '', autoStart: false });
      // Do not collapse an editor the user opened for another source meanwhile.
      if (this.value.selected === sourceId) this.minimize();
      void this.refresh();
    } catch (error) { this.draft(sourceId, { busy: '', error: errorMessage(error), enqueueFailed: true }); }
  }
  private upsert(summary: ResultSummary, sourceId = postUrl(summary.sourceUrl).id) {
    if (this.removed.has(summary.id)) return;
    const previous = this.value.tasks.find(task => task.summary.id === summary.id);
    if (previous && summary.revision < previous.summary.revision) return;
    const task: CaptureTask = { summary, sourceId: previous?.sourceId ?? sourceId, error: summary.unresolvedReason ?? '' };
    const tasks = [...this.value.tasks.filter(item => item.summary.id !== summary.id), task].sort((a,b) => b.summary.createdAt.localeCompare(a.summary.createdAt));
    let finished = 0;
    this.publish({ visible: true, tasks: tasks.filter(item => ['queued','importing','saving'].includes(getCaptureStatus(item.summary)) || finished++ < 30) });
  }
  async refresh() {
    if (!this.alive || this.refreshing) return;
    this.refreshing = true;
    // Freeze IDs before awaiting: an earlier refresh cannot remove a new job.
    const observed = this.value.tasks.map(task => task.summary.id);
    try {
      const current = await coordinator<ResultSummary[]>('capture-tasks');
      if (!this.alive) return;
      for (const summary of current) {
        // A read dispatched before a new acceptance cannot regress its runtime
        // queue phase, which can change independently of the stored revision.
        if (!observed.includes(summary.id) && this.value.tasks.some(task => task.summary.id === summary.id)) continue;
        this.upsert(summary);
      }
      this.publish({ error: '' });
      const active = new Set(current.map(summary => summary.id));
      await Promise.all(observed.filter(id => !active.has(id)).map(async id => {
        try {
          const summary = await coordinator<ResultSummary | null>('status', { id });
          if (!this.alive) return;
          if (summary && summary.id !== id) throw new Error('Result identity did not match the requested task');
          if (summary) this.upsert(summary);
          else { this.removed.add(id);this.publish({ tasks: this.value.tasks.filter(task => task.summary.id !== id) }); }
        } catch (error) { if (this.alive) this.publish({ tasks: this.value.tasks.map(task => task.summary.id === id ? { ...task, error: errorMessage(error) } : task) }); }
      }));
    } catch (error) { this.publish({ error: errorMessage(error) }); }
    finally { this.refreshing = false; }
  }
  sourceStatus(sourceId: string): { state: CaptureState; message: string } {
    const draft = this.value.drafts[sourceId];
    if (draft?.autoStart && draft.busy === 'inspect') return { state: 'checking', message: 'Inspecting this post before capturing its message and all direct media.' };
    if (draft?.busy === 'enqueue') return { state: 'importing', message: 'Submitting the selected scope to the task queue.' };
    if (draft?.enqueueFailed) return { state: 'failed', message: draft.error };
    const task = this.value.tasks.find(item => item.summary.id === this.latest.get(sourceId));
    const passive = this.passive.get(sourceId);
    const summary = task?.summary ?? (passive?.summary && !this.removed.has(passive.summary.id) ? passive.summary : undefined);
    const error = task ? task.error || this.value.error : passive?.error;
    if (error) return { state: 'unknown', message: error };
    if (summary) return { state: getCaptureStatus(summary), message: `${summary.label}: acquisition ${summary.acquisition}; retention ${summary.retention.state}${summary.queuePosition ? `; queue position ${summary.queuePosition}` : ''}${summary.retention.reason ? ` — ${summary.retention.reason}` : ''}` };
    const state = passive ? 'uncaptured' : 'checking';return { state, message: captureStates[state].description };
  }
  sourceResult(sourceId: string): ResultSummary | undefined {
    const current = this.value.tasks.find(task => task.summary.id === this.latest.get(sourceId))?.summary;
    const passive = this.passive.get(sourceId)?.summary;
    const result = current ?? passive;return result && !this.removed.has(result.id) ? result : undefined;
  }
  sourceResults(urls: string[], values?: SourceStatus[], error?: string) {
    for (const url of urls) { const sourceId = postUrl(url).id;const value = values?.find(item => item.sourceId === sourceId);this.passive.set(sourceId, value ? { summary: value.summary, error: value.unresolvedReason } : { error: error ?? 'The local source status could not be verified.' }); }
    this.publish();
  }
  retainSources(visible: string[]) {
    const needed = new Set([...visible, ...Object.keys(this.value.drafts), ...this.value.tasks.map(task => task.sourceId)]);
    for (const key of this.passive.keys()) if (!needed.has(key)) this.passive.delete(key);
    const taskIds = new Set(this.value.tasks.map(task => task.summary.id));
    for (const [key, id] of this.latest) if (!needed.has(key) || !taskIds.has(id)) this.latest.delete(key);
  }
  async openResult(id: string) {
    try { await coordinator('open-result', { id }); }
    catch (error) { this.publish({ error: errorMessage(error) }); }
  }
}
