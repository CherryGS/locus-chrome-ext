import type { Collection } from "@/host/chrome/protocol";
import { deliveryLabels } from "./presentation";

export interface ResultFeedback {
  title: string;
  description?: string;
  resultId?: string;
  type?: "success" | "info" | "warning" | "error";
}

/** One observer per mounted workspace: hydration is history, later terminal changes are news. */
export function createFeedbackObserver() {
  let hydrated = false;
  const observed = new Map<string, string>();
  return (collection: Collection): ResultFeedback[] => {
    const notices: ResultFeedback[] = [];
    for (const item of collection.items) {
      const key = `locus:${item.id}`,
        state = item.locus?.state ?? "";
      if (
        hydrated &&
        observed.get(key) !== state &&
        ["complete", "failed", "unverified", "configuration-required"].includes(
          state,
        )
      ) {
        notices.push({
          resultId: item.id,
          title:
            state === "configuration-required"
              ? item.acquisition === "complete" &&
                item.retention.state === "retained" &&
                item.retention.revision === item.revision &&
                !item.unresolvedReason
                ? "Staged locally · configure Locus to continue"
                : "Locus setup required"
              : state === "complete"
                ? "Saved to Locus"
                : state === "failed"
                  ? "Locus save needs attention"
                  : "Locus save not verified",
          description: item.label,
          type:
            state === "configuration-required"
              ? "info"
              : state === "complete"
                ? "success"
                : "warning",
        });
      }
      observed.set(key, state);
      const captureKey = `capture:${item.id}`;
      const captureState =
        item.retention.state === "failed"
          ? "retention-failed"
          : item.unresolvedReason
            ? "unresolved"
            : item.acquisition;
      if (
        hydrated &&
        observed.get(captureKey) !== captureState &&
        ["retention-failed", "unresolved", "partial", "unavailable"].includes(
          captureState,
        ) &&
        !["failed", "unverified"].includes(state)
      ) {
        notices.push({
          resultId: item.id,
          title:
            captureState === "retention-failed"
              ? "Local copy not saved"
              : captureState === "unresolved"
                ? "Capture status unavailable"
                : "Capture incomplete",
          description: item.label,
          type: "warning",
        });
      }
      observed.set(captureKey, captureState);
    }
    for (const delivery of collection.deliveries) {
      const key = `export:${delivery.id}`;
      if (
        hydrated &&
        observed.get(key) !== delivery.state &&
        ["complete", "failed", "interrupted", "unverified"].includes(
          delivery.state,
        )
      ) {
        notices.push({
          resultId: delivery.resultId,
          title: deliveryLabels[delivery.state],
          description:
            collection.items.find((item) => item.id === delivery.resultId)
              ?.label ?? "Previously exported capture",
          type: delivery.state === "complete" ? "success" : "warning",
        });
      }
      observed.set(key, delivery.state);
    }
    hydrated = true;
    return notices;
  };
}
