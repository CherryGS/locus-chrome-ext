import type { ResultSummary } from "@/host/chrome/protocol";
import type { Delivery } from "@locus/capture-core/model";

export type LibraryView = "all" | "progress" | "saved" | "inbox";
export const viewLabels: Record<LibraryView, string> = {
  all: "All captures",
  progress: "In progress",
  saved: "Saved",
  inbox: "Inbox",
};
export function resultView(item: ResultSummary): Exclude<LibraryView, "all"> {
  // Local attention takes precedence even when the receiver confirmed its save.
  if (item.unresolvedReason || item.retention.state === "failed")
    return "inbox";
  if (item.queuePosition !== undefined) return "progress";
  if (["partial", "unavailable"].includes(item.acquisition)) return "inbox";
  if (
    item.locus?.state === "failed" ||
    item.locus?.state === "unverified" ||
    item.locus?.state === "configuration-required"
  )
    return "inbox";
  if (item.acquisition === "pending" || item.retention.state === "pending")
    return "progress";
  if (
    item.acquisition !== "complete" ||
    item.retention.revision !== item.revision
  )
    return "inbox";
  if (item.locus?.state === "complete") return "saved";
  return item.locus ? "progress" : "inbox";
}
export function resultHint(item: ResultSummary): string {
  if (item.unresolvedReason) return "Read problem · retry reads";
  if (item.retention.state === "failed")
    return item.locus?.state === "complete"
      ? "Saved to Locus · local copy not retained"
      : "Local copy not retained · inspect available content";
  if (item.queuePosition !== undefined)
    return `Waiting · position ${item.queuePosition}`;
  if (["partial", "unavailable"].includes(item.acquisition))
    return "Selected content missing · inspect available portions";
  if (item.locus?.state === "unverified")
    return "Save unverified · check the original save";
  if (item.locus?.state === "failed") return "Save failed · review next steps";
  if (item.locus?.state === "configuration-required")
    return "Configure Locus to continue this save";
  if (resultView(item) === "saved")
    return "Confirmed in Locus · local copy retained";
  if (resultView(item) === "progress")
    return item.locus
      ? "Capture and Locus save in progress"
      : "Capture in progress";
  return item.retention.revision !== item.revision
    ? "Current revision not retained · retry reads"
    : "Locally staged · available for export";
}
export function acquisitionLabel(state: string) {
  return (
    (
      {
        complete: "Complete",
        pending: "In progress",
        partial: "Partial capture",
        unavailable: "Unavailable",
        acquired: "Acquired",
      } as Record<string, string>
    )[state] ?? state
  );
}
export function retentionLabel(state: string) {
  return (
    (
      {
        retained: "Saved locally",
        pending: "Saving…",
        failed: "Not saved",
      } as Record<string, string>
    )[state] ?? state
  );
}
export const deliveryLabels: Record<Delivery["state"], string> = {
  packaging: "Preparing archive",
  starting: "Starting download",
  in_progress: "Downloading",
  complete: "Download complete",
  interrupted: "Download interrupted",
  failed: "Export failed",
  unverified: "Download not verified",
};
export function sourceName(url: string) {
  try {
    const host = new URL(url).hostname;
    return ["x.com", "twitter.com"].includes(host)
      ? "Twitter / X"
      : host === "www.bilibili.com"
        ? "Bilibili"
        : host;
  } catch {
    return "Source";
  }
}
export function safeSource(url: string) {
  try {
    return ["https:", "http:"].includes(new URL(url).protocol)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
export function exactTime(date: string) {
  const value = new Date(date);
  return Number.isNaN(value.getTime())
    ? "Time unknown"
    : value.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}
export function recentTime(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(ms) || ms < 0) return exactTime(date);
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(date).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
export function fileSize(bytes?: number) {
  if (bytes === undefined) return "Size unknown";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
