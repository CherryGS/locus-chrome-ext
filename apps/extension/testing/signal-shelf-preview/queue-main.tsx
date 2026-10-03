import './fixture.js';
import { createRoot } from 'react-dom/client';
import { CaptureQueuePanel } from '@/ui/capture/CaptureQueuePanel';
import type { CaptureStore, QueueView } from '@/ui/capture/capture-store';
import type { ResultSummary } from '@/host/chrome/protocol';
import { CaptureActionGlyph } from '@/ui/shared/CaptureActionGlyph';
import { CaptureStatusBadge } from '@/ui/shared/CaptureStatusBadge';
import { captureStates, type CaptureState } from '@/ui/shared/capture-status';
import { Button } from '@/components/ui/button';
import '@/assets/tailwind.css';

const rows = (globalThis as unknown as { __inbox: { rows: ResultSummary[] } }).__inbox.rows;
let view: QueueView = { visible:true, expanded:false, drafts:{}, tasks:rows.map(summary=>({summary,sourceId:summary.id,error:''})),error:'' };
const listeners = new Set<()=>void>();
const update = (expanded:boolean) => { view={...view,expanded}; listeners.forEach(listener=>listener()); };
// A UI-only adapter: no acquisition, storage, grants or native result-page opening.
const store = {
  subscribe(listener:()=>void) { listeners.add(listener); return ()=>{listeners.delete(listener);}; },
  snapshot:()=>view,
  showQueue:()=>update(true),
  minimize:()=>update(false),
  refresh:async()=>{},
  openResult:async(id:string)=>{ location.href=`/#${encodeURIComponent(id)}`; },
} as unknown as CaptureStore;
const root = document.getElementById('root')!;
function QueuePreview() {
  return <>
    <main style={{padding:32,maxWidth:800}}>
      <h1 style={{fontSize:24,fontWeight:650}}>Production queue and capture glyphs</h1>
      <p style={{margin:'16px 0',color:'var(--muted-foreground)'}}>Disposable synthetic source surface. Open the floating queue; these controls do not capture or send content.</p>
      <section style={{display:'flex',flexDirection:'column',gap:16}} aria-label="Capture control states">
        {(['uncaptured','saved','locus-saved','failed','partial','importing'] as CaptureState[]).map(state=><div key={state} style={{display:'flex',alignItems:'center',gap:16}}>
          <Button variant="outline" size="icon-lg" aria-label={`Capture glyph: ${captureStates[state].label}`}><CaptureActionGlyph state={state} percent={state==='importing'?64:undefined}/></Button>
          <CaptureStatusBadge state={state}/>
        </div>)}
      </section>
    </main>
    <CaptureQueuePanel store={store} portalContainer={root}/>
  </>;
}
createRoot(root).render(<QueuePreview/>);
