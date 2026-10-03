import {
  coordinator,
  type Inspection,
  type ResultSummary,
  type SourceStatus,
} from "@/host/chrome/protocol";
import { errorMessage } from "@locus/capture-core/model";
import { sourceSelection } from "@/host/chrome/sites";
import {
  captureStates,
  getCaptureStatus,
  type CaptureState,
} from "@/ui/shared/capture-status";

export interface CaptureDraft {
  sourceId: string;
  url: string;
  inspection?: Inspection;
  busy: "inspect" | "enqueue" | "";
  error: string;
  enqueueFailed: boolean;
  generation: number;
}
export interface CaptureTask {
  summary: ResultSummary;
  sourceId: string;
  error: string;
}
interface PassiveStatus {
  summary?: ResultSummary | null;
  error?: string;
}
export interface QueueView {
  visible: boolean;
  expanded: boolean;
  drafts: Record<string, CaptureDraft>;
  tasks: CaptureTask[];
  error: string;
}

/** One page observer, independent of site's virtualized article nodes. */
export class CaptureStore {
  private value: QueueView = {
    visible: false,
    expanded: false,
    drafts: {},
    tasks: [],
    error: "",
  };
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
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<QueueView> = {}) {
    if (!this.alive) return;
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener();
  }
  private draft(sourceId: string, patch: Partial<CaptureDraft>) {
    const existing = this.value.drafts[sourceId];
    if (existing)
      this.publish({
        drafts: { ...this.value.drafts, [sourceId]: { ...existing, ...patch } },
      });
  }
  start() {
    if (!this.alive || this.timer) return;
    // Mounts call start only after site authorization/readiness. Queue access
    // should not depend on a prior capture, and does not open the task modal.
    this.publish({ visible: true });
    void this.refresh();
    let idleTicks = 0;
    this.timer = setInterval(() => {
      const acquiring = this.value.tasks.some(
        (task) =>
          task.summary.acquisition === "pending" &&
          task.summary.queuePosition === undefined,
      );
      if (++idleTicks >= 6 || acquiring) {
        idleTicks = 0;
        void this.refresh();
      }
    }, 500);
  }
  pause() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
  stop() {
    this.alive = false;
    this.pause();
    this.listeners.clear();
  }
  minimize = () => this.publish({ expanded: false });
  showQueue = () => {
    this.publish({ visible: true, expanded: true });
    void this.refresh();
  };
  private prepareDraft(url: string) {
    const { id: sourceId } = sourceSelection(url);
    let draft = this.value.drafts[sourceId];
    if (!draft)
      draft = {
        sourceId,
        url,
        busy: "",
        error: "",
        enqueueFailed: false,
        generation: 0,
      };
    const drafts = { ...this.value.drafts, [sourceId]: { ...draft, url } };
    // Only unsubmitted drafts are bounded here. Accepted jobs live in the host.
    const disposable = Object.keys(drafts).filter(
      (key) => key !== sourceId && !drafts[key]!.busy,
    );
    for (const key of disposable.slice(
      0,
      Math.max(0, Object.keys(drafts).length - 30),
    ))
      delete drafts[key];
    this.publish({ drafts });
  }
  async quickCapture(url: string) {
    const sourceId = sourceSelection(url).id;
    if (!this.alive) return;
    if (
      this.quickStarts.has(sourceId) ||
      this.value.drafts[sourceId]?.busy === "enqueue"
    ) {
      this.showQueue();
      return;
    }
    const processing = (summary: ResultSummary) =>
      !summary.unresolvedReason &&
      (summary.queuePosition !== undefined ||
        summary.acquisition === "pending" ||
        summary.retention.state === "pending" ||
        (!!summary.locus &&
          ["waiting", "uploading", "importing"].includes(summary.locus.state)));
    const active = this.value.tasks.find(
      (task) => task.sourceId === sourceId && processing(task.summary),
    );
    const previous = active?.summary ?? this.sourceResult(sourceId);
    if (
      previous &&
      processing(previous) &&
      (active || !this.passive.get(sourceId)?.error)
    ) {
      if (!active) this.upsert(previous, sourceId);
      this.showQueue();
      return;
    }
    // The trusted primary click authorizes fresh inspection and the entire
    // current source scope. Hold one pipeline per source through both awaits.
    this.quickStarts.add(sourceId);
    this.prepareDraft(url);
    this.draft(sourceId, {
      inspection: undefined,
      error: "",
      enqueueFailed: false,
    });
    this.publish({ visible: true, expanded: false });
    try {
      const ready = await this.inspect(sourceId);
      if (!ready || !this.alive) return;
      await this.enqueue(sourceId);
    } finally {
      this.quickStarts.delete(sourceId);
    }
  }
  inspect(sourceId: string): Promise<boolean> {
    const existing = this.inspectionRequests.get(sourceId);
    if (existing) return existing;
    const request = this.inspectSource(sourceId);
    this.inspectionRequests.set(sourceId, request);
    void request.finally(() => {
      if (this.inspectionRequests.get(sourceId) === request)
        this.inspectionRequests.delete(sourceId);
    });
    return request;
  }
  private async inspectSource(sourceId: string): Promise<boolean> {
    const draft = this.value.drafts[sourceId];
    if (!draft || draft.busy) return false;
    const generation = draft.generation + 1;
    this.draft(sourceId, {
      busy: "inspect",
      error: "",
      enqueueFailed: false,
      inspection: undefined,
      generation,
    });
    try {
      const inspection = await coordinator<Inspection>("inspect", {
        url: draft.url,
      });
      if (!this.alive || this.value.drafts[sourceId]?.generation !== generation)
        return false;
      this.draft(sourceId, {
        inspection,
      });
      return true;
    } catch (error) {
      if (this.value.drafts[sourceId]?.generation === generation)
        this.draft(sourceId, {
          error: errorMessage(error),
          enqueueFailed: true,
        });
      return false;
    } finally {
      if (this.value.drafts[sourceId]?.generation === generation)
        this.draft(sourceId, { busy: "" });
    }
  }
  async enqueue(sourceId: string) {
    const draft = this.value.drafts[sourceId];
    if (!draft?.inspection || draft.busy) return;
    this.draft(sourceId, { busy: "enqueue", error: "", enqueueFailed: false });
    try {
      const summary = await coordinator<ResultSummary>("capture", {
        token: draft.inspection.token,
        selected: draft.inspection.media.map((media) => media.id),
      });
      if (!this.alive) return;
      this.latest.set(sourceId, summary.id);
      // A passive refresh may already have seen this accepted job progress.
      if (!this.value.tasks.some((task) => task.summary.id === summary.id))
        this.upsert(summary, sourceId);
      this.draft(sourceId, {
        inspection: undefined,
        busy: "",
      });
      // Preserve a task modal explicitly opened while submission was pending.
      void this.refresh();
    } catch (error) {
      this.draft(sourceId, {
        busy: "",
        error: errorMessage(error),
        enqueueFailed: true,
      });
    }
  }
  private upsert(
    summary: ResultSummary,
    sourceId = sourceSelection(summary.sourceUrl).id,
  ) {
    if (this.removed.has(summary.id)) return;
    const previous = this.value.tasks.find(
      (task) => task.summary.id === summary.id,
    );
    if (previous && summary.revision < previous.summary.revision) return;
    const task: CaptureTask = {
      summary,
      sourceId: previous?.sourceId ?? sourceId,
      error: summary.unresolvedReason ?? "",
    };
    const tasks = [
      ...this.value.tasks.filter((item) => item.summary.id !== summary.id),
      task,
    ].sort((a, b) => b.summary.createdAt.localeCompare(a.summary.createdAt));
    let finished = 0;
    this.publish({
      visible: true,
      tasks: tasks.filter(
        (item) =>
          ["queued", "importing", "saving"].includes(
            getCaptureStatus(item.summary),
          ) || finished++ < 30,
      ),
    });
  }
  async refresh() {
    if (!this.alive || this.refreshing) return;
    this.refreshing = true;
    // Freeze IDs before awaiting: an earlier refresh cannot remove a new job.
    const observed = this.value.tasks.map((task) => task.summary.id);
    try {
      const current = await coordinator<ResultSummary[]>("capture-tasks");
      if (!this.alive) return;
      for (const summary of current) {
        // A read dispatched before a new acceptance cannot regress its runtime
        // queue phase, which can change independently of the stored revision.
        if (
          !observed.includes(summary.id) &&
          this.value.tasks.some((task) => task.summary.id === summary.id)
        )
          continue;
        this.upsert(summary);
      }
      this.publish({ error: "" });
      const active = new Set(current.map((summary) => summary.id));
      await Promise.all(
        observed
          .filter((id) => !active.has(id))
          .map(async (id) => {
            try {
              const summary = await coordinator<ResultSummary | null>(
                "status",
                { id },
              );
              if (!this.alive) return;
              if (summary && summary.id !== id)
                throw new Error(
                  "Result identity did not match the requested task",
                );
              if (summary) this.upsert(summary);
              else {
                this.removed.add(id);
                this.publish({
                  tasks: this.value.tasks.filter(
                    (task) => task.summary.id !== id,
                  ),
                });
              }
            } catch (error) {
              if (this.alive)
                this.publish({
                  tasks: this.value.tasks.map((task) =>
                    task.summary.id === id
                      ? { ...task, error: errorMessage(error) }
                      : task,
                  ),
                });
            }
          }),
      );
    } catch (error) {
      this.publish({ error: errorMessage(error) });
    } finally {
      this.refreshing = false;
    }
  }
  sourceStatus(sourceId: string): {
    state: CaptureState;
    message: string;
    progress?: ResultSummary["progress"];
  } {
    const draft = this.value.drafts[sourceId];
    if (draft?.busy === "inspect")
      return {
        state: "checking",
        message:
          "Inspecting the selected content before capturing its metadata and files.",
      };
    if (draft?.busy === "enqueue")
      return {
        state: "importing",
        message: "Submitting the selected scope to the task queue.",
      };
    if (draft?.enqueueFailed) return { state: "failed", message: draft.error };
    const passive = this.passive.get(sourceId);
    const taskId = this.latest.get(sourceId) ?? passive?.summary?.id;
    const task = this.value.tasks.find((item) => item.summary.id === taskId);
    const summary =
      task?.summary ??
      (passive?.summary && !this.removed.has(passive.summary.id)
        ? passive.summary
        : undefined);
    const error = task ? task.error || this.value.error : passive?.error;
    if (error) return { state: "unknown", message: error };
    if (summary)
      return {
        state: getCaptureStatus(summary),
        progress:
          summary.acquisition === "complete" && summary.locus
            ? undefined
            : summary.progress,
        message:
          summary.locus?.message ??
          `${summary.label}: acquisition ${summary.acquisition}; retention ${summary.retention.state}${summary.queuePosition ? `; queue position ${summary.queuePosition}` : ""}${summary.retention.reason ? ` — ${summary.retention.reason}` : ""}`,
      };
    const state = passive ? "uncaptured" : "checking";
    return { state, message: captureStates[state].description };
  }
  sourceResult(sourceId: string): ResultSummary | undefined {
    const passive = this.passive.get(sourceId)?.summary;
    const current = this.value.tasks.find(
      (task) => task.summary.id === (this.latest.get(sourceId) ?? passive?.id),
    )?.summary;
    const result = current ?? passive;
    return result && !this.removed.has(result.id) ? result : undefined;
  }
  sourceResults(urls: string[], values?: SourceStatus[], error?: string) {
    for (const url of urls) {
      const sourceId = sourceSelection(url).id;
      const value = values?.find((item) => item.sourceId === sourceId);
      this.passive.set(
        sourceId,
        value
          ? { summary: value.summary, error: value.unresolvedReason }
          : {
              error: error ?? "The local source status could not be verified.",
            },
      );
    }
    this.publish();
  }
  retainSources(visible: string[]) {
    const needed = new Set([
      ...visible,
      ...Object.keys(this.value.drafts),
      ...this.value.tasks.map((task) => task.sourceId),
    ]);
    for (const key of this.passive.keys())
      if (!needed.has(key)) this.passive.delete(key);
    const taskIds = new Set(this.value.tasks.map((task) => task.summary.id));
    for (const [key, id] of this.latest)
      if (!needed.has(key) || !taskIds.has(id)) this.latest.delete(key);
  }
  async openResult(id: string) {
    try {
      await coordinator("open-result", { id });
    } catch (error) {
      this.publish({ error: errorMessage(error) });
    }
  }
}
