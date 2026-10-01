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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { bilibiliPresentation } from "@locus/bilibili/presentation";
import { twitterPresentation } from "@locus/twitter/presentation";
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
  const previewAssets =
    result.site === "bilibili"
      ? [...result.assets].sort(
          (a, b) => Number(b.id === "media-2") - Number(a.id === "media-2"),
        )
      : result.assets;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Captured {exactTime(result.createdAt)}</span>
        <SourceLink href={result.sourceUrl}>
          {result.site === "bilibili"
            ? "Open original video"
            : result.site === "twitter"
              ? "Open original post"
              : "Open original content"}
        </SourceLink>
      </div>
      {result.records.map((record) => {
        const post =
          result.site === "twitter" && record.acquisition.state === "acquired"
            ? twitterPresentation(record.payload)
            : null;
        const part =
          result.site === "bilibili" && record.acquisition.state === "acquired"
            ? bilibiliPresentation(record.payload)
            : null;
        return (
          <article key={record.id} className="flex flex-col gap-5">
            {post && (
              <>
                <header className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>
                      {(post.displayName ?? post.username ?? "X")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium">
                      <SourceLink
                        href={post.authorUrl}
                        label="Open author profile"
                      >
                        {post.displayName ?? post.username ?? "Author unknown"}
                      </SourceLink>
                    </p>
                    <p className="break-words text-sm text-muted-foreground">
                      {post.username ? `@${post.username}` : "Username unknown"}
                      {post.publishedAt
                        ? ` · ${exactTime(post.publishedAt)}`
                        : " · Publication time unknown"}
                    </p>
                  </div>
                </header>
                <div className="whitespace-pre-wrap break-words text-base leading-7">
                  {post.text || (
                    <span className="text-muted-foreground">
                      Empty authored message
                    </span>
                  )}
                </div>
              </>
            )}
            {part && (
              <>
                <header className="flex flex-col gap-2">
                  <h3 className="break-words text-lg font-medium">
                    {part.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Uploader:{" "}
                    <SourceLink
                      href={part.authorUrl}
                      label="Open uploader profile"
                    >
                      {part.uploader ?? "Unknown"}
                    </SourceLink>
                  </p>
                  <p className="break-words text-sm text-muted-foreground">
                    {part.part}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {part.quality}
                    {part.publishedAt && ` · ${exactTime(part.publishedAt)}`}
                  </p>
                </header>
                <p className="whitespace-pre-wrap break-words">
                  {part.description || "Empty authored description"}
                </p>
              </>
            )}
            {!post && !part && record.acquisition.state === "acquired" && (
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
        <ItemGroup>
          {previewAssets.map((asset, index) => (
            <Item
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
                  <ItemTitle>
                    {result.site === "bilibili" && asset.id === "media-1"
                      ? "Parent cover"
                      : asset.mime?.startsWith("image/")
                        ? "Image"
                        : asset.mime?.startsWith("video/")
                          ? "Video"
                          : "File"}{" "}
                    {index + 1}
                  </ItemTitle>
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
                  message={`${readErrors[asset.id]}. Retry reads to try again; acquisition has not changed.`}
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
