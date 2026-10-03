import {
  loadCaptureCandidate,
  selectCaptureCandidate,
  acquireCaptureAsset,
  bilibiliOutputBudget,
  type CaptureCandidate,
  type MediaLease,
} from "./site-capture";
import {
  availability,
  errorMessage,
  interrupt,
  isTerminalDelivery,
  type CaptureResult,
  type Delivery,
  type Snapshot,
} from "@locus/capture-core/model";
import { sourceSelection, type CaptureSite } from "./sites";
import { sourceSummaries, summarizeResult } from "./result-summary";
import { ResultDatabase, ClearedError } from "./database";
import { createArchive } from "./archive";
import { CHANNEL, coordinator, type Inspection } from "./protocol";
import { diagnosticError } from "@locus/capture-core/diagnostics";
import { captureProgress, type AcquisitionProgress } from "./capture-progress";
import { newTransfer, transferToLocus } from "../locus/transfer";
import { transferActive, type LocusTransfer } from "../locus/model";

export function startOffscreen() {
  const database = new ResultDatabase();
  const locusTransfers = new Map<string, LocusTransfer>();
  const locusActive = new Map<string, AbortController>();
  const locusWaiting = new Map<
    string,
    { controller: AbortController; start: (granted: boolean) => void }
  >();
  const live = new Map<string, Snapshot>();
  const active = new Map<string, AbortController>();
  const transfers = new Map<string, Map<string, AcquisitionProgress>>();
  type Job = {
    id: string;
    candidate: CaptureCandidate;
    controller: AbortController;
    initial: Promise<void>;
  };
  const jobs = new Map<string, Job>();
  const waiting: string[] = [];
  const clearing = new Set<string>();
  const accessEpoch: Record<CaptureSite, number> = { twitter: 0, bilibili: 0 };
  const leases = new Map<string, string>();
  const working = new Map<string, number>();
  let assemblyJob: string | undefined;
  let inspections = 0;
  let disposed = false;
  const candidates = new Map<
    string,
    { owner: string; expiresAt: number; candidate: CaptureCandidate }
  >();
  const grants = new Map<
    string,
    { operation: string; id?: string; expiresAt: number }
  >();
  const exports = new Map<string, { delivery: Delivery; url?: string }>();
  const terminalReports = new Map<string, Delivery>();
  const channel = new BroadcastChannel(CHANNEL);
  let storageError: string | undefined;
  let requests = 0;
  let closing = false;
  let lastUse = Date.now();
  function canClose(requestAllowance = 0) {
    return requests === requestAllowance &&
      !jobs.size && !active.size && !locusActive.size && !locusWaiting.size &&
      !exports.size && !grants.size && !candidates.size &&
      ![...live.values()].some(snapshot => snapshot.result.retention.state !== "retained");
  }
  function releaseCaptureSlot(id: string) {
    active.delete(id);
    working.delete(id);
    if (assemblyJob === id) assemblyJob = undefined;
  }
  const changed = () => {
    if (disposed) return;
    lastUse = Date.now();
    channel.postMessage({ changed: true });
  };
  const summary = (result: CaptureResult) => {
    const transfer = locusTransfers.get(result.id);
    const value = {
        ...summarizeResult(result),
        ...(transfer
          ? { locus: { state: transfer.state, message: transfer.message } }
          : {}),
        progress: captureProgress(result, transfers.get(result.id)),
      },
      position = waiting.indexOf(result.id);
    return position < 0 ? value : { ...value, queuePosition: position + 1 };
  };
  async function saveTransfer(transfer: LocusTransfer) {
    if (disposed) throw new Error("Locus execution owner ended");
    await database.saveLocusTransfer(transfer);
    locusTransfers.set(transfer.resultId, transfer);
    changed();
  }
  async function sendToLocus(snapshot: Snapshot) {
    const id = snapshot.result.id;
    if (locusActive.has(id) || locusWaiting.has(id)) return;
    const controller = new AbortController();
    try {
      const granted = await new Promise<boolean>((start) => {
        locusWaiting.set(id, { controller, start });
        controller.signal.addEventListener("abort", () => {
          if (locusWaiting.delete(id)) start(false);
        }, { once: true });
        pumpLocus();
      });
      if (!granted || disposed || controller.signal.aborted) return;
      const transfer =
        locusTransfers.get(id) ?? newTransfer(id, snapshot.result.revision);
      await transferToLocus(
        snapshot,
        structuredClone(transfer),
        await database.locusConnection(),
        saveTransfer,
        { signal: controller.signal },
      );
    } catch (error) {
      if (!(error instanceof ClearedError) && !disposed)
        storageError = errorMessage(error);
    } finally {
      locusActive.delete(id);
      changed();
      pumpLocus();
      if (!jobs.has(id)) pump();
    }
  }
  function pumpLocus() {
    if (disposed || closing) return;
    for (const [id, job] of locusWaiting) {
      if (locusActive.size >= 2) break;
      locusWaiting.delete(id);
      locusActive.set(id, job.controller);
      job.start(true);
    }
  }
  const liveBytes = () =>
    [...live.values()].reduce(
      (total, item) =>
        total +
        Object.values(item.blobs).reduce((sum, blob) => sum + blob.size, 0),
      0,
    );
  const removeWaiting = (id: string) => {
    const index = waiting.indexOf(id);
    if (index >= 0) waiting.splice(index, 1);
  };
  function pump() {
    if (disposed || closing) return;
    while (active.size < 2 && waiting.length) {
      const id = waiting[0]!;
      if (clearing.has(id)) return;
      const job = jobs.get(id),
        snapshot = live.get(id);
      if (!job || !snapshot) {
        waiting.shift();
        continue;
      }
      const pendingAssets = snapshot.result.assets.filter(
        (asset) => asset.acquisition.state === "pending",
      );
      const outputBudget = bilibiliOutputBudget(
        job.candidate,
        pendingAssets.map(asset => asset.id),
      );
      if (
        liveBytes() + outputBudget > 512 * 1048576 &&
        (locusActive.size || locusWaiting.size)
      ) return;
      if (
        liveBytes() >= 512 * 1048576 &&
        availability(snapshot.result).pending
      ) {
        if (!active.size && !locusActive.size && !locusWaiting.size) {
          const blocked = waiting
            .splice(0)
            .map((id) => jobs.get(id))
            .filter((job): job is Job => !!job);
          for (const job of blocked) {
            job.controller.abort();
            void abandon(
              job,
              "Capture could not start within the 512 MiB owner memory limit. Export any needed content, then clear unsaved results before starting a new capture.",
            );
          }
        }
        return;
      }
      const site = sourceSelection(job.candidate.sourceUrl).site;
      if (site === "bilibili" && assemblyJob) return;
      // Reserve working buffers as well as live retained/unsaved Blobs. Bilibili
      // includes input copies, mux writes, output copies and verification reads;
      // the single assembly lease prevents simultaneous large working sets.
      const pending = pendingAssets.length;
      const reserve =
        (site === "bilibili" ? 1024 : 256 * Math.min(2, pending)) * 1048576;
      if (
        liveBytes() +
          [...working.values()].reduce((a, b) => a + b, 0) +
          reserve >
        1536 * 1048576
      ) {
        if (active.size) return;
        waiting.shift();
        job.controller.abort();
        void abandon(
          job,
          "Capture working-memory budget unavailable. Export and clear unsaved content before a fresh capture.",
        );
        continue;
      }
      working.set(id, reserve);
      if (site === "bilibili") assemblyJob = id;
      waiting.shift();
      active.set(id, job.controller);
      changed();
      void capture(job);
    }
  }
  async function abandon(job: Job, reason: string) {
    try {
      await job.initial;
      const snapshot = live.get(job.id);
      if (disposed || !snapshot) return;
      for (const part of [
        ...snapshot.result.records,
        ...snapshot.result.assets,
      ])
        if (part.acquisition.state === "pending")
          part.acquisition = { state: "unavailable", reason };
      snapshot.result.revision++;
      await retain(snapshot);
      const transfer = locusTransfers.get(job.id);
      if (transfer)
        await saveTransfer({ ...transfer, state: "failed", message: reason });
      if (snapshot.result.retention.state === "retained") live.delete(job.id);
    } catch (error) {
      if (!(error instanceof ClearedError)) storageError = errorMessage(error);
    } finally {
      jobs.delete(job.id);
      changed();
      pump();
    }
  }
  async function retain(snapshot: Snapshot) {
    snapshot.result.retention = {
      state: "pending",
      revision: snapshot.result.retention.revision,
    };
    changed();
    try {
      const committed = await database.commit(snapshot);
      snapshot.result.retention = committed.retention;
      storageError = undefined;
    } catch (error) {
      if (error instanceof ClearedError) {
        live.delete(snapshot.result.id);
        throw error;
      }
      const reason = diagnosticError(
        "RESULT_STORAGE_FAILED",
        "indexeddb.commit",
        errorMessage(error),
        {
          resultId: snapshot.result.id,
          revision: snapshot.result.revision,
          committedRevision: snapshot.result.retention.revision,
          blobBytes: Object.values(snapshot.blobs).reduce(
            (sum, blob) => sum + blob.size,
            0,
          ),
        },
        error,
      ).message;
      snapshot.result.retention = {
        state: "failed",
        revision: snapshot.result.retention.revision,
        reason,
      };
      storageError = reason;
    }
    changed();
  }
  // This runs only on a newly created execution document. A worker waking while
  // this document survives does not rerun recovery or interrupt active producers.
  let recoveryNeeded = true;
  let recovery: Promise<void> | undefined;
  function recover(): Promise<void> {
    if (recovery) return recovery;
    if (!recoveryNeeded) return Promise.resolve();
    recovery = (async () => {
      recoveryNeeded = false;
      try {
        for (const transfer of await database.locusTransfers()) {
          if (
            transferActive(transfer) &&
            !jobs.has(transfer.resultId) &&
            !locusActive.has(transfer.resultId)
          ) {
            transfer.state = "unverified";
            transfer.message =
              "The extension restarted during this save. Check and continue the original request; nothing was replayed";
            await database.saveLocusTransfer(transfer);
          }
          locusTransfers.set(transfer.resultId, transfer);
        }
        for (const result of await database.list())
          if (
            availability(result).pending &&
            !active.has(result.id) &&
            !live.has(result.id)
          ) {
            try {
              const snapshot = await database.read(result.id);
              if (snapshot) {
                snapshot.result = interrupt(result);
                live.set(result.id, snapshot);
                await retain(snapshot);
                if (snapshot.result.retention.state === "retained")
                  live.delete(result.id);
              }
            } catch (error) {
              recoveryNeeded = true;
              storageError = `Recovery read failed: ${errorMessage(error)}`;
            }
          }
      } catch (error) {
        recoveryNeeded = true;
        storageError = `Recovery read failed: ${errorMessage(error)}`;
      }
    })().finally(() => {
      recovery = undefined;
    });
    return recovery;
  }
  void recover();
  async function read(id: string): Promise<Snapshot | null> {
    const snapshot = live.get(id);
    if (snapshot) return structuredClone(snapshot);
    return database.read(id);
  }
  async function deliveryList() {
    const saved = await database.deliveries().catch((error) => {
      storageError = errorMessage(error);
      return [] as Delivery[];
    });
    return [
      ...new Map(
        [
          ...saved,
          ...terminalReports.values(),
          ...[...exports.values()].map((item) => item.delivery),
        ].map((row) => [row.id, row]),
      ).values(),
    ];
  }
  function mediaLease(jobId: string): MediaLease {
    return async (url, role, cid) => {
      const token = crypto.randomUUID();
      leases.set(token, jobId);
      try {
        await coordinator("cdn-acquire", { token, jobId, url, role, cid });
      } catch (error) {
        leases.delete(token);
        throw error;
      }
      return async () => {
        try {
          await coordinator("cdn-release", { token });
        } finally {
          leases.delete(token);
        }
      };
    };
  }
  async function capture(job: Job) {
    const { id, candidate, controller } = job;
    const site = sourceSelection(candidate.sourceUrl).site;
    const snapshot = live.get(id)!;
    try {
      await job.initial;
      if (disposed) return;
      if (!live.has(id)) throw new ClearedError();
      if (controller.signal.aborted)
        throw new Error("Site access removed or capture cleared");
      await coordinator("access", { site });
      if (controller.signal.aborted || !live.has(id))
        throw new Error("Site access removed or capture cleared");
      let size = 0;
      const progressByAsset = new Map<string, AcquisitionProgress>();
      transfers.set(id, progressByAsset);
      // Downloads overlap; publication remains serialized so each committed
      // revision contains exactly its acquired bytes, including on disk failure.
      let publication = Promise.resolve();
      const acquire = async (asset: CaptureResult["assets"][number]) => {
        let acquired: Blob | undefined;
        let failure: unknown;
        try {
          if (controller.signal.aborted)
            throw new Error("Site access removed or capture cleared");
          await coordinator("access", { site });
          if (controller.signal.aborted || !live.has(id))
            throw new Error("Site access removed or capture cleared");

          const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(site === "bilibili" ? 120_000 : 180_000),
          ]);
          progressByAsset.set(asset.id, { receivedBytes: 0, totalBytes: null });
          const progress = (value: AcquisitionProgress) => {
            if (!disposed && !controller.signal.aborted && live.has(id))
              progressByAsset.set(asset.id, value);
          };
          acquired = await acquireCaptureAsset(
            candidate,
            asset.id,
            signal,
            mediaLease(id),
            progress,
          );
          await coordinator("access", { site });
          if (disposed) return;
          if (controller.signal.aborted || !live.has(id))
            throw new Error("Site access removed or capture cleared");
        } catch (error) {
          failure = error;
          acquired = undefined;
        }
        const committed = publication.then(async () => {
          if (disposed) return;
          if (!live.has(id)) throw new ClearedError();
          try {
            if (controller.signal.aborted)
              throw new Error("Site access removed or capture cleared");
            if (!acquired) throw failure;
            if (size + acquired.size > 512 * 1048576)
              throw new Error("Capture exceeds the 512 MiB capability limit");
            if (liveBytes() + acquired.size > 512 * 1048576)
              throw new Error(
                "Live capture content exceeds the 512 MiB owner memory limit. Finish or clear unsaved content before another capture.",
              );
            size += acquired.size;
            snapshot.blobs[asset.id] = acquired;
            asset.mime = acquired.type;
            asset.size = acquired.size;
            asset.acquisition = { state: "acquired" };
          } catch (error) {
            asset.acquisition = {
              state: "unavailable",
              reason: diagnosticError(
                "CAPTURE_ASSET_FAILED",
                "capture.acquire",
                "Selected asset could not be acquired",
                {
                  resultId: id,
                  site,
                  sourceUrl: candidate.sourceUrl,
                  assetId: asset.id,
                  aborted: controller.signal.aborted,
                },
                error,
              ).message,
            };
          }
          progressByAsset.delete(asset.id);
          snapshot.result.revision++;
          await retain(snapshot);
          if (site === "twitter") {
            const pending = snapshot.result.assets.filter(
              (asset) => asset.acquisition.state === "pending",
            ).length;
            working.set(id, 256 * Math.min(2, pending) * 1048576);
            pump();
          }
        });
        publication = committed.catch(() => {});
        await committed;
      };
      let next = 0;
      const assets = snapshot.result.assets.filter(
        (asset) => asset.acquisition.state === "pending",
      );
      const worker = async () => {
        while (!disposed && live.has(id) && next < assets.length)
          await acquire(assets[next++]!);
      };
      const workers = await Promise.allSettled([worker(), worker()]);
      for (const result of workers)
        if (result.status === "rejected") throw result.reason;
      transfers.delete(id);
      // Saving has its own bounded queue. Retained/live bytes stay owned until
      // it ends, but acquisition buffers and the Bilibili assembly lease do not.
      releaseCaptureSlot(id);
      changed();
      pump();
      if (!disposed && !controller.signal.aborted && live.has(id))
        await sendToLocus(snapshot);
    } catch (error) {
      if (!disposed && !(error instanceof ClearedError)) {
        for (const asset of snapshot.result.assets)
          if (asset.acquisition.state === "pending")
            asset.acquisition = {
              state: "unavailable",
              reason: errorMessage(error),
            };
        snapshot.result.revision++;
        await retain(snapshot).catch(() => {});
      }
    } finally {
      const transfer = locusTransfers.get(id);
      if (!disposed && transfer?.state === "waiting")
        await saveTransfer({
          ...transfer,
          state: "failed",
          message: "Capture did not complete. Nothing was sent to Locus",
        }).catch(() => {});
      releaseCaptureSlot(id);
      transfers.delete(id);
      jobs.delete(id);
      if (snapshot.result.retention.state === "retained") live.delete(id);
      changed();
      pump();
    }
  }
  async function packageExport(snapshot: Snapshot, delivery: Delivery) {
    const backing = { delivery } as { delivery: Delivery; url?: string };
    exports.set(delivery.id, backing);
    changed();
    try {
      await database.saveDelivery(delivery).catch(() => {});
      const archive = await createArchive(snapshot);
      backing.url = URL.createObjectURL(archive.blob);
      delivery.url = backing.url;
      delivery.partial = archive.partial;
      delivery.state = "starting";
      await database.saveDelivery(delivery).catch(() => {});
      await coordinator("native-download", { delivery });
    } catch (error) {
      // A lost coordinator response may follow a successful native initiation.
      // Keep its backing until browser reconciliation establishes consumption.
      const saved = (await database.deliveries().catch(() => [])).find(
        (row) => row.id === delivery.id,
      );
      const confirmed = [backing.delivery, saved].find(
        (row) =>
          row && isTerminalDelivery(row.state),
      );
      if (confirmed) {
        if (backing.url) URL.revokeObjectURL(backing.url);
        exports.delete(delivery.id);
      } else {
        const current = saved ?? backing.delivery;
        current.state = backing.url ? "unverified" : "failed";
        current.reason = errorMessage(error);
        backing.delivery = current;
        await database.saveDelivery(current).catch(() => {});
        if (!backing.url) {
          terminalReports.set(current.id, current);
          exports.delete(delivery.id);
        }
      }
      changed();
    }
  }
  async function consume(operation: string, id?: string) {
    if (operation === "list") {
      let stored: CaptureResult[] = [];
      try {
        stored = await database.list();
        storageError = undefined;
      } catch (error) {
        storageError = errorMessage(error);
      }
      const items = [
        ...new Map(
          [...stored, ...[...live.values()].map((v) => v.result)].map((r) => [
            r.id,
            r,
          ]),
        ).values(),
      ]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(summary);
      return { items, deliveries: await deliveryList(), storageError };
    }
    if (!id) throw new Error("Result reference required");
    if (operation === "read")
      return {
        snapshot: await read(id),
        deliveries: (await deliveryList()).filter((d) => d.resultId === id),
        locus: locusTransfers.get(id),
      };
    if (operation === "locus-continue") {
      if (jobs.has(id) || locusActive.has(id) || locusWaiting.has(id)) return true;
      if (!locusTransfers.has(id))
        throw new Error(
          "No existing Locus save for this capture. Start a new capture explicitly",
        );
      const snapshot = await read(id);
      if (!snapshot || !["twitter", "bilibili"].includes(snapshot.result.site))
        throw new Error("Supported capture required");
      void sendToLocus(snapshot);
      return true;
    }
    if (operation === "clear") {
      clearing.add(id);
      try {
        await database.clear(id);
        live.delete(id);
        locusActive.get(id)?.abort();
        locusWaiting.get(id)?.controller.abort();
        locusTransfers.delete(id);
        jobs.get(id)?.controller.abort();
        removeWaiting(id);
        if (!active.has(id) && !locusActive.has(id)) jobs.delete(id);
        changed();
        return true;
      } finally {
        clearing.delete(id);
        pump();
      }
    }
    if (operation === "export") {
      if (
        [...exports.values()].filter(
          (e) =>
            !isTerminalDelivery(e.delivery.state),
        ).length >= 2
      )
        throw new Error(
          "Two exports are already awaiting delivery; finish them before exporting again",
        );
      const snapshot = await read(id);
      if (!snapshot) throw new Error("Result no longer exists");
      const state = availability(snapshot.result);
      if (!state.acquired)
        throw new Error("No acquired content is available to export yet");
      const delivery: Delivery = {
        id: crypto.randomUUID(),
        resultId: id,
        revision: snapshot.result.revision,
        createdAt: new Date().toISOString(),
        state: "packaging",
        partial: !state.complete,
      };
      void packageExport(snapshot, delivery);
      return delivery.id;
    }
    throw new Error("Unsupported consumer operation");
  }
  channel.onmessage = (event) => {
    const token = event.data?.requestId;
    const grant = typeof token === "string" ? grants.get(token) : undefined;
    if (!grant) return;
    grants.delete(token);
    requests++;
    void (async () => {
      try {
        if (grant.expiresAt < Date.now())
          throw new Error("Read authorization expired; retry");
        await recover();
        channel.postMessage({
          requestId: token,
          ok: true,
          value: await consume(grant.operation, grant.id),
        });
      } catch (error) {
        channel.postMessage({
          requestId: token,
          ok: false,
          error: diagnosticError(
            "RESULT_OPERATION_FAILED",
            `result.${grant.operation}`,
            errorMessage(error).split("\n")[0]!,
            { resultId: grant.id ?? null },
            error,
          ).message,
        });
      } finally {
        requests--;
        lastUse = Date.now();
      }
    })();
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      message?.target !== "offscreen" ||
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      (sender.url && sender.url !== chrome.runtime.getURL("background.js"))
    )
      return;
    const passive =
      message.op === "lease-live" ||
      message.op === "source-status" ||
      message.op === "live-status" ||
      message.op === "capture-tasks";
    requests++;
    void (async () => {
      try {
        if (closing) throw new Error("Execution owner is closing; retry");
        if (!passive) await recover();
        let value: unknown;
        switch (message.op) {
          case "hello":
            value = { active: [...active.keys()] };
            break;
          case "lease-live":
            value =
              leases.get(message.token) === message.jobId &&
              active.has(message.jobId) &&
              !active.get(message.jobId)?.signal.aborted;
            break;
          case "export-state":
            value = exports.get(message.id)?.delivery ?? null;
            break;
          case "grant":
            grants.set(message.token, {
              operation: message.operation,
              id: message.id,
              expiresAt: Date.now() + 30_000,
            });
            value = true;
            break;
          case "inspect": {
            for (const [token, entry] of candidates)
              if (entry.expiresAt < Date.now()) candidates.delete(token);
            if (candidates.size + inspections >= 30)
              throw new Error(
                "Too many inspections; wait for an existing inspection to expire",
              );
            const site: CaptureSite = message.site ?? "twitter";
            const epoch = accessEpoch[site];
            inspections++;
            try {
              const deadline = Date.now() + 40_000;
              const candidate = await loadCaptureCandidate(
                site,
                message.url,
                deadline,
              );
              await coordinator("access", { site });
              if (epoch !== accessEpoch[site])
                throw new Error(
                  "Site access was removed during inspection. Inspect again after enabling access.",
                );
              const token = crypto.randomUUID();
              const expiresAt = Date.now() + 5 * 60_000;
              candidates.set(token, {
                owner: message.owner,
                expiresAt,
                candidate,
              });
              value = {
                token,
                expiresAt,
                sourceUrl: candidate.sourceUrl,
                label: candidate.label,
                textPreview: candidate.text?.slice(0, 1000) ?? null,
                textFailure: candidate.textFailure,
                media: candidate.media.map(
                  ({ id, kind, sourceId, previewUrl, reason, quality }) => ({
                    id,
                    kind,
                    sourceId,
                    previewUrl,
                    reason,
                    quality,
                  }),
                ),
              } satisfies Inspection;
            } finally {
              inspections--;
            }
            break;
          }
          case "capture": {
            const site: CaptureSite = message.site ?? "twitter";
            const epoch = accessEpoch[site];
            await coordinator("access", { site });
            if (epoch !== accessEpoch[site])
              throw new Error(
                "Site access was removed before queue acceptance",
              );
            const entry = candidates.get(message.token);
            if (
              !entry ||
              sourceSelection(entry.candidate.sourceUrl).site !== site ||
              entry.owner !== message.owner ||
              entry.expiresAt < Date.now()
            )
              throw new Error(
                "Inspection expired or belongs to another document. Inspect this source again.",
              );
            if (waiting.length >= 20 || jobs.size >= 22)
              throw new Error(
                "Capture queue is full. Wait for a capture or save to finish, then try again.",
              );
            if (liveBytes() >= 512 * 1048576)
              throw new Error(
                "Live capture content uses the 512 MiB owner memory limit. Finish or clear an existing capture first.",
              );
            const id = crypto.randomUUID();
            const result = selectCaptureCandidate(
              entry.candidate,
              message.selected,
              id,
            );
            candidates.delete(message.token);
            await saveTransfer(newTransfer(id, result.revision));
            const snapshot = { result, blobs: {}, readErrors: {} };
            live.set(id, snapshot);
            const job: Job = {
              id,
              candidate: structuredClone(entry.candidate),
              controller: new AbortController(),
              initial: Promise.resolve(),
            };
            jobs.set(id, job);
            waiting.push(id);
            job.initial = retain(snapshot);
            void job.initial.catch(() => {});
            pump();
            await job.initial;
            value = summary(snapshot.result);
            break;
          }
          case "status": {
            const snapshot = await read(message.id);
            value = snapshot ? summary(snapshot.result) : null;
            break;
          }
          case "live-status": {
            const snapshot = live.get(message.id);
            value = snapshot ? summary(snapshot.result) : null;
            break;
          }
          case "source-status": {
            value = sourceSummaries(
              [...live.values()].map((item) => item.result),
              message.sourceIds,
              message.site ?? "twitter",
            ).map((row) => ({
              ...row,
              summary: row.summary
                ? summary(live.get(row.summary.id)!.result)
                : null,
            }));
            break;
          }
          case "capture-tasks":
            value = [...jobs.keys()]
              .filter(
                (id) =>
                  (!message.site ||
                    sourceSelection(jobs.get(id)!.candidate.sourceUrl).site ===
                      message.site) &&
                  (active.has(id) ||
                    waiting.includes(id) ||
                    locusActive.has(id) ||
                    locusWaiting.has(id)),
              )
              .map((id) => live.get(id))
              .filter((snapshot): snapshot is Snapshot => !!snapshot)
              .map((snapshot) => summary(snapshot.result));
            break;
          case "revoke": {
            const site: CaptureSite = message.site ?? "twitter";
            accessEpoch[site]++;
            for (const job of jobs.values())
              if (sourceSelection(job.candidate.sourceUrl).site === site)
                job.controller.abort();
            for (const [token, entry] of candidates)
              if (sourceSelection(entry.candidate.sourceUrl).site === site)
                candidates.delete(token);
            const queued = waiting
              .filter(
                (id) =>
                  sourceSelection(jobs.get(id)!.candidate.sourceUrl).site ===
                  site,
              )
              .map((id) => jobs.get(id)!)
              .filter(Boolean);
            for (const job of queued) removeWaiting(job.id);
            await Promise.all(
              queued.map((job) =>
                abandon(
                  job,
                  "Interrupted: Source access was removed before this queued capture started. Start a new capture explicitly.",
                ),
              ),
            );
            value = true;
            break;
          }
          case "delivery": {
            const delivery = message.delivery as Delivery;
            const backing = exports.get(delivery.id);
            if (backing) {
              backing.delivery = delivery;
              if (isTerminalDelivery(delivery.state)) {
                if (backing.url) URL.revokeObjectURL(backing.url);
                terminalReports.set(delivery.id, delivery);
                exports.delete(delivery.id);
              }
            }
            changed();
            value = true;
            break;
          }
          case "prepare-close": {
            value = canClose(1);
            if (value) closing = true;
            break;
          }
          default:
            throw new Error("Unsupported execution command");
        }
        respond({ ok: true, value });
      } catch (error) {
        respond({
          ok: false,
          error: diagnosticError(
            "OWNER_COMMAND_FAILED",
            `offscreen.${typeof message?.op === "string" ? message.op : "unknown"}`,
            errorMessage(error).split("\n")[0]!,
            {
              sourceUrl: typeof message?.url === "string" ? message.url : null,
              resultId: typeof message?.id === "string" ? message.id : null,
            },
            error,
          ).message,
        });
      } finally {
        requests--;
        if (!passive) lastUse = Date.now();
      }
    })();
    return true;
  });
  const idleTimer = setInterval(() => {
    for (const [token, grant] of grants)
      if (grant.expiresAt < Date.now()) grants.delete(token);
    for (const [token, candidate] of candidates)
      if (candidate.expiresAt < Date.now()) candidates.delete(token);
    if (
      Date.now() - lastUse > 60_000 &&
      canClose()
    )
      void coordinator("idle").catch(() => {});
  }, 15_000);
  return () => {
    disposed = true;
    clearInterval(idleTimer);
    channel.close();
    for (const job of jobs.values()) job.controller.abort();
    for (const controller of locusActive.values()) controller.abort();
    for (const job of locusWaiting.values()) job.controller.abort();
    void database.close();
  };
}
