import {
  CheckIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  Clock3Icon,
  DownloadIcon,
  InboxIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CaptureResult } from "@locus/capture-core/model";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { captureStates, type CaptureState } from "./capture-status";

const icons = {
  "locus-saved": CheckIcon,
  uncaptured: DownloadIcon,
  checking: LoaderCircleIcon,
  importing: LoaderCircleIcon,
  queued: Clock3Icon,
  saving: LoaderCircleIcon,
  saved: InboxIcon,
  partial: TriangleAlertIcon,
  failed: CircleAlertIcon,
  unknown: CircleHelpIcon,
};

export function CaptureStatusIcon({ state }: { state: CaptureState }) {
  const Icon = icons[state];
  const pending =
    state === "checking" || state === "importing" || state === "saving";
  return (
    <Icon
      aria-hidden="true"
      data-icon="inline-start"
      className={cn(pending && "motion-safe:animate-spin")}
    />
  );
}

export function CaptureStatusBadge({ state }: { state: CaptureState }) {
  const { label, description, tone } = captureStates[state];
  return (
    <Badge
      variant={tone === "neutral" ? "outline" : tone}
      title={description}
      data-capture-state={state}
    >
      <CaptureStatusIcon state={state} />
      {label}
    </Badge>
  );
}

/** Retained bytes are a separate fact even when acquisition or delivery failed. */
export function CaptureStagingBadge({
  result,
  state,
}: {
  result: Pick<CaptureResult, "retention" | "revision">;
  state: CaptureState;
}) {
  if (
    result.retention.state !== "retained" ||
    result.retention.revision !== result.revision
  )
    return null;
  if (state === "saved") return <CaptureStatusBadge state={state} />;
  return (
    <Badge
      variant="outline"
      data-capture-retention="staged"
      title="Available content is retained in the extension. This does not imply complete acquisition or a successful Locus save."
    >
      <InboxIcon data-icon="inline-start" />
      Staged locally
    </Badge>
  );
}

/** One outcome plus the independent local-storage fact, across every surface. */
export function CaptureOutcomeBadges({
  state,
  result,
  showStaging = true,
}: {
  state: CaptureState;
  result: Pick<CaptureResult, "retention" | "revision">;
  showStaging?: boolean;
}) {
  const { retention, revision } = result;
  return (
    <>
      {(state !== "saved" || showStaging) && (
        <CaptureStatusBadge state={state} />
      )}
      {state !== "saved" &&
        (retention.state === "retained" && retention.revision === revision ? (
          showStaging && <CaptureStagingBadge result={result} state={state} />
        ) : (
          <Badge
            variant={
              retention.state === "failed"
                ? "destructive"
                : retention.state === "pending"
                  ? "info"
                  : "outline"
            }
          >
            {retention.state === "failed" ? <CircleAlertIcon aria-hidden="true" data-icon="inline-start" /> : retention.state === "pending" ? <Clock3Icon aria-hidden="true" data-icon="inline-start" /> : <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />}
            {retention.state === "retained"
              ? `Saved revision ${retention.revision}`
              : retention.state === "pending"
                ? "Saving locally…"
                : "Not saved locally"}
          </Badge>
        ))}
    </>
  );
}
