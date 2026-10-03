import { useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
  FileIcon,
  ImageIcon,
  VideoIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import type { Snapshot } from "@locus/capture-core/model";
import { recordPresentation, previewPresentation } from "./record-presentation";
import { RecordPreview } from "./RecordPreview";
import { SourceLink } from "./SourceLink";
import { Failure, Pending } from "./ResultNotice";
import { acquisitionLabel, exactTime, fileSize } from "./presentation";

function AcquisitionBadge({ state }: { state: string }) {
  const Icon =
    state === "acquired"
      ? CheckCircle2Icon
      : state === "pending"
        ? LoaderCircleIcon
        : CircleAlertIcon;
  return (
    <Badge
      variant={
        state === "acquired"
          ? "success"
          : state === "pending"
            ? "info"
            : "destructive"
      }
    >
      <Icon data-icon="inline-start" />
      {acquisitionLabel(state)}
    </Badge>
  );
}
function FilePreview({ blob, label }: { blob: Blob; label: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    setFailed(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  if (!url) return <Skeleton className="h-48 w-full" />;
  if (failed)
    return (
      <Alert>
        <AlertTitle>Preview unavailable</AlertTitle>
        <AlertDescription>
          This file could not be previewed. Its acquired bytes remain available
          for export.
        </AlertDescription>
      </Alert>
    );
  if (blob.type.startsWith("image/"))
    return (
      <img
        className="max-h-[28rem] w-full rounded-lg bg-muted object-contain"
        src={url}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  if (blob.type === "video/mp4")
    return (
      <video
        className="max-h-[28rem] w-full rounded-lg bg-muted"
        src={url}
        controls
        preload="metadata"
        aria-label={label}
        onError={() => setFailed(true)}
      />
    );
  return (
    <p className="text-sm text-muted-foreground">
      No preview for this encoding. Export the acquired file to open it
      elsewhere.
    </p>
  );
}
export function CapturePreview({ snapshot }: { snapshot: Snapshot }) {
  const { result, blobs, readErrors } = snapshot;
  const acquiredFiles = result.assets.filter(
    (asset) => asset.acquisition.state === "acquired",
  ).length;
  const preview = previewPresentation(result);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Captured {exactTime(result.createdAt)}</span>
        <SourceLink href={result.sourceUrl}>{preview.originalLabel}</SourceLink>
      </div>
      {result.records.map((record) => {
        const presentation =
          record.acquisition.state === "acquired"
            ? recordPresentation(result.site, record.payload)
            : null;
        return (
          <article key={record.id} className="flex flex-col gap-5">
            {presentation && <RecordPreview presentation={presentation} />}
            {!presentation && record.acquisition.state === "acquired" && (
              <Alert>
                <AlertTitle>Record available</AlertTitle>
                <AlertDescription>
                  This record has no supported text preview. Its full payload is
                  available in Metadata.
                </AlertDescription>
              </Alert>
            )}
            {record.acquisition.state === "pending" && (
              <Pending
                title="Content is still being acquired"
                message={
                  record.acquisition.reason ??
                  "The producer has not supplied the message yet."
                }
              />
            )}
            {record.acquisition.state === "unavailable" && (
              <Failure
                title="Content unavailable"
                message={
                  record.acquisition.reason ??
                  "The producer could not supply the message."
                }
                context={{
                  resultId: result.id,
                  sourceUrl: result.sourceUrl,
                  revision: result.revision,
                  recordId: record.id,
                }}
              />
            )}
          </article>
        );
      })}
      <section aria-label="Selected files" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Selected files</h3>
          <span className="text-xs text-muted-foreground">
            {result.assets.length
              ? `${acquiredFiles} of ${result.assets.length} acquired`
              : "Text-only capture"}
          </span>
        </div>
        {!result.assets.length && (
          <p className="text-sm text-muted-foreground">
            Only the message and metadata were selected. No media files are
            missing.
          </p>
        )}
        <ItemGroup role={preview.assets.length ? "list" : undefined}>
          {preview.assets.map(({ asset, title }, index) => (
            <Item
              role="listitem"
              key={asset.id}
              variant="outline"
              className="flex-col items-stretch p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <ItemMedia variant="icon">
                  {asset.mime?.startsWith("image/") ? (
                    <ImageIcon />
                  ) : asset.mime?.startsWith("video/") ? (
                    <VideoIcon />
                  ) : (
                    <FileIcon />
                  )}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{title}</ItemTitle>
                  <ItemDescription>
                    {asset.mime
                      ? `${asset.mime} · ${fileSize(asset.size)}`
                      : asset.id}
                  </ItemDescription>
                </ItemContent>
                <AcquisitionBadge state={asset.acquisition.state} />
              </div>
              {asset.acquisition.reason && (
                <Failure
                  title="Selected file unavailable"
                  message={asset.acquisition.reason}
                  context={{
                    resultId: result.id,
                    sourceUrl: result.sourceUrl,
                    revision: result.revision,
                    assetId: asset.id,
                    recordId: asset.recordId,
                  }}
                />
              )}
              {readErrors[asset.id] && (
                <Failure
                  title="File read failed"
                  message={`${readErrors[asset.id]}. Select Retry loading to read this file again. Its capture outcome has not changed.`}
                />
              )}
              {blobs[asset.id] && (
                <FilePreview
                  blob={blobs[asset.id]!}
                  label={`Selected file ${index + 1} (${asset.id})`}
                />
              )}
            </Item>
          ))}
        </ItemGroup>
      </section>
    </div>
  );
}
