import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { TechnicalFailure } from "@/ui/shared/TechnicalFailure";
import { toast } from "@/components/ui/toast";
import { transferActive, type LocusTransfer } from "@/host/locus/model";

export function LocusSaveDetails({
  transfer,
  busy,
  canContinue,
  onContinue,
  onSettings,
}: {
  transfer?: LocusTransfer;
  busy: boolean;
  canContinue: boolean;
  onContinue: () => void;
  onSettings: () => void;
}) {
  if (!transfer) return null;
  if (transfer.state === "complete")
    return (
      <p className="text-xs text-muted-foreground">
        Locus confirmed this save
        {transfer.entityIds?.length
          ? ` · ${transfer.entityIds.length} ${transfer.entityIds.length === 1 ? "entry" : "entries"}`
          : ""}
        . The local copy is shown separately.
      </p>
    );
  if (transferActive(transfer))
    return (
      <Alert role="status">
        <AlertTitle>Saving to Locus</AlertTitle>
        <AlertDescription>{transfer.message}</AlertDescription>
      </Alert>
    );
  return (
    <div className="flex flex-col gap-2">
      {transfer.state === "configuration-required" ? (
        <Alert role="note">
          <AlertTitle>Locus setup required</AlertTitle>
          <AlertDescription>
            Configure the Locus connection, then return here to continue this
            save. Changing settings does not send captured content.
          </AlertDescription>
        </Alert>
      ) : (
        <TechnicalFailure
          collapsed
          title={
            transfer.state === "unverified"
              ? "Locus save not verified"
              : "Locus save needs attention"
          }
          message={transfer.message}
          context={{
            resultId: transfer.resultId,
            state: transfer.state,
            revision: transfer.revision,
          }}
          onNotice={(title) => toast.add({ title })}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onSettings}>
          Connection settings
        </Button>
        {canContinue && (
          <Button size="sm" disabled={busy} onClick={onContinue}>
            {transfer.state === "configuration-required"
              ? "Continue save"
              : transfer.state === "unverified"
                ? "Check original save"
                : "Check and continue save"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Continuation checks the original attempt. Confirmed uploads are not
        repeated; incomplete or unreadable content must be inspected first.
      </p>
    </div>
  );
}

export function LocusSaveStatus({
  transfer,
  onDetails,
}: {
  transfer?: LocusTransfer;
  onDetails: () => void;
}) {
  if (!transfer || transfer.state === "complete") return null;
  const active = transferActive(transfer);
  const setup = transfer.state === "configuration-required";
  return (
    <Button size="xs" variant="ghost" onClick={onDetails}>
      {active
        ? "Saving to Locus"
        : setup
          ? "Locus setup required"
          : transfer.state === "unverified"
            ? "Locus save not verified"
            : "Locus save needs attention"}
      <ChevronRightIcon data-icon="inline-end" />
    </Button>
  );
}
