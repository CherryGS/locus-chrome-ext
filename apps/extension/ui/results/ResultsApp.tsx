import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster, toast } from '@/components/ui/toast';
import type { ResultFeedback } from './feedback';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useResultsState } from './useResultsState';
import { LibrarySidebar } from './LibrarySidebar';
import { CaptureList } from './CaptureList';
import { CaptureInspector, Failure } from './CaptureInspector';
import { resultView, viewLabels, type LibraryView } from './presentation';
import { LocusConnection } from './LocusConnection';

export function ResultsApp() {
  const [view,setView]=useState<LibraryView>('inbox');
  const [query,setQuery]=useState('');const [oldest,setOldest]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [revealId,setRevealId]=useState(location.hash.slice(1));
  const onFeedback=useCallback((feedback:ResultFeedback)=>{
    const id=toast.add({...feedback, actionProps:feedback.resultId?{children:'View capture',onClick:()=>{setRevealId(feedback.resultId!);setQuery('');location.hash=feedback.resultId!;toast.close(id);}}:undefined});
  },[]);
  const state=useResultsState(onFeedback);
  const previousSelection=useRef(state.selected);
  useEffect(()=>{
    if(previousSelection.current!==state.selected){previousSelection.current=state.selected;setRevealId(state.selected);}
  },[state.selected]);
  useEffect(()=>{
    if(!revealId)return;
    const item=state.collection?.items.find(item=>item.id===revealId);
    if(item){setView(resultView(item));setQuery('');setRevealId('');}
  },[revealId,state.collection]);
  function changeView(next:LibraryView){
    setRevealId('');setView(next);
    const item=state.collection?.items.find(item=>item.id===state.selected);
    if(state.selected && next!=='all' && (!item || resultView(item)!==next))location.hash='';
  }
  const selectedRow=state.collection?.items.find(item=>item.id===state.selected);
  const movedTo=selectedRow && view!=='all' && resultView(selectedRow)!==view ? resultView(selectedRow) : undefined;
  const [sidebarOpen,setSidebarOpen]=useState(()=>matchMedia('(min-width: 1200px)').matches);
  useEffect(()=>{const media=matchMedia('(min-width: 1200px)');const changed=()=>setSidebarOpen(media.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
  const filtered=useMemo(()=>state.collection?.items.filter(item=>(view==='all'||resultView(item)===view)&&`${item.label} ${item.sourceUrl}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>oldest?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt)),[state.collection,view,query,oldest]);
  return <Toaster><TooltipProvider delay={300}><SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={{'--sidebar-width':'13rem'} as CSSProperties} className="h-svh min-h-0 overflow-hidden">
    <LibrarySidebar view={view} onView={changeView} items={state.collection?.items} access={state.access} bilibiliAccess={state.bilibiliAccess} busy={state.busy} onEnable={site=>void state.enable(site)} />
    <SidebarInset className="h-svh min-w-0 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"><div className="min-w-0"><p className="text-sm font-semibold">Capture workspace</p><p className="truncate text-xs text-muted-foreground">Local staging · retained until you clear it</p></div><LocusConnection open={settingsOpen} onOpenChange={setSettingsOpen} /></header>
      {state.collectionError && <div className="shrink-0 border-b p-3"><Failure title="Collection access problem" message={`${state.collectionError}. Independently readable captures remain available. Use Retry reads.`} /></div>}

      <div className="flex min-h-0 min-w-0 flex-1"><div className={cn('h-full w-full shrink-0 md:w-[19rem] xl:w-[21rem]',state.selected?'hidden md:block':'block')}><CaptureList items={filtered} allCount={state.collection?.items.length} selected={state.selected} view={view} query={query} setQuery={setQuery} oldest={oldest} setOldest={setOldest} failed={!!state.collectionError} onSelect={id=>{previousSelection.current=id;setRevealId('');location.hash=id;}} onRetry={()=>void state.refresh(true)} /></div><div className={cn('h-full min-w-0 flex-1 flex-col',state.selected?'flex':'hidden md:flex')}>{movedTo && <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-5 py-2 text-xs"><span>This capture is now in {viewLabels[movedTo]}. Your preview stays open.</span><Button size="xs" variant="outline" onClick={()=>{setView(movedTo);setQuery('');}}>Show in {viewLabels[movedTo]}</Button></div>}<div className="min-h-0 flex-1"><CaptureInspector queuePosition={state.collection?.items.find(item=>item.id===state.selected)?.queuePosition} selected={state.selected} snapshot={state.snapshot} readError={state.readError} collectionError={state.collectionError} actionError={state.actionError} delivery={state.delivery} locus={state.locus} onContinueLocus={()=>void state.continueLocus()} onSettings={()=>setSettingsOpen(true)} busy={state.busy} onExport={()=>void state.exportResult()} onClear={()=>{if(state.snapshot){state.setClearError('');state.setClearTarget({id:state.snapshot.result.id,label:state.snapshot.result.label});}}} onRetry={()=>void state.refresh(true)} onNotice={state.setNotice} /></div></div></div>
    </SidebarInset>
    <AlertDialog open={!!state.clearTarget} onOpenChange={open=>{if(!open&&state.busy!=='clear')state.setClearTarget(undefined);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Clear {state.clearTarget?.label}?</AlertDialogTitle><AlertDialogDescription>Remove this capture’s retained files and metadata. Already exported files and Locus entries stay saved. An export that already received its snapshot may still finish.</AlertDialogDescription></AlertDialogHeader>{state.clearError && <Failure title="Could not clear capture" message={state.clearError} />}<AlertDialogFooter><AlertDialogCancel disabled={state.busy==='clear'}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={state.busy==='clear'} onClick={()=>void state.clear()}>{state.busy==='clear'?'Clearing…':'Confirm clear'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </SidebarProvider></TooltipProvider></Toaster>;
}
