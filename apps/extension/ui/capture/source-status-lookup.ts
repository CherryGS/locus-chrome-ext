import { errorMessage } from "@locus/capture-core/model";
import { coordinator, type SourceStatus } from "@/host/chrome/protocol";

interface LookupOptions {
  urls: () => string[];
  enabled: () => boolean;
  receive: (urls: string[], values?: SourceStatus[], error?: string) => void;
  request?: (urls: string[]) => Promise<SourceStatus[]>;
}

/** Coalesce page scans without reading files or overlapping status requests. */
export function createSourceStatusLookup({
  urls,
  enabled,
  receive,
  request = (urls) => coordinator<SourceStatus[]>("source-status", { urls }),
}: LookupOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let queued = false;
  let stopped = false;
  let generation = 0;
  const active = () => !stopped && enabled();

  function schedule() {
    if (!active() || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, 200);
  }

  async function refresh() {
    if (!active()) return;
    if (busy) {
      queued = true;
      return;
    }
    const targets = [...new Set(urls())];
    if (!targets.length) return;
    busy = true;
    const epoch = generation;
    try {
      for (
        let offset = 0;
        offset < targets.length && active() && epoch === generation;
        offset += 50
      ) {
        const batch = targets.slice(offset, offset + 50);
        try {
          const values = await request(batch);
          if (active() && epoch === generation) receive(batch, values);
        } catch (error) {
          if (active() && epoch === generation)
            receive(batch, undefined, errorMessage(error));
        }
      }
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  }

  function cancel() {
    ++generation;
    clearTimeout(timer);
    timer = undefined;
    queued = false;
  }

  return {
    schedule,
    refresh,
    cancel,
    stop() {
      stopped = true;
      cancel();
    },
  };
}
