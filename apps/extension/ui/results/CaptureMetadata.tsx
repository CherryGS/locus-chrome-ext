import { useMemo, useState, type ReactNode } from "react";
import { CopyIcon } from "lucide-react";
import { errorMessage, type Snapshot } from "@locus/capture-core/model";
import { twitterPresentation } from "@locus/twitter/presentation";
import { bilibiliPresentation } from "@locus/bilibili/presentation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item, ItemGroup, ItemContent, ItemTitle } from "@/components/ui/item";
import { TechnicalFailure } from "@/ui/shared/TechnicalFailure";
import {
  acquisitionLabel,
  exactTime,
  fileSize,
  retentionLabel,
  sourceName,
} from "./presentation";
import { SourceLink } from "./SourceLink";

function Fields({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm [overflow-wrap:anywhere]">
            {value ?? (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CaptureMetadata({
  snapshot,
  onNotice,
}: {
  snapshot: Snapshot;
  onNotice: (message: string) => void;
}) {
  const { result, readErrors } = snapshot;
  const [rawOpen, setRawOpen] = useState(false);
  const json = useMemo(
    () => JSON.stringify({ result, receiverReadErrors: readErrors }, null, 2),
    [result, readErrors],
  );
  const time = (value: string | null) => (value ? exactTime(value) : null);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Capture metadata</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Source details and selected files from this retained capture.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(json)
              .then(() => onNotice("Metadata copied."))
              .catch((error) =>
                onNotice(`Could not copy metadata: ${errorMessage(error)}`),
              )
          }
        >
          <CopyIcon data-icon="inline-start" />
          Copy JSON
        </Button>
      </div>
      <section aria-label="Capture overview" className="flex flex-col gap-4">
        <h4 className="text-sm font-medium">Capture overview</h4>
        <Fields
          values={[
            ["Website", sourceName(result.sourceUrl)],
            ["Captured", exactTime(result.createdAt)],
            [
              "Original content",
              <SourceLink href={result.sourceUrl}>
                {result.sourceUrl}
              </SourceLink>,
            ],
            ["Capture ID", result.id],
            ["Local storage", retentionLabel(result.retention.state)],
            [
              "Revision",
              `${result.revision} · retained ${result.retention.revision}`,
            ],
          ]}
        />
        {result.retention.reason && (
          <TechnicalFailure
            collapsed
            title="Retention details"
            message={result.retention.reason}
          />
        )}
      </section>
      <section aria-label="Source records" className="flex flex-col gap-4">
        <h4 className="text-sm font-medium">Source information</h4>
        <ItemGroup>
          {result.records.map((record) => {
            const post =
              result.site === "twitter"
                ? twitterPresentation(record.payload)
                : null;
            const part =
              result.site === "bilibili"
                ? bilibiliPresentation(record.payload)
                : null;
            const values: [string, ReactNode][] = post
              ? [
                  [
                    "Author",
                    <SourceLink href={post.authorUrl}>
                      {post.displayName ?? post.username ?? "Author unknown"}
                    </SourceLink>,
                  ],
                  ["Username", post.username ? `@${post.username}` : null],
                  ["Post ID", post.sourceId],
                  ["Author ID", post.accountId],
                  ["Published", time(post.publishedAt)],
                  ["Observed", time(post.observedAt)],
                ]
              : part
                ? [
                    ["Title", part.title],
                    ["Part", part.part],
                    [
                      "Uploader",
                      <SourceLink href={part.authorUrl}>
                        {part.uploader ?? "Uploader unknown"}
                      </SourceLink>,
                    ],
                    ["Uploader ID", part.uploaderId],
                    ["BV ID", part.bvid],
                    ["AV ID", part.aid],
                    ["Part CID", part.cid],
                    [
                      "Duration",
                      part.duration === null
                        ? null
                        : `${part.duration} seconds${part.durationPrecision === "coarse-seconds" ? " (approximate)" : ""}`,
                    ],
                    ["Published", time(part.publishedAt)],
                    ["Observed", time(part.observedAt)],
                    ["Source representation", part.quality],
                    [
                      "Audio",
                      part.audioAbsent ? "No audio in source" : part.audioCodec,
                    ],
                  ]
                : [];
            return (
              <Item
                key={record.id}
                variant="outline"
                className="min-w-0 flex-col items-stretch"
              >
                <ItemContent className="min-w-0 gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ItemTitle>Record {record.id}</ItemTitle>
                    <Badge variant="outline">
                      {acquisitionLabel(record.acquisition.state)}
                    </Badge>
                  </div>
                  <Fields
                    values={[
                      ...values,
                      [
                        "Selected file IDs",
                        record.assetIds.length
                          ? record.assetIds.join(", ")
                          : "None",
                      ],
                    ]}
                  />
                  {!post && !part && (
                    <p className="text-sm text-muted-foreground">
                      No supported source summary. Any retained payload is
                      available in Full JSON below.
                    </p>
                  )}
                  {record.acquisition.reason && (
                    <TechnicalFailure
                      collapsed
                      title="Record acquisition details"
                      message={record.acquisition.reason}
                    />
                  )}
                </ItemContent>
              </Item>
            );
          })}
        </ItemGroup>
      </section>
      <section aria-label="File metadata" className="flex flex-col gap-4">
        <h4 className="text-sm font-medium">
          Files{" "}
          <span className="text-muted-foreground">
            ({result.assets.length})
          </span>
        </h4>
        {!result.assets.length && (
          <p className="text-sm text-muted-foreground">
            No media files were selected.
          </p>
        )}
        <ItemGroup>
          {result.assets.map((asset) => (
            <Item
              key={asset.id}
              variant="outline"
              className="min-w-0 flex-col items-stretch"
            >
              <ItemContent className="min-w-0 gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ItemTitle>{asset.id}</ItemTitle>
                  <Badge variant="outline">
                    {acquisitionLabel(asset.acquisition.state)}
                  </Badge>
                </div>
                <Fields
                  values={[
                    ["Media type", asset.mime ?? null],
                    ["Size", fileSize(asset.size)],
                    ["Source record", asset.recordId],
                    [
                      "File read",
                      readErrors[asset.id]
                        ? "Read failed"
                        : snapshot.blobs[asset.id]
                          ? "Available"
                          : "Not available in this view",
                    ],
                  ]}
                />
                {asset.acquisition.reason && (
                  <TechnicalFailure
                    collapsed
                    title="File acquisition details"
                    message={asset.acquisition.reason}
                  />
                )}
                {readErrors[asset.id] && (
                  <TechnicalFailure
                    collapsed
                    title="File read failed"
                    message={readErrors[asset.id]!}
                  />
                )}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </section>
      <details
        className="min-w-0 rounded-lg border"
        onToggle={(event) => setRawOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Full JSON
        </summary>
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Complete retained payloads, file associations and read outcomes. File
          bytes are exported separately.
        </p>
        {rawOpen && (
          <pre
            data-capture-json
            className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words border-t bg-muted/30 p-4 text-xs leading-relaxed"
          >
            {json}
          </pre>
        )}
      </details>
    </div>
  );
}
