import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, CheckCircle2Icon, CircleAlertIcon, LoaderCircleIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, FileIcon, ImageIcon, InboxIcon, Trash2Icon, VideoIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription } from '@/components/ui/item';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { availability, errorMessage, type Snapshot, type Delivery } from '@locus/capture-core/model';
import { bilibiliPresentation } from '@locus/bilibili/presentation';
import { twitterPresentation } from '@locus/twitter/presentation';
import { CaptureStatusBadge } from '@/ui/shared/CaptureStatusBadge';
import { getResultCaptureStatus } from '@/ui/shared/capture-status';
import { acquisitionLabel, deliveryLabels, exactTime, fileSize, retentionLabel, safeSource, sourceName } from './presentation';

export function Failure({ title, message }: { title: string; message: string }) { return <Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>; }
function Pending({ title, message }: { title: string; message: string }) { return <Alert><LoaderCircleIcon /><AlertTitle>{title}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>; }
function AcquisitionBadge({ state }: { state: string }) {
  const Icon = state === 'acquired' ? CheckCircle2Icon : state === 'pending' ? LoaderCircleIcon : CircleAlertIcon;
  return <Badge variant={state === 'acquired' ? 'success' : state === 'pending' ? 'info' : 'destructive'}><Icon data-icon="inline-start" />{acquisitionLabel(state)}</Badge>;
}
function FilePreview({ blob, label }: { blob: Blob; label: string }) {
  const [url, setUrl] = useState('');const [failed, setFailed] = useState(false);
  useEffect(() => { const objectUrl = URL.createObjectURL(blob);setUrl(objectUrl);setFailed(false);return () => URL.revokeObjectURL(objectUrl); }, [blob]);
  if (!url) return <Skeleton className="h-48 w-full" />;
  if (failed) return <Alert><AlertTitle>Preview unavailable</AlertTitle><AlertDescription>This file could not be previewed. Its acquired bytes remain available for export.</AlertDescription></Alert>;
  if (blob.type.startsWith('image/')) return <img className="max-h-[28rem] w-full rounded-lg bg-muted object-contain" src={url} alt={label} onError={() => setFailed(true)} />;
  if (blob.type === 'video/mp4') return <video className="max-h-[28rem] w-full rounded-lg bg-muted" src={url} controls preload="metadata" aria-label={label} onError={() => setFailed(true)} />;
  return <p className="text-sm text-muted-foreground">No preview for this encoding. Export the acquired file to open it elsewhere.</p>;
}
function Preview({ snapshot }: { snapshot: Snapshot }) {
  const { result, blobs, readErrors } = snapshot;
  const acquiredFiles = result.assets.filter(asset => asset.acquisition.state === 'acquired').length;
  const previewAssets=result.site==='bilibili'?[...result.assets].sort((a,b)=>Number(b.id==='media-2')-Number(a.id==='media-2')):result.assets;
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
    {result.records.map(record => {
      const post = result.site === 'twitter' && record.acquisition.state === 'acquired' ? twitterPresentation(record.payload) : null;
      const part=result.site==='bilibili'&&record.acquisition.state==='acquired'?bilibiliPresentation(record.payload):null;
      return <article key={record.id} className="flex flex-col gap-5">
        {post && <><header className="flex items-center gap-3"><Avatar size="lg"><AvatarFallback>{(post.displayName ?? post.username ?? 'X').slice(0,2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="font-medium">{post.displayName ?? post.username ?? 'Author unknown'}</p><p className="text-sm text-muted-foreground">{post.username ? `@${post.username}` : 'Username unknown'}{post.publishedAt ? ` · ${exactTime(post.publishedAt)}` : ' · Publication time unknown'}</p></div></header><div className="whitespace-pre-wrap break-words text-base leading-7">{post.text || <span className="text-muted-foreground">Empty authored message</span>}</div></>}
        {part && <><header><h3 className="text-lg font-medium">{part.title}</h3><p className="text-sm text-muted-foreground">Uploader: {part.uploader ?? "Unknown"} · {part.part}</p><p className="text-sm text-muted-foreground">{part.quality}</p></header><p className="whitespace-pre-wrap break-words">{part.description || "Empty authored description"}</p></>}{!post && !part && record.acquisition.state === 'acquired' && <Alert><AlertTitle>Record available</AlertTitle><AlertDescription>This record has no supported text preview. Its full payload is available in Metadata.</AlertDescription></Alert>}
        {record.acquisition.state === 'pending' && <Pending title="Content is still being acquired" message={record.acquisition.reason ?? 'The producer has not supplied the message yet.'} />}
        {record.acquisition.state === 'unavailable' && <Failure title="Content unavailable" message={record.acquisition.reason ?? 'The producer could not supply the message.'} />}
      </article>;
    })}
    <section aria-label="Selected files" className="flex flex-col gap-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Selected files</h3><span className="text-xs text-muted-foreground">{result.assets.length ? `${acquiredFiles} of ${result.assets.length} acquired` : 'Text-only capture'}</span></div>
      {!result.assets.length && <p className="text-sm text-muted-foreground">Only the message and metadata were selected. No media files are missing.</p>}
      <ItemGroup>{previewAssets.map((asset, index) => <Item key={asset.id} variant="outline" className="flex-col items-stretch"><div className="flex items-center gap-3"><ItemMedia variant="icon">{asset.mime?.startsWith('image/') ? <ImageIcon /> : asset.mime?.startsWith('video/') ? <VideoIcon /> : <FileIcon />}</ItemMedia><ItemContent><ItemTitle>{result.site==='bilibili'&&asset.id==='media-1'?'Parent cover':asset.mime?.startsWith('image/') ? 'Image' : asset.mime?.startsWith('video/') ? 'Video' : 'File'} {index + 1}</ItemTitle><ItemDescription>{asset.mime ? `${asset.mime} · ${fileSize(asset.size)}` : asset.id}</ItemDescription></ItemContent><AcquisitionBadge state={asset.acquisition.state} /></div>
        {asset.acquisition.reason && <Failure title="Selected file unavailable" message={asset.acquisition.reason} />}
        {readErrors[asset.id] && <Failure title="File read failed" message={`${readErrors[asset.id]}. Retry reads to try again; acquisition has not changed.`} />}
        {blobs[asset.id] && <FilePreview blob={blobs[asset.id]!} label={`Selected file ${index + 1} (${asset.id})`} />}
      </Item>)}</ItemGroup>
    </section>
  </div>;
}
function Activity({ snapshot, deliveries }: { snapshot: Snapshot; deliveries: Delivery[] }) {
  const { result } = snapshot;const state = availability(result);
  const AcquisitionIcon = state.complete ? CheckCircle2Icon : state.pending ? LoaderCircleIcon : CircleAlertIcon;
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 p-5 sm:p-8"><section className="flex flex-col gap-3"><h3 className="font-medium">Capture & storage</h3><ItemGroup><Item variant="outline"><ItemMedia variant="icon"><AcquisitionIcon /></ItemMedia><ItemContent><ItemTitle>Acquisition · {state.complete ? 'Complete' : state.pending ? 'In progress' : state.acquired ? 'Partial capture' : 'Unavailable'}</ItemTitle><ItemDescription>{state.acquired} of {result.records.length + result.assets.length} selected message/file portions acquired. Captured {exactTime(result.createdAt)}.</ItemDescription></ItemContent></Item><Item variant="outline"><ItemContent><ItemTitle>Retention · {retentionLabel(result.retention.state)}</ItemTitle><ItemDescription>{result.retention.state === 'retained' ? `Revision ${result.retention.revision} is saved on this device.` : `Only committed revision ${result.retention.revision} can be recovered after restart.`}{result.retention.reason && ` ${result.retention.reason}`}</ItemDescription></ItemContent></Item></ItemGroup></section>
    <section className="flex flex-col gap-3"><h3 className="font-medium">Exports</h3>{!deliveries.length && <p className="text-sm text-muted-foreground">No export requested for this capture.</p>}<ItemGroup>{deliveries.map(delivery => <Item key={delivery.id} variant="outline"><ItemMedia variant="icon"><DownloadIcon /></ItemMedia><ItemContent><ItemTitle>{deliveryLabels[delivery.state]}</ItemTitle><ItemDescription className="line-clamp-none break-words">{exactTime(delivery.createdAt)} · revision {delivery.revision}<br />{delivery.partial ? 'Snapshot includes available content and identifies missing portions.' : 'Complete capture snapshot.'}{delivery.reason && <><br />{delivery.reason}</>}</ItemDescription></ItemContent></Item>)}</ItemGroup><p className="text-xs leading-relaxed text-muted-foreground">A download is complete only when Chrome confirms it. Later capture progress does not change an exported snapshot.</p></section>
  </div>;
}
function DetailTabs({ snapshot, deliveries, onNotice, tab, onTab }: { snapshot: Snapshot; deliveries: Delivery[]; onNotice: (message:string) => void; tab:string; onTab:(value:string)=>void }) {
  const metadata = useMemo(() => JSON.stringify({ result: snapshot.result, receiverReadErrors: snapshot.readErrors }, null, 2), [snapshot.result, snapshot.readErrors]);
  return <Tabs value={tab} onValueChange={value=>onTab(String(value))} className="min-h-0 flex-1 gap-0"><div className="shrink-0 border-b px-5 sm:px-8"><TabsList variant="line" aria-label="Capture details"><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="metadata">Metadata</TabsTrigger><TabsTrigger value="activity">Activity{deliveries.length > 0 && <span className="text-xs">({deliveries.length})</span>}</TabsTrigger></TabsList></div>
    <TabsContent value="preview" className="min-h-0 overflow-hidden"><ScrollArea className="h-full"><Preview snapshot={snapshot} /></ScrollArea></TabsContent>
    <TabsContent value="metadata" className="min-h-0 overflow-hidden"><ScrollArea className="h-full"><div className="flex flex-col gap-4 p-5 sm:p-8"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">Capture metadata</h3><p className="mt-1 text-sm text-muted-foreground">Full site payloads, selected-file associations, and read outcomes. File bytes are exported separately.</p></div><Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(metadata).then(() => onNotice('Metadata copied.')).catch(error => onNotice(`Could not copy metadata: ${errorMessage(error)}`))}><CopyIcon data-icon="inline-start" />Copy JSON</Button></div><pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">{metadata}</pre></div></ScrollArea></TabsContent>
    <TabsContent value="activity" className="min-h-0 overflow-hidden"><ScrollArea className="h-full"><Activity snapshot={snapshot} deliveries={deliveries} /></ScrollArea></TabsContent>
  </Tabs>;
}

export function CaptureInspector({ selected, snapshot, queuePosition, readError, collectionError, delivery, busy, onExport, onClear, onRetry, onNotice }: { selected:string; snapshot?:Snapshot|null; queuePosition?:number; readError:string; collectionError:string; delivery:Delivery[]; busy:string; onExport:()=>void; onClear:()=>void; onRetry:()=>void; onNotice:(message:string)=>void }) {
  const result=snapshot?.result;const state=result && availability(result);
  const captureStatus=result && (queuePosition !== undefined ? 'queued' : getResultCaptureStatus(result));
  const [tab,setTab]=useState('preview');useEffect(()=>setTab('preview'),[selected]);
  const deliveries=delivery.filter(item=>item.resultId===selected);
  const latest=[...deliveries].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const deliveryConcern=latest && (['failed','interrupted','unverified'].includes(latest.state)||!!latest.reason);
  return <section aria-label="Capture inspection" className="flex h-full min-h-0 min-w-0 flex-col bg-background">
    <header className="flex shrink-0 flex-col gap-3 border-b px-5 py-4 sm:px-8"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon-sm" aria-label="Back to captures" className="md:hidden" onClick={() => { location.hash = ''; }}><ArrowLeftIcon /></Button><div className="min-w-0"><p className="text-xs text-muted-foreground">{result ? sourceName(result.sourceUrl) : 'Your library'}</p><h2 className="truncate text-sm font-medium">{result?.label ?? (selected ? 'Selected capture' : 'Capture preview')}</h2></div></div>{result && <div className="flex shrink-0 items-center gap-1">{safeSource(result.sourceUrl) && <a href={safeSource(result.sourceUrl)} target="_blank" rel="noreferrer" className={buttonVariants({variant:'ghost',size:'icon-sm'})} aria-label="Open source post" title="Open source post"><ExternalLinkIcon className="size-4" /></a>}<Button variant="ghost" size="icon-sm" aria-label="Clear result" title="Clear result" disabled={!!busy} onClick={onClear}><Trash2Icon /></Button></div>}</div>
      {result && captureStatus && <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-1.5"><CaptureStatusBadge state={captureStatus} />{captureStatus !== 'saved' && <Badge variant={result.retention.state === 'failed' ? 'destructive' : result.retention.state === 'pending' ? 'info' : 'outline'}>{result.retention.state === 'retained' && result.retention.revision !== result.revision ? `Saved revision ${result.retention.revision}` : retentionLabel(result.retention.state)}</Badge>}</div><Button size="sm" disabled={!!busy || !state?.acquired} onClick={onExport}><DownloadIcon data-icon="inline-start" />{busy === 'export' ? 'Preparing export…' : state?.complete ? 'Export ZIP' : 'Export available content'}</Button></div>}
      {latest && <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>Latest export: {deliveryLabels[latest.state]} · revision {latest.revision}</span><Button variant="link" size="sm" onClick={()=>setTab('activity')}>View export activity</Button></div>}
      {deliveryConcern && <Alert variant={latest.state==='failed'||latest.state==='interrupted'?'destructive':'default'}><AlertTitle>{deliveryLabels[latest.state]}</AlertTitle><AlertDescription>{latest.reason ?? 'Check Chrome downloads for the actual delivery outcome. Your captured content remains available.'}</AlertDescription></Alert>}
    </header>
    {(readError || (result && result.retention.state !== 'retained')) && <div className="shrink-0 px-5 pt-4 sm:px-8">{readError && <Failure title="Result read failed" message={`${readError}. Existing preview content may be older. Retry reads to try again.`} />}{result?.retention.state === 'failed' && <Failure title="Current content is not saved" message={`${result.retention.reason ?? 'Persistence failed'}. Only committed revision ${result.retention.revision} is recoverable after restart. Available content can still be exported.`} />}{result?.retention.state === 'pending' && <Pending title="Saving current content" message={`${result.retention.reason ?? 'Persistence is pending'}. Only committed revision ${result.retention.revision} is recoverable after restart. Available content can still be exported.`} />}<Button variant="link" size="sm" onClick={onRetry}>Retry reads</Button></div>}
    {snapshot && <DetailTabs key={snapshot.result.id} snapshot={snapshot} deliveries={deliveries} onNotice={onNotice} tab={tab} onTab={setTab} />}
    {!selected && <Empty className="m-auto max-w-md"><EmptyHeader><EmptyMedia variant="icon"><InboxIcon /></EmptyMedia><EmptyTitle>Select a capture</EmptyTitle><EmptyDescription>Read the message, inspect its files, and export what you’ve captured. Your source page can stay closed.</EmptyDescription></EmptyHeader></Empty>}
    {selected && snapshot === undefined && !readError && !collectionError && <div className="flex flex-col gap-5 p-8" aria-label="Reading selected capture"><Skeleton className="h-10 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /></div>}
    {selected && snapshot === null && <Empty className="m-auto max-w-md"><EmptyHeader><EmptyTitle>Capture no longer exists</EmptyTitle><EmptyDescription>It may have been cleared. Choose another capture from the library.</EmptyDescription></EmptyHeader></Empty>}
  </section>;
}
