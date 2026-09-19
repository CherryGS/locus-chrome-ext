import { useSyncExternalStore } from 'react';
import { ChevronDownIcon, ExternalLinkIcon, ListOrderedIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Item, ItemGroup, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item';
import { FieldSet, FieldLegend, FieldDescription, FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { CaptureStatusBadge } from '@/ui/shared/CaptureStatusBadge';
import { TechnicalFailure } from '@/ui/shared/TechnicalFailure';
import { getCaptureStatus } from '@/ui/shared/capture-status';
import { TrustedCheckbox } from './TrustedCheckbox';
import { CaptureStore, type CaptureDraft, type CaptureTask } from './capture-store';

function Selection({ draft, store }: { draft: CaptureDraft; store: CaptureStore }) {
  const inspection = draft.inspection;
  return <div className="flex flex-col gap-4">
    {draft.error && <TechnicalFailure title="Could not add capture" message={draft.error} context={{sourceId:draft.sourceId,sourceUrl:draft.url,phase:draft.enqueueFailed?'prepare/enqueue':'inspect'}} />}
    {draft.busy === 'inspect' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 motion-safe:animate-spin" />Inspecting this post…</p>}
    {inspection && <>
      <div className="flex flex-col gap-2"><p className="break-words text-sm font-medium">{inspection.label}</p><CaptureStatusBadge state={store.sourceStatus(draft.sourceId).state} /><details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Message preview</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{inspection.textPreview ?? inspection.textFailure}</p></details></div>
      <FieldSet><FieldLegend>Choose this post’s media</FieldLegend><FieldDescription>Clear every checkbox for message and metadata only.</FieldDescription><FieldGroup>
        {inspection.media.map((media, index) => <Field key={media.id}><FieldLabel htmlFor={`${inspection.token}-${media.id}`}><TrustedCheckbox id={`${inspection.token}-${media.id}`} checked={draft.selected.includes(media.id)} onChange={checked => store.choose(draft.sourceId, media.id, checked)} />{media.kind === 'photo' ? 'Photo' : media.kind === 'animated_gif' ? 'Animation' : media.kind === 'video' ? 'Video' : 'Unsupported attachment'} · choice {index + 1}</FieldLabel>{media.previewUrl && <img src={media.previewUrl} alt={`Selection preview for choice ${index + 1}`} referrerPolicy="no-referrer" loading="lazy" className="max-h-32 max-w-full rounded-md object-contain" />}{media.kind !== 'photo' && media.previewUrl && <FieldDescription>Still preview; capture requests the motion file.</FieldDescription>}{media.reason && <FieldDescription>{media.reason}</FieldDescription>}<details className="break-words text-xs text-muted-foreground"><summary>Source details</summary><p>{media.sourceId ?? 'Unknown source media ID'} · {media.quality}. Source attachment order is unverified.</p></details></Field>)}
      </FieldGroup></FieldSet>
      {inspection.media.length === 0 && <p className="text-sm text-muted-foreground">No directly attached media in the verified source.</p>}
    </>}
  </div>;
}

function QueueTasks({ tasks, preparations, store }: { tasks: CaptureTask[]; preparations: CaptureDraft[]; store: CaptureStore }) {
  if (!tasks.length && !preparations.length) return <Empty className="py-6"><EmptyHeader><EmptyTitle>Your queue is empty</EmptyTitle><EmptyDescription>Use the source page capture action to import the selected content and files. Twitter also supports Shift-click media selection.</EmptyDescription></EmptyHeader></Empty>;
  const rank = (task: CaptureTask) => task.summary.queuePosition !== undefined ? 1 : !task.error && ['importing','saving'].includes(getCaptureStatus(task.summary)) ? 0 : 2;
  const ordered = [...tasks].sort((a,b) => rank(a) - rank(b) || (rank(a) === 1 ? a.summary.queuePosition! - b.summary.queuePosition! : rank(a) === 0 ? a.summary.createdAt.localeCompare(b.summary.createdAt) : b.summary.createdAt.localeCompare(a.summary.createdAt)));
  return <ItemGroup>{preparations.map(draft => <Item key={draft.sourceId} role="listitem" variant="outline" size="sm" data-preparation-source={draft.sourceId}>
    <ItemContent className="min-w-0"><ItemTitle>{draft.inspection?.label ?? `Capture ${draft.sourceId}`}</ItemTitle><div><CaptureStatusBadge state={draft.error ? 'failed' : draft.busy === 'enqueue' ? 'importing' : 'checking'} /></div>
      {draft.error ? <TechnicalFailure title="Capture preparation failed" message={draft.error} context={{sourceId:draft.sourceId,sourceUrl:draft.url,phase:'prepare/enqueue'}} /> : <ItemDescription>Preparing the selected content and its files.</ItemDescription>}
    </ItemContent>{draft.error && <ItemActions><Button size="sm" variant="outline" onClick={event => { if (event.nativeEvent.isTrusted) void store.quickCapture(draft.url); }}>Retry capture</Button></ItemActions>}
  </Item>)}{ordered.map(task => <Item key={task.summary.id} role="listitem" variant="outline" size="sm" data-task-id={task.summary.id}>
    <ItemContent className="min-w-0"><ItemTitle>{task.summary.label}</ItemTitle><div className="flex flex-wrap items-center gap-2"><CaptureStatusBadge state={task.error ? 'unknown' : getCaptureStatus(task.summary)} />{task.summary.queuePosition !== undefined && <span className="text-xs text-muted-foreground">Position {task.summary.queuePosition}</span>}</div>
      {task.error && <TechnicalFailure title="Task observation failed" message={task.error} context={{resultId:task.summary.id,sourceUrl:task.summary.sourceUrl}} />}
      {task.summary.issues?.map(issue=><TechnicalFailure key={issue.target} title={`Acquisition failed · ${issue.target}`} message={issue.reason} context={{resultId:task.summary.id,sourceUrl:task.summary.sourceUrl,revision:task.summary.revision,target:issue.target}} />)}
      {task.summary.retention.state === 'failed' && <TechnicalFailure title="Retention failed" message={task.summary.retention.reason ?? 'Current content is not saved locally.'} context={{resultId:task.summary.id,revision:task.summary.revision,committedRevision:task.summary.retention.revision}} />}
    </ItemContent>
    <ItemActions><Button variant="ghost" size="icon-sm" aria-label="Open result" title={`Open result for ${task.summary.label}`} onClick={event => { if (event.nativeEvent.isTrusted) void store.openResult(task.summary.id); }}><ExternalLinkIcon /></Button></ItemActions>
  </Item>)}</ItemGroup>;
}

export function CaptureQueuePanel({ store }: { store: CaptureStore }) {
  const view = useSyncExternalStore(store.subscribe, store.snapshot);
  if (!view.visible) return null;
  const draft = view.selected ? view.drafts[view.selected] : undefined;
  const existing = draft && store.sourceResult(draft.sourceId);
  const preparations = Object.values(view.drafts).filter(item => item.autoStart && (item.busy || item.error));
  const preparing = preparations.filter(item => item.busy).length;
  const states = view.tasks.map(task => task.error ? 'unknown' : getCaptureStatus(task.summary));
  const waiting = states.filter(state => state === 'queued').length;
  const running = states.filter(state => state === 'importing' || state === 'saving').length;
  const attention = states.filter(state => ['partial','failed','unknown'].includes(state)).length + preparations.filter(item => item.error).length;
  const detail = view.error ? 'Status unavailable' : preparing ? `${preparing} preparing · ${running + waiting} in queue` : running || waiting ? `${running} active · ${waiting} queued` : attention ? `${attention} need attention` : view.tasks.length ? `${view.tasks.length} saved locally` : 'Ready to capture';
  return <aside aria-label="Locus capture queue" className="pointer-events-auto w-[23rem] max-w-[calc(100vw-2rem)]">
    {!view.expanded ? <Button variant="secondary" className="h-auto w-full justify-between gap-3 py-3" aria-label="Expand capture queue" aria-expanded={false} onClick={event => { if (event.nativeEvent.isTrusted) store.showQueue(); }}><span className="flex items-center gap-2"><ListOrderedIcon data-icon="inline-start" />Capture queue</span><span className="text-xs">{detail}</span></Button> :
      <Card size="sm" className="flex max-h-[min(75dvh,42rem)] flex-col gap-0 overflow-hidden pb-0">
        <CardHeader className="shrink-0 pb-3"><CardTitle>{draft ? 'Add capture' : 'Capture queue'}</CardTitle><CardDescription>{draft ? 'Select a scope, then keep browsing.' : detail}</CardDescription><CardAction><Button size="icon-sm" variant="ghost" aria-label="Minimize capture queue" onClick={event => { if (event.nativeEvent.isTrusted) store.minimize(); }}><ChevronDownIcon /></Button></CardAction></CardHeader>
        <CardContent data-locus-scroll className="min-h-0 overflow-y-auto overscroll-contain pb-4">
          {view.error && <TechnicalFailure title="Queue status unavailable" message={view.error} context={{phase:'queue.observe'}} />}
          {draft ? <Selection draft={draft} store={store} /> : <QueueTasks tasks={view.tasks} preparations={preparations} store={store} />}
        </CardContent>
        <CardFooter className="shrink-0 flex-wrap justify-between gap-2 border-t py-3">
          {draft ? <><div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={event => { if (event.nativeEvent.isTrusted) store.showQueue(); }}>View queue ({view.tasks.length})</Button>{existing && <Button size="icon-sm" variant="ghost" aria-label="Open result" title="Open the existing result for this post" onClick={event => { if (event.nativeEvent.isTrusted) void store.openResult(existing.id); }}><ExternalLinkIcon /></Button>}</div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!!draft.busy} onClick={event => { if (event.nativeEvent.isTrusted) void store.inspect(draft.sourceId); }}>Inspect again</Button>{draft.inspection && <Button size="sm" disabled={!!draft.busy} onClick={event => { if (event.nativeEvent.isTrusted) void store.enqueue(draft.sourceId); }}>{draft.busy === 'enqueue' ? 'Adding…' : `Add to queue · ${draft.selected.length} media`}</Button>}</div></> : <><p className="text-xs text-muted-foreground">Keep browsing while tasks run.</p><Button size="sm" variant="ghost" onClick={event => { if (event.nativeEvent.isTrusted) void store.refresh(); }}>Refresh status</Button></>}
        </CardFooter>
      </Card>}
  </aside>;
}
