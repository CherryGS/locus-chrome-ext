import { useId, useSyncExternalStore } from "react";
import {
  ExternalLinkIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQueuePosition } from "./useQueuePosition";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import {
  CaptureStatusBadge,
  CaptureOutcomeBadges,
} from "@/ui/shared/CaptureStatusBadge";
import { TechnicalFailure } from "@/ui/shared/TechnicalFailure";
import { getCaptureStatus } from "@/ui/shared/capture-status";
import {
  CaptureStore,
  type CaptureDraft,
  type CaptureTask,
} from "./capture-store";

function QueueTasks({
  tasks,
  preparations,
  store,
}: {
  tasks: CaptureTask[];
  preparations: CaptureDraft[];
  store: CaptureStore;
}) {
  if (!tasks.length && !preparations.length)
    return (
      <Empty className="py-6">
        <EmptyHeader>
          <EmptyTitle>Your queue is empty</EmptyTitle>
          <EmptyDescription>
            Use the source page capture action to import the selected content
            and all associated files.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  // Progress must not move a row while it is being read. IDs break timestamp ties
  // consistently even when polling supplies the same tasks in a different order.
  const ordered = [...tasks].sort(
    (a, b) =>
      b.summary.createdAt.localeCompare(a.summary.createdAt) ||
      a.summary.id.localeCompare(b.summary.id),
  );
  return (
    <ItemGroup>
      {preparations.map((draft) => (
        <Item
          key={draft.sourceId}
          role="listitem"
          variant="default"
          size="sm"
          className="capture-queue-row flex-col items-stretch sm:flex-row sm:items-start"
          data-preparation-source={draft.sourceId}
        >
          <ItemContent className="min-w-0">
            <ItemTitle>
              {draft.inspection?.label ?? `Capture ${draft.sourceId}`}
            </ItemTitle>
            <div>
              <CaptureStatusBadge
                state={
                  draft.error
                    ? "failed"
                    : draft.busy === "enqueue"
                      ? "importing"
                      : "checking"
                }
              />
            </div>
            {draft.error ? (
              <TechnicalFailure
                collapsed
                title="Capture preparation failed"
                message={draft.error}
                context={{
                  sourceId: draft.sourceId,
                  sourceUrl: draft.url,
                  phase: "prepare/enqueue",
                }}
              />
            ) : (
              <ItemDescription>
                Preparing the selected content and its files.
              </ItemDescription>
            )}
          </ItemContent>
          {draft.error && (
            <ItemActions className="self-end sm:self-center">
              <Button
                size="sm"
                variant="outline"
                onClick={(event) => {
                  if (event.nativeEvent.isTrusted)
                    void store.quickCapture(draft.url);
                }}
              >
                Retry capture
              </Button>
            </ItemActions>
          )}
        </Item>
      ))}
      {ordered.map((task) => (
        <Item
          key={task.summary.id}
          role="listitem"
          variant="default"
          size="sm"
          className="capture-queue-row flex-col items-stretch sm:flex-row sm:items-start"
          data-task-id={task.summary.id}
        >
          <ItemContent className="min-w-0">
            <ItemTitle className="line-clamp-2 break-words">
              {task.summary.label}
            </ItemTitle>
            <div className="flex flex-wrap items-center gap-2">
              <CaptureOutcomeBadges
                state={task.error ? "unknown" : getCaptureStatus(task.summary)}
                result={task.summary}
              />
              {task.summary.queuePosition !== undefined && (
                <span className="text-xs text-muted-foreground">
                  Position {task.summary.queuePosition}
                </span>
              )}
            </div>
            <p role="status" className="text-xs text-muted-foreground">
              {task.summary.locus?.state === "configuration-required"
                ? "Configure Locus in the extension, then continue this save."
                : !["failed", "unverified"].includes(
                      task.summary.locus?.state ?? "",
                    )
                  ? task.summary.locus?.message
                  : undefined}
            </p>
            {(task.summary.locus?.state === "failed" ||
              task.summary.locus?.state === "unverified") && (
              <TechnicalFailure
                collapsed
                title={
                  task.summary.locus.state === "unverified"
                    ? "Locus save not verified"
                    : "Locus save needs attention"
                }
                message={task.summary.locus.message}
                context={{
                  resultId: task.summary.id,
                  state: task.summary.locus.state,
                }}
              />
            )}
            {task.error && (
              <TechnicalFailure
                collapsed
                title="Task observation failed"
                message={task.error}
                context={{
                  resultId: task.summary.id,
                  sourceUrl: task.summary.sourceUrl,
                }}
              />
            )}
            {task.summary.issues?.map((issue) => (
              <TechnicalFailure
                collapsed
                key={issue.target}
                title={`Acquisition failed · ${issue.target}`}
                message={issue.reason}
                context={{
                  resultId: task.summary.id,
                  sourceUrl: task.summary.sourceUrl,
                  revision: task.summary.revision,
                  target: issue.target,
                }}
              />
            ))}
            {task.summary.retention.state === "failed" && (
              <TechnicalFailure
                collapsed
                title="Local copy not saved"
                message={
                  task.summary.retention.reason ??
                  "Current content is not saved locally."
                }
                context={{
                  resultId: task.summary.id,
                  revision: task.summary.revision,
                  committedRevision: task.summary.retention.revision,
                }}
              />
            )}
          </ItemContent>
          <ItemActions className="self-end sm:self-center">
            {(task.summary.locus?.state === "failed" ||
              task.summary.locus?.state === "unverified" ||
              task.summary.locus?.state === "configuration-required") ? (
              <Button
                size="sm"
                variant="outline"
                onClick={(event) => {
                  if (event.nativeEvent.isTrusted)
                    void store.openResult(task.summary.id);
                }}
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Open in Inbox
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open result"
                title={`Open result for ${task.summary.label}`}
                onClick={(event) => {
                  if (event.nativeEvent.isTrusted)
                    void store.openResult(task.summary.id);
                }}
              >
                <ExternalLinkIcon />
              </Button>
            )}
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

export function CaptureQueuePanel({
  store,
  portalContainer,
}: {
  store: CaptureStore;
  portalContainer: HTMLElement;
}) {
  const view = useSyncExternalStore(store.subscribe, store.snapshot);
  const launcher = useQueuePosition(view.visible);
  const dialogId = useId();
  const statusId = useId();
  const movementId = useId();
  if (!view.visible) return null;
  const preparations = Object.values(view.drafts).filter(
    (item) => item.busy || item.error,
  );
  const preparing = preparations.filter((item) => item.busy).length;
  const states = view.tasks.map((task) =>
    task.error ? "unknown" : getCaptureStatus(task.summary),
  );
  const waiting = states.filter((state) => state === "queued").length;
  const running =
    states.filter((state) => state === "importing" || state === "saving")
      .length + preparing;
  const staged = states.filter((state) => state === "saved").length;
  const saved = states.filter((state) => state === "locus-saved").length;
  const attention =
    states.filter((state) => ["partial", "failed", "unknown"].includes(state))
      .length + preparations.filter((item) => item.error).length;
  const detail = view.error
    ? "Status unavailable"
    : running || waiting
      ? `${running} active · ${waiting} queued`
      : attention
        ? `${attention} need attention`
        : staged
          ? `${staged} staged`
          : saved
            ? `${saved} saved`
            : "Ready to capture";
  const count = view.tasks.length + preparations.length;
  const open = view.expanded;
  return (
    <>
      <Button
        ref={launcher.ref}
        {...launcher.handlers}
        style={launcher.style}
        data-locus-queue-launcher
        variant="secondary"
        size="icon"
        className="pointer-events-auto fixed size-12 touch-none select-none rounded-full transition-none shadow-lg"
        aria-label="Expand capture queue"
        aria-describedby={`${statusId} ${movementId}`}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        title={`${detail} · Click or Enter to open tasks · drag or arrow keys to move`}
        onClick={(event) => {
          if (
            event.nativeEvent.isTrusted &&
            !launcher.consumeClick(event.detail)
          )
            store.showQueue();
        }}
      >
        {running ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="motion-safe:animate-spin"
          />
        ) : (
          <ListOrderedIcon aria-hidden="true" />
        )}
        {count > 0 && (
          <Badge
            aria-hidden="true"
            variant={attention || view.error ? "destructive" : "default"}
            className="pointer-events-none absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
        <span id={statusId} className="sr-only">
          {count} tasks · {detail}
        </span>
        <span id={movementId} className="sr-only">
          Arrow keys move this button; hold Shift to move faster. Enter or Space opens the queue.
        </span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) store.minimize();
        }}
      >
        <DialogContent
          id={dialogId}
          portalContainer={portalContainer}
          className="capture-queue-dialog pointer-events-auto flex max-h-[min(85dvh,44rem)] flex-col sm:max-w-xl"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Capture queue</DialogTitle>
              <DialogClose
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Minimize capture queue"
                  />
                }
              >
                <XIcon />
              </DialogClose>
            </div>
            <DialogDescription>
              Follow your captures here. Closing this window keeps tasks
              running.
            </DialogDescription>
          </DialogHeader>
          <div
            role="group"
            className="flex shrink-0 flex-wrap gap-2"
            aria-label="Task counts"
          >
            {[
              [running, "active"],
              [waiting, "queued"],
              [staged, "staged"],
              [saved, "saved"],
              [attention, "need attention"],
            ].map(
              ([count, label]) =>
                Number(count) > 0 && (
                  <Badge key={label} variant="secondary">
                    {count} {label}
                  </Badge>
                ),
            )}
          </div>
          <div
            data-locus-scroll
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            {view.error && (
              <TechnicalFailure
                collapsed
                title="Queue status unavailable"
                message={view.error}
                context={{ phase: "queue.observe" }}
              />
            )}
            <QueueTasks
              tasks={view.tasks}
              preparations={preparations}
              store={store}
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                if (event.nativeEvent.isTrusted) void store.refresh();
              }}
            >
              Refresh status
            </Button>
            <DialogClose render={<Button size="sm" variant="outline" />}>
              Keep browsing
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
