import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CaptureResult, Delivery } from "@locus/capture-core/model";
import type { LocusTransfer } from "@/host/locus/model";
import { LocusSaveDetails } from "./LocusSaveStatus";
import { Failure, Pending } from "./ResultNotice";
import { deliveryLabels } from "./presentation";

/** Recovery stays beside the affected capture while diagnostics remain expandable. */
export function CaptureOutcomeDetails({
  result,
  locus,
  readError,
  actionError,
  latest,
  busy,
  canContinue,
  onContinue,
  onSettings,
  onRetry,
}: {
  result: CaptureResult;
  locus?: LocusTransfer;
  readError: string;
  actionError: string;
  latest?: Delivery;
  busy: boolean;
  canContinue: boolean;
  onContinue: () => void;
  onSettings: () => void;
  onRetry: () => void;
}) {
  const deliveryConcern =
    latest &&
    (["failed", "interrupted", "unverified"].includes(latest.state) ||
      !!latest.reason);
  return (
    <section aria-label="Operation details" className="flex flex-col gap-3">
      <h3 className="sr-only">Locus & operation details</h3>
      <LocusSaveDetails
        transfer={locus}
        busy={busy}
        canContinue={canContinue}
        onContinue={onContinue}
        onSettings={onSettings}
      />
      {!locus && (
        <p className="text-sm text-muted-foreground">
          This capture has no Locus save attempt. Available local content can be
          inspected and exported.
        </p>
      )}
      {readError && (
        <div className="flex flex-col items-start gap-2">
          <Failure
            title="Could not load capture"
            message={`${readError}. The preview may be outdated. Select Retry loading to try again.`}
          />
          <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>Retry loading</Button>
        </div>
      )}
      {actionError && (
        <Failure title="Action could not finish" message={actionError} />
      )}
      {result.retention.state === "failed" && (
        <Failure
          title="Local copy not saved"
          message={`${result.retention.reason ?? "Local saving failed"}. Only previously saved content can be recovered after restarting Chrome. Available content can still be exported.`}
        />
      )}
      {result.retention.state === "pending" && (
        <Pending
          title="Saving local copy"
          message={`${result.retention.reason ?? "Local saving is in progress"}. Only previously saved content can be recovered after restarting Chrome. Available content can still be exported.`}
        />
      )}
      {deliveryConcern && (
        <Alert
          variant={
            latest.state === "failed" || latest.state === "interrupted"
              ? "destructive"
              : "default"
          }
        >
          <AlertTitle>{deliveryLabels[latest.state]}</AlertTitle>
          <AlertDescription>
            {latest.reason ??
              "Check Chrome downloads for the actual delivery outcome. Your captured content remains available."}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
