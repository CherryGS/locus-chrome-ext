import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  DownloadIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  InboxIcon,
  Trash2Icon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  availability,
  type Snapshot,
  type Delivery,
} from "@locus/capture-core/model";
import { CaptureOutcomeStrip } from "./CaptureOutcomeStrip";
import { getResultCaptureStatus } from "@/ui/shared/capture-status";
import type { LocusTransfer } from "@/host/locus/model";
import { CaptureOutcomeDetails } from "./CaptureOutcomeDetails";
import { CaptureDetails } from "./CaptureDetails";
import { CaptureSourceSummary } from "./CaptureSourceSummary";
import { Failure } from "./ResultNotice";
import { deliveryLabels, safeSource } from "./presentation";

export function CaptureInspector({
  selected,
  onBack,
  snapshot,
  queuePosition,
  unresolvedReason,
  readError,
  collectionError,
  actionError,
  delivery,
  locus,
  onContinueLocus,
  onSettings,
  busy,
  onExport,
  onClear,
  onRetry,
  onNotice,
}: {
  selected: string;
  onBack: () => void;
  snapshot?: Snapshot | null;
  queuePosition?: number;
  unresolvedReason?: string;
  readError: string;
  collectionError: string;
  actionError: string;
  delivery: Delivery[];
  locus?: LocusTransfer;
  onContinueLocus: () => void;
  onSettings: () => void;
  busy: string;
  onExport: () => void;
  onClear: () => void;
  onRetry: () => void;
  onNotice: (message: string) => void;
}) {
  const result = snapshot?.result;
  const state = result && availability(result);
  const currentLocus = locus?.resultId === selected ? locus : undefined;
  const captureStatus =
    result &&
    getResultCaptureStatus(result, currentLocus, {
      queuePosition,
      unresolvedReason: readError || unresolvedReason,
    });
  const [tab, setTab] = useState("preview");
  useEffect(() => setTab("preview"), [selected]);
  const deliveries = delivery.filter((item) => item.resultId === selected);
  const latest = [...deliveries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  return (
    <section
      aria-label="Capture inspection"
      className="capture-inspector h-full min-h-0 min-w-0 overflow-y-auto"
    >
      <header className="flex shrink-0 flex-col gap-2 border-b px-4 py-3 sm:px-5">
        <div className="capture-inspector-toolbar flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to captures"
              className="md:hidden"
              onClick={onBack}
            >
              <ArrowLeftIcon />
            </Button>
            <div className="flex min-w-0 flex-col gap-1">
              {result && captureStatus ? (
                <CaptureSourceSummary result={result} state={captureStatus} />
              ) : (
                <p className="text-xs text-muted-foreground">Your library</p>
              )}
              <h2 className="capture-record-heading break-words">
                {result?.label ??
                  (selected ? "Selected capture" : "Capture preview")}
              </h2>
            </div>
          </div>
          {result && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || !state?.acquired}
                onClick={onExport}
              >
                <DownloadIcon data-icon="inline-start" />
                {busy === "export"
                  ? "Preparing export…"
                  : state?.complete
                    ? "Export ZIP"
                    : "Export available content"}
              </Button>
              {safeSource(result.sourceUrl) && (
                <a
                  href={safeSource(result.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-sm",
                  })}
                  aria-label="Open source"
                  title="Open source"
                >
                  <ExternalLinkIcon />
                </a>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear capture"
                title="Clear capture"
                disabled={!!busy}
                onClick={onClear}
              >
                <Trash2Icon />
              </Button>
            </div>
          )}
        </div>
        {result && <CaptureOutcomeStrip result={result} locus={currentLocus} queued={queuePosition !== undefined} />}
        {latest && (
          <div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setTab("activity")}
            >
              {deliveryLabels[latest.state]}
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        )}
      </header>
      {snapshot && <div className="capture-recovery"><CaptureOutcomeDetails
              result={snapshot.result}
              locus={currentLocus}
              readError={readError}
              actionError={actionError}
              latest={latest}
              busy={!!busy}
              canContinue={
                !!state?.complete &&
                !readError &&
                !Object.keys(snapshot.readErrors ?? {}).length
              }
              onContinue={onContinueLocus}
              onSettings={onSettings}
              onRetry={onRetry}
            /></div>}
      {!result && readError && (
        <div className="shrink-0 p-4">
          <Failure title="Could not load capture" message={readError} />
          <Button variant="link" size="sm" onClick={onRetry}>
            Retry loading
          </Button>
        </div>
      )}
      {snapshot && (
        <CaptureDetails
          key={snapshot.result.id}
          snapshot={snapshot}
          deliveries={deliveries}
          onNotice={onNotice}
          tab={tab}
          onTab={setTab}
        />
      )}
      {!selected && (
        <Empty className="m-auto max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>Select a capture</EmptyTitle>
            <EmptyDescription>
              Read the captured content, inspect its files, and export what
              you’ve captured. Your source page can stay closed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {selected && snapshot === undefined && !readError && !collectionError && (
        <div
          className="flex flex-col gap-5 p-8"
          aria-label="Reading selected capture"
        >
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}
      {selected && snapshot === null && (
        <Empty className="m-auto max-w-md">
          <EmptyHeader>
            <EmptyTitle>Capture no longer exists</EmptyTitle>
            <EmptyDescription>
              It may have been cleared. Choose another capture from the library.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
