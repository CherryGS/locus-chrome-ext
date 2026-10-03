import type { CaptureResult } from "@locus/capture-core/model";
import { CaptureStagingBadge } from "@/ui/shared/CaptureStatusBadge";
import type { CaptureState } from "@/ui/shared/capture-status";
import { sourceName } from "./presentation";

/** The list and inspector keep local staging beside the source, separate from delivery. */
export function CaptureSourceSummary({
  result,
  state,
}: {
  result: Pick<CaptureResult, "sourceUrl" | "retention" | "revision">;
  state: CaptureState;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-xs text-muted-foreground">
        {sourceName(result.sourceUrl)}
      </span>
      <CaptureStagingBadge result={result} state={state} />
    </div>
  );
}
