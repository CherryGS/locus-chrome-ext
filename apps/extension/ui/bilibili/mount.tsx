import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { CaptureStore } from '@/ui/twitter/capture-store';
import { CaptureQueuePanel } from '@/ui/twitter/CaptureQueuePanel';
import { coordinator, type SourceStatus } from '@/host/chrome/protocol';
import { biliIdentity } from '@/host/chrome/bilibili-protocol';
import { findBilibiliCandidates, presentationAttributes, readBilibiliCandidate, type BilibiliCandidate } from './candidates';
import { CaptureAction } from './CaptureAction';
import styles from '@/assets/tailwind.css?inline';
import controlStyles from './controls.css?inline';

interface MountedAction { candidate: BilibiliCandidate; slot: HTMLDivElement; key: string; activationSource?: string }

export function mountBilibiliControls() {
  const global = globalThis as typeof globalThis & { __locusBilibiliMounted?: boolean };
  if (global.__locusBilibiliMounted || biliIdentity(location.href)) return;
  global.__locusBilibiliMounted = true;
  const store = new CaptureStore(), mounts = new Map<HTMLElement, MountedAction>();
  let stopped = false, lookupBusy = false, lookupQueued = false, lastSources = '';
  let scanTimer: ReturnType<typeof setTimeout> | undefined, lookupTimer: ReturnType<typeof setTimeout> | undefined;
  const sheet = document.createElement('style'); sheet.textContent = controlStyles; document.documentElement.append(sheet);
  const host = document.createElement('div'); host.dataset.locusBilibiliQueue = 'true'; host.id = `locus-bilibili-queue-${crypto.randomUUID()}`;
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' }), style = document.createElement('style'); style.textContent = styles.replaceAll(':root', ':host'); shadow.append(style);
  const queue = document.createElement('div'); queue.className = 'dark'; shadow.append(queue); document.documentElement.append(host);
  const root = createRoot(queue);
  const isolatedEvents = ['click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup'];
  const isolate = (event: Event) => event.stopPropagation();
  for (const name of isolatedEvents) host.addEventListener(name, isolate);

  function Surface() {
    const view = useSyncExternalStore(store.subscribe, store.snapshot);
    return <><CaptureQueuePanel store={store} />{[...mounts.values()].map(mounted => {
      const { candidate, slot, key } = mounted, status = store.sourceStatus(candidate.source.id);
      slot.dataset.persistent = String(!['uncaptured', 'checking'].includes(status.state));
      return createPortal(<CaptureAction candidate={candidate} {...status} queueId={host.id}
        expanded={view.expanded && view.selected === candidate.source.id}
        activate={event => {
          event.preventDefault(); event.stopPropagation();
          if (!event.nativeEvent.isTrusted) return;
          // Lists recycle nodes and links. Rebind on activation before the next
          // observer scan, without retargeting already accepted work.
          const current = readBilibiliCandidate(candidate.owner);
          if (!current || slot.parentElement !== current.target) { scan(); return; }
          if (event.detail > 1 && mounted.activationSource === current.source.id) return;
          mounted.activationSource = current.source.id;
          void store.quickCapture(current.source.url); scan();
        }} />, slot, key);
    })}</>;
  }
  function remove(mounted: MountedAction) {
    mounted.slot.remove();
    if (mounted.candidate.kind === 'cover') delete mounted.candidate.target.dataset.locusBilibiliCover;
    mounts.delete(mounted.candidate.owner);
  }
  function present(mounted: MountedAction) {
    const { candidate, slot } = mounted, native = candidate.reference;
    if (slot.parentElement !== candidate.target) candidate.target.append(slot);
    if (candidate.kind === 'cover') candidate.target.dataset.locusBilibiliCover = 'true';
    const className = candidate.kind === 'toolbar' ? 'toolbar-left-item-wrap' : '';
    if (slot.className !== className) slot.className = className;
    for (const [key, value] of Object.entries(presentationAttributes(native?.parentElement))) if (slot.getAttribute(key) !== value) slot.setAttribute(key, value);
    const theme = getComputedStyle(queue);
    for (const tone of ['info', 'success', 'warning', 'destructive']) slot.style.setProperty(`--locus-${tone}`, theme.getPropertyValue(`--${tone}`));
    slot.style.setProperty('--locus-marker-ink', theme.getPropertyValue('--background'));
    const look = native ? getComputedStyle(native) : getComputedStyle(candidate.target);
    slot.style.setProperty('--locus-native-color', candidate.kind === 'toolbar' ? look.getPropertyValue('--text2').trim() || look.color : look.color);
    slot.style.setProperty('--locus-native-background', native ? look.backgroundColor : theme.getPropertyValue('--card'));
    slot.style.setProperty('--locus-native-radius', look.borderRadius);
    slot.style.setProperty('--locus-native-size', candidate.kind === 'toolbar' ? native?.querySelector('svg') ? getComputedStyle(native.querySelector('svg')!).width : '36px' : '20px');
    const nativeLabel = native?.querySelector('.video-toolbar-item-text');
    if (nativeLabel) slot.style.setProperty('--locus-native-font', getComputedStyle(nativeLabel).font);
  }
  function scheduleLookup() { if (!stopped && !lookupTimer) lookupTimer = setTimeout(() => { lookupTimer = undefined; void lookup(); }, 200); }
  async function lookup() {
    if (stopped) return;
    if (lookupBusy) { lookupQueued = true; return; }
    const urls = [...new Set([...mounts.values()].map(mounted => mounted.candidate.source.url))];
    if (!urls.length) return; lookupBusy = true;
    try {
      for (let index = 0; index < urls.length && !stopped; index += 50) {
        const batch = urls.slice(index, index + 50);
        try { const rows = await coordinator<SourceStatus[]>('source-status', { urls: batch }); if (!stopped) store.sourceResults(batch, rows); }
        catch (error) { if (!stopped) store.sourceResults(batch, undefined, error instanceof Error ? error.message : 'Source status unavailable'); }
      }
    } finally { lookupBusy = false; if (lookupQueued) { lookupQueued = false; scheduleLookup(); } }
  }
  function scan() {
    if (stopped) return;
    const candidates = findBilibiliCandidates();
    for (const mounted of mounts.values()) if (!candidates.some(candidate => candidate.owner === mounted.candidate.owner && candidate.target === mounted.candidate.target)) remove(mounted);
    for (const candidate of candidates) {
      let mounted = mounts.get(candidate.owner);
      if (!mounted) {
        const slot = document.createElement('div'); slot.dataset.locusBilibili = candidate.kind;
        for (const name of isolatedEvents) slot.addEventListener(name, isolate);
        mounted = { candidate, slot, key: crypto.randomUUID() }; mounts.set(candidate.owner, mounted);
      }
      mounted.candidate = candidate; present(mounted);
    }
    if (!host.isConnected) document.documentElement.append(host);
    if (!sheet.isConnected) document.documentElement.append(sheet);
    root.render(<Surface />);
    const sources = candidates.map(candidate => candidate.source.id); store.retainSources(sources);
    const signature = sources.join('|');
    if (signature !== lastSources) { lastSources = signature; scheduleLookup(); }
    if (candidates.length) store.start();
  }
  const observer = new MutationObserver(records => {
    if (records.every(record => record.target instanceof Element && !!record.target.closest('[data-locus-bilibili],[data-locus-bilibili-queue]'))) return;
    if (!scanTimer) scanTimer = setTimeout(() => { scanTimer = undefined; scan(); }, 150);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'class'] });
  const timer = setInterval(() => { scan(); void lookup(); }, 15000);
  function revoke(message: { target?: string; op?: string }) { if (message?.target === 'page' && message.op === 'revoke') stop(); }
  function stop() {
    if (stopped) return; stopped = true; observer.disconnect(); clearInterval(timer); clearTimeout(scanTimer); clearTimeout(lookupTimer);
    chrome.runtime.onMessage.removeListener(revoke); removeEventListener('pagehide', stop);
    for (const name of isolatedEvents) host.removeEventListener(name, isolate);
    store.stop(); root.unmount(); for (const mounted of mounts.values()) remove(mounted); host.remove(); sheet.remove(); global.__locusBilibiliMounted = false;
  }
  chrome.runtime.onMessage.addListener(revoke); addEventListener('pagehide', stop, { once: true }); scan();
}
