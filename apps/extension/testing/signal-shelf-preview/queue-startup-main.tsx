import './fixture.js';
import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import { CaptureQueuePanel } from '@/ui/capture/CaptureQueuePanel';
import { CaptureStore } from '@/ui/capture/capture-store';
import { Button } from '@/components/ui/button';
import type { Inspection, ResultSummary } from '@/host/chrome/protocol';
import styles from '@/assets/tailwind.css?inline';

const calls: string[] = [];
const scopes: string[][] = [];
const rows: ResultSummary[] = [];
const inspection: Inspection = {
  token: 'synthetic-full-scope', expiresAt: Date.now() + 60_000,
  sourceUrl: 'https://x.com/fixture/status/1000', label: 'Synthetic full-scope capture',
  textPreview: 'Synthetic text', textFailure: null,
  media: ['photo', 'video'].map(id=>({id, kind: id, sourceId: id, reason: null, quality: 'Synthetic'})),
};
// Disposable host adapter: the real CaptureStore executes its normal pipeline,
// but every host operation is intercepted without acquisition or persistence.
chrome.runtime.sendMessage = (async (message: {op: string; selected?: string[]}) => {
  calls.push(message.op);
  if (message.op === 'inspect') return {ok: true, value: inspection};
  if (message.op === 'capture') {
    scopes.push(message.selected ?? []);
    const row: ResultSummary = {
      id: 'synthetic-full-scope', label: inspection.label, sourceUrl: inspection.sourceUrl,
      createdAt: new Date().toISOString(), revision: 1, acquisition: 'complete',
      retention: {state: 'retained', revision: 1}, locus: {state: 'configuration-required', message: 'Synthetic staging'},
    };
    rows.splice(0, rows.length, row);
    return {ok: true, value: row};
  }
  if (message.op === 'capture-tasks') return {ok: true, value: [...rows]};
  if (message.op === 'status') return {ok: true, value: rows[0] ?? null};
  return {ok: true};
}) as typeof chrome.runtime.sendMessage;

const shadow = document.getElementById('root')!.attachShadow({mode: 'open'});
const style = document.createElement('style');
style.textContent = styles.replaceAll(':root', ':host');
const root = document.createElement('div');
root.className = 'dark';
root.style.colorScheme = 'dark';
shadow.append(style, root);
const store = new CaptureStore();
function StartupPreview() {
  useSyncExternalStore(store.subscribe, store.snapshot);
  return <>
    <main className="flex max-w-xl flex-col gap-4 p-6">
      <h1>Queue startup fixture</h1>
      <p>Authorized source startup simulation. No real capture, storage or Locus requests.</p>
      <Button onClick={event=>{
        if (event.nativeEvent.isTrusted) void store.quickCapture(inspection.sourceUrl);
      }}>Capture all (synthetic)</Button>
      <output aria-live="polite">
        {scopes.length} synthetic captures · latest scope: {scopes.at(-1)?.join(', ') ?? 'none'}
      </output>
      <output aria-label="Synthetic inspections">{calls.filter(op=>op==='inspect').length} synthetic inspections</output>
    </main>
    <CaptureQueuePanel store={store} portalContainer={root} />
  </>;
}
createRoot(root).render(<StartupPreview/>);
store.start();
window.addEventListener('pagehide', ()=>store.stop(), {once: true});
