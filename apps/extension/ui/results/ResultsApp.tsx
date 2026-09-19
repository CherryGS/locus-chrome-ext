import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { XIcon } from 'lucide-react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useResultsState } from './useResultsState';
import { LibrarySidebar } from './LibrarySidebar';
import { CaptureList } from './CaptureList';
import { CaptureInspector, Failure } from './CaptureInspector';
import { resultView, type LibraryView } from './presentation';

export function ResultsApp() {
  const state=useResultsState();
  const [view,setView]=useState<LibraryView>('all');const [query,setQuery]=useState('');const [oldest,setOldest]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(()=>matchMedia('(min-width: 1200px)').matches);
  useEffect(()=>{const media=matchMedia('(min-width: 1200px)');const changed=()=>setSidebarOpen(media.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
  const filtered=useMemo(()=>state.collection?.items.filter(item=>(view==='all'||resultView(item)===view)&&`${item.label} ${item.sourceUrl}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>oldest?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt)),[state.collection,view,query,oldest]);
  return <TooltipProvider delay={300}><SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={{'--sidebar-width':'13rem'} as CSSProperties} className="h-svh min-h-0 overflow-hidden">
    <LibrarySidebar view={view} onView={next=>{setView(next);}} items={state.collection?.items} access={state.access} busy={state.busy} onEnable={()=>void state.enable()} />
    <SidebarInset className="h-svh min-w-0 overflow-hidden">
      {state.collectionError && <div className="shrink-0 border-b p-3"><Failure title="Collection access problem" message={`${state.collectionError}. Independently readable captures remain available. Use Retry reads.`} /></div>}
      {state.notice && <div className="shrink-0 border-b p-3"><Alert><AlertTitle>Library activity</AlertTitle><AlertDescription>{state.notice}</AlertDescription><Button className="absolute right-2 top-2" variant="ghost" size="icon-xs" aria-label="Dismiss notification" onClick={()=>state.setNotice('')}><XIcon /></Button></Alert></div>}
      <div className="flex min-h-0 min-w-0 flex-1"><div className={cn('h-full w-full shrink-0 md:w-[19rem] xl:w-[21rem]',state.selected?'hidden md:block':'block')}><CaptureList items={filtered} allCount={state.collection?.items.length} selected={state.selected} view={view} query={query} setQuery={setQuery} oldest={oldest} setOldest={setOldest} failed={!!state.collectionError} onRetry={()=>void state.refresh(true)} /></div><div className={cn('h-full min-w-0 flex-1',state.selected?'block':'hidden md:block')}><CaptureInspector queuePosition={state.collection?.items.find(item=>item.id===state.selected)?.queuePosition} selected={state.selected} snapshot={state.snapshot} readError={state.readError} collectionError={state.collectionError} delivery={state.delivery} busy={state.busy} onExport={()=>void state.exportResult()} onClear={()=>{if(state.snapshot){state.setClearError('');state.setClearTarget({id:state.snapshot.result.id,label:state.snapshot.result.label});}}} onRetry={()=>void state.refresh(true)} onNotice={state.setNotice} /></div></div>
    </SidebarInset>
    <AlertDialog open={!!state.clearTarget} onOpenChange={open=>{if(!open&&state.busy!=='clear')state.setClearTarget(undefined);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Clear {state.clearTarget?.label}?</AlertDialogTitle><AlertDialogDescription>Remove this capture’s retained files and metadata. Already exported files stay on your computer. An export that already received its snapshot may still finish.</AlertDialogDescription></AlertDialogHeader>{state.clearError && <Failure title="Could not clear capture" message={state.clearError} />}<AlertDialogFooter><AlertDialogCancel disabled={state.busy==='clear'}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={state.busy==='clear'} onClick={()=>void state.clear()}>{state.busy==='clear'?'Clearing…':'Confirm clear'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </SidebarProvider></TooltipProvider>;
}
