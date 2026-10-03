import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorMessage,
  type Snapshot,
  type Delivery,
} from "@locus/capture-core/model";
import {
  CHANNEL,
  coordinator,
  ownerRequest,
  type Collection,
  type ReadResponse,
} from "@/host/chrome/protocol";
import type { CaptureSite } from "@/host/chrome/sites";
import { useSiteAccess } from "./useSiteAccess";
import type { LocusTransfer } from "@/host/locus/model";
import { createFeedbackObserver, type ResultFeedback } from "./feedback";
import { createRefreshGate } from "./refresh-gate";

export interface ClearTarget {
  id: string;
  label: string;
}

export function useResultsState(
  onFeedback: (feedback: ResultFeedback) => void,
) {
  const [collection, setCollection] = useState<Collection>();
  const [collectionError, setCollectionError] = useState("");
  const [selected, setSelected] = useState(location.hash.slice(1));
  const [snapshot, setSnapshot] = useState<Snapshot | null>();
  const [readError, setReadError] = useState("");
  const [delivery, setDelivery] = useState<Delivery[]>([]);
  const [locus, setLocus] = useState<LocusTransfer>();
  const siteAccess = useSiteAccess();
  const feedback = useRef(onFeedback);
  feedback.current = onFeedback;
  const [observeFeedback] = useState(createFeedbackObserver);
  const [readConcerns, setReadConcerns] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const operation = useRef(false);
  const setNotice = useCallback((message: string) => {
    if (message) feedback.current({ title: message });
  }, []);
  const [busy, setBusy] = useState("");
  const [clearTarget, setClearTarget] = useState<ClearTarget>();
  const [clearError, setClearError] = useState("");
  const lastRevision = useRef("");
  const readGeneration = useRef(0);
  const [refreshGate] = useState(createRefreshGate);
  const currentId = useRef(selected);
  currentId.current = selected;
  const refresh = useCallback(async function refreshNow(
    force = false,
  ): Promise<void> {
    const ticket = refreshGate.start(currentId.current, force);
    if (!ticket) return;
    const generation = ++readGeneration.current;
    try {
      const value = await ownerRequest<Collection>("list");
      if (generation !== readGeneration.current) return;
      setCollection(value);
      setCollectionError(value.storageError ?? "");
      observeFeedback(value).forEach(feedback.current);
      const id = currentId.current;
      setDelivery(value.deliveries.filter((d) => d.resultId === id));
      if (id) {
        const row = value.items.find((item) => item.id === id);
        const revision = `${id}:${row?.revision}:${row?.retention.state}:${row?.locus?.state}:${row?.locus?.message}`;
        if (force || revision !== lastRevision.current) {
          try {
            const read = await ownerRequest<ReadResponse>("read", id);
            if (
              currentId.current !== id ||
              generation !== readGeneration.current
            )
              return;
            setSnapshot(read.snapshot);
            setDelivery(read.deliveries);
            setLocus(read.locus);
            setReadError("");
            setReadConcerns((previous) => {
              const next = { ...previous };
              const errors = Object.values(read.snapshot?.readErrors ?? {});
              if (errors.length)
                next[id] = "Some retained files could not be read.";
              else delete next[id];
              return next;
            });
            lastRevision.current = revision;
          } catch (error) {
            if (
              currentId.current === id &&
              generation === readGeneration.current
            ) {
              setReadError(errorMessage(error));
              setReadConcerns((previous) => ({
                ...previous,
                [id]: errorMessage(error),
              }));
            }
          }
        }
      }
    } catch (error) {
      if (generation === readGeneration.current)
        setCollectionError(errorMessage(error));
    } finally {
      if (refreshGate.finish(ticket)) void refreshNow(true);
    }
  }, []);
  useEffect(() => {
    const hash = () => {
      ++readGeneration.current;
      const id = location.hash.slice(1);
      currentId.current = id;
      setSelected(id);
      setSnapshot(undefined);
      setDelivery([]);
      setLocus(undefined);
      setReadError("");
      lastRevision.current = "";
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    void refresh(true);
  }, [selected, refresh]);
  useEffect(() => {
    void coordinator("reconcile").catch((error) =>
      setNotice(errorMessage(error)),
    );
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (event.data?.changed) void refresh();
    };
    const timer = setInterval(() => {
      void refresh();
    }, 4000);
    return () => {
      channel.close();
      clearInterval(timer);
    };
  }, [refresh]);
  async function enable(site: CaptureSite) {
    if (operation.current) return;
    operation.current = true;
    setBusy(site === "twitter" ? "enable" : "enable-bilibili");
    try {
      const granted = await siteAccess.enable(site);
      if (granted) {
        feedback.current({
          title: `${site === "twitter" ? "Twitter" : "Bilibili"} access enabled`,
          type: "success",
        });
      } else
        setNotice(
          "Site access was not granted. Local results remain available.",
        );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      operation.current = false;
      setBusy("");
    }
  }
  async function exportResult() {
    if (!snapshot || operation.current) return;
    const target = snapshot.result;
    operation.current = true;
    setBusy("export");
    setActionErrors((previous) => ({ ...previous, [target.id]: "" }));
    try {
      await ownerRequest("export", target.id);
      feedback.current({
        title: "Export accepted",
        description: `${target.label} · Chrome will confirm the download separately.`,
        resultId: target.id,
        type: "info",
      });
      await refresh(true);
    } catch (error) {
      const message = `Export failed: ${errorMessage(error)}`;
      setActionErrors((previous) => ({ ...previous, [target.id]: message }));
      feedback.current({
        title: "Export could not start",
        description: target.label,
        resultId: target.id,
        type: "error",
      });
    } finally {
      operation.current = false;
      setBusy("");
    }
  }
  async function clear() {
    if (!clearTarget || operation.current) return;
    const target = clearTarget;
    operation.current = true;
    setBusy("clear");
    setClearError("");
    try {
      await ownerRequest("clear", target.id);
      ++readGeneration.current;
      setClearTarget(undefined);
      feedback.current({
        title: "Local capture cleared",
        description: `${target.label} · Exported files and Locus entries remain.`,
        type: "success",
      });
      if (
        currentId.current === target.id &&
        location.hash.slice(1) === target.id
      ) {
        setSnapshot(null);
        setLocus(undefined);
        lastRevision.current = "";
        location.hash = "";
      }
      await refresh(true);
    } catch (error) {
      setClearError(`Clear failed: ${errorMessage(error)}`);
    } finally {
      operation.current = false;
      setBusy("");
    }
  }
  async function continueLocus() {
    if (!snapshot || !locus || operation.current) return;
    const target = snapshot.result;
    operation.current = true;
    setBusy("locus");
    setActionErrors((previous) => ({ ...previous, [target.id]: "" }));
    try {
      await ownerRequest("locus-continue", target.id);
      feedback.current({
        title: "Save check requested",
        description: target.label,
        resultId: target.id,
      });
      await refresh(true);
    } catch (error) {
      setActionErrors((previous) => ({
        ...previous,
        [target.id]: errorMessage(error),
      }));
      feedback.current({
        title: "Could not check the save",
        description: target.label,
        resultId: target.id,
        type: "error",
      });
    } finally {
      operation.current = false;
      setBusy("");
    }
  }
  function requestClear() {
    if (!snapshot || operation.current) return;
    setClearError("");
    setClearTarget({ id: snapshot.result.id, label: snapshot.result.label });
  }
  function cancelClear() {
    if (!operation.current) setClearTarget(undefined);
  }
  const visibleCollection = collection && {
    ...collection,
    items: collection.items.map((item) =>
      readConcerns[item.id]
        ? { ...item, unresolvedReason: readConcerns[item.id] }
        : item,
    ),
  };
  return {
    collection: visibleCollection,
    collectionError,
    selected,
    snapshot,
    readError,
    actionError: actionErrors[selected] ?? "",
    delivery,
    locus,
    continueLocus,
    access: siteAccess.access,
    setNotice,
    busy,
    clearTarget,
    requestClear,
    cancelClear,
    clearError,
    refresh,
    enable,
    exportResult,
    clear,
  };
}
