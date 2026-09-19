import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CaptureStatusBadge } from '@/ui/shared/CaptureStatusBadge';
import { CaptureStore } from '@/ui/twitter/capture-store';
import { CaptureQueuePanel } from '@/ui/twitter/CaptureQueuePanel';
import { coordinator, type SourceStatus } from '@/host/chrome/protocol';
import { partUrl } from '@locus/bilibili/urls';
import { biliIdentity } from '@/host/chrome/bilibili-protocol';
import styles from '@/assets/tailwind.css?inline';

export function mountBilibiliControls() {
  const global = globalThis as typeof globalThis & { __locusBilibiliMounted?: boolean };
  if (global.__locusBilibiliMounted || biliIdentity(location.href)) return; global.__locusBilibiliMounted = true;
  const store = new CaptureStore(); let current = '', stopped = false, lookupBusy = false;
  const host = document.createElement('div'); host.dataset.locusBilibili = 'true';
  const shadow = host.attachShadow({ mode: 'open' }), style = document.createElement('style'); style.textContent = styles.replaceAll(':root', ':host'); shadow.append(style);
  const control = document.createElement('div'); control.className = 'dark'; shadow.append(control); const root = createRoot(control);
  const queueHost = document.createElement('div'); queueHost.dataset.locusBilibiliQueue = 'true'; queueHost.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none';
  const queueShadow = queueHost.attachShadow({ mode: 'open' }); queueShadow.append(style.cloneNode(true)); const queue = document.createElement('div'); queue.className = 'dark'; queue.style.colorScheme = 'dark'; queueShadow.append(queue); document.documentElement.append(queueHost); const queueRoot = createRoot(queue); queueRoot.render(<CaptureQueuePanel store={store} />);
  const isolatedEvents=['click','pointerdown','pointerup','keydown','keyup'];const isolate=(event:Event)=>event.stopPropagation();for(const name of isolatedEvents)queueHost.addEventListener(name,isolate);
  function Control() {
    useSyncExternalStore(store.subscribe, store.snapshot); const selected = partUrl(current), status = store.sourceStatus(selected.id);
    return <Button size="sm" variant="ghost" title={`Capture P${selected.p}: metadata, cover and AVC/AAC video. Current limits: 600 seconds, 64 MiB per track. ${status.message}`} aria-label={`Locus capture P${selected.p}`} onClick={event => { event.preventDefault(); event.stopPropagation(); if (!event.nativeEvent.isTrusted || event.detail > 1) return; try { const now = partUrl(location.href); void store.quickCapture(now.url); } catch {} }} onKeyDown={event => { if (event.repeat) event.preventDefault(); event.stopPropagation(); }}><DownloadIcon data-icon="inline-start" />Capture P{selected.p}<CaptureStatusBadge state={status.state} /></Button>;
  }
  async function lookup() {
    if (!current || lookupBusy || stopped) return; const url = current; lookupBusy = true;
    try { const rows = await coordinator<SourceStatus[]>('source-status', { urls: [url] }); if (!stopped) store.sourceResults([url], rows); }
    catch (error) { if (!stopped) store.sourceResults([url], undefined, error instanceof Error ? error.message : 'Source status unavailable'); }
    finally { lookupBusy = false; }
  }
  function scan() {
    if (stopped) return; let url: string; try { url = partUrl(location.href).url; } catch { host.remove(); return; }
    const toolbar = document.querySelector('#arc_toolbar_report .video-toolbar-left-main'); if (!toolbar) { host.remove(); return; }
    const changed = current !== url; current = url; if (!host.isConnected || host.parentElement !== toolbar) toolbar.append(host);
    root.render(<Control />); store.retainSources([partUrl(url).id]); if (changed) void lookup();
    if (!queueHost.isConnected) document.documentElement.append(queueHost);
  }
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => { if (!scanTimer) scanTimer = setTimeout(() => { scanTimer = undefined; scan(); }, 150); }); observer.observe(document.documentElement, { subtree: true, childList: true });
  const timer = setInterval(() => { scan(); void lookup(); }, 15000); store.start(); scan();
  function revoke(message:{target?:string;op?:string}) {if(message?.target==='page'&&message.op==='revoke')stop();}
  function stop() { if (stopped) return; stopped = true; observer.disconnect(); clearInterval(timer); clearTimeout(scanTimer);chrome.runtime.onMessage.removeListener(revoke);removeEventListener('pagehide',stop);for(const name of isolatedEvents)queueHost.removeEventListener(name,isolate);store.stop(); root.unmount(); queueRoot.unmount(); host.remove(); queueHost.remove(); global.__locusBilibiliMounted = false; }
  chrome.runtime.onMessage.addListener(revoke); addEventListener('pagehide', stop, { once: true });
}
