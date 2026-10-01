import { LoaderCircleIcon } from "lucide-react";
import { CaptureStatusBadge } from "@/ui/shared/CaptureStatusBadge";
import { TechnicalFailure } from "@/ui/shared/TechnicalFailure";
import {
  FieldSet,
  FieldLegend,
  FieldDescription,
  FieldGroup,
  Field,
  FieldLabel,
} from "@/components/ui/field";
import { CaptureStore, type CaptureDraft } from "@/ui/capture/capture-store";
import { TrustedCheckbox } from "./TrustedCheckbox";

export function CaptureSelection({
  draft,
  store,
}: {
  draft: CaptureDraft;
  store: CaptureStore;
}) {
  const inspection = draft.inspection;
  return (
    <div className="flex flex-col gap-4">
      {draft.error && (
        <TechnicalFailure
          collapsed
          title="Could not add capture"
          message={draft.error}
          context={{
            sourceId: draft.sourceId,
            sourceUrl: draft.url,
            phase: draft.enqueueFailed ? "prepare/enqueue" : "inspect",
          }}
        />
      )}
      {draft.busy === "inspect" && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircleIcon className="size-4 motion-safe:animate-spin" />
          Inspecting this post…
        </p>
      )}
      {inspection && (
        <>
          <div className="flex flex-col gap-2">
            <p className="break-words text-sm font-medium">
              {inspection.label}
            </p>
            <CaptureStatusBadge
              state={store.sourceStatus(draft.sourceId).state}
            />
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Message preview
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                {inspection.textPreview ?? inspection.textFailure}
              </p>
            </details>
          </div>
          <FieldSet>
            <FieldLegend>Choose this post’s media</FieldLegend>
            <FieldDescription>
              Clear every checkbox for message and metadata only.
            </FieldDescription>
            <FieldGroup>
              {inspection.media.map((media, index) => (
                <Field key={media.id}>
                  <FieldLabel htmlFor={`${inspection.token}-${media.id}`}>
                    <TrustedCheckbox
                      id={`${inspection.token}-${media.id}`}
                      checked={draft.selected.includes(media.id)}
                      onChange={(checked) =>
                        store.choose(draft.sourceId, media.id, checked)
                      }
                    />
                    {media.kind === "photo"
                      ? "Photo"
                      : media.kind === "animated_gif"
                        ? "Animation"
                        : media.kind === "video"
                          ? "Video"
                          : "Unsupported attachment"}{" "}
                    · choice {index + 1}
                  </FieldLabel>
                  {media.previewUrl && (
                    <img
                      src={media.previewUrl}
                      alt={`Selection preview for choice ${index + 1}`}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="max-h-32 max-w-full rounded-md object-contain"
                    />
                  )}
                  {media.kind !== "photo" && media.previewUrl && (
                    <FieldDescription>
                      Still preview; capture requests the motion file.
                    </FieldDescription>
                  )}
                  {media.reason && (
                    <FieldDescription>{media.reason}</FieldDescription>
                  )}
                  <details className="break-words text-xs text-muted-foreground">
                    <summary>Source details</summary>
                    <p>
                      {media.sourceId ?? "Unknown source media ID"} ·{" "}
                      {media.quality}. Source attachment order is unverified.
                    </p>
                  </details>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          {inspection.media.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No directly attached media in the verified source.
            </p>
          )}
        </>
      )}
    </div>
  );
}
