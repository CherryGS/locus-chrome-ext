import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, type Snapshot, type Delivery } from '@locus/capture-core/model';
import { CHANNEL, coordinator, ownerRequest, type Collection, type ReadResponse } from '@/host/chrome/protocol';
import { TWITTER_ORIGINS } from '@locus/twitter/urls';
import { BILIBILI_ORIGINS } from '@locus/bilibili/urls';
export function useResultsState() {
  const [collection, setCollection] = useState<Collection>();
  const [collectionError, setCollectionError] = useState('');
  const [selected, setSelected] = useState(location.hash.slice(1));
  const [snapshot, setSnapshot] = useState<Snapshot | null>();
  const [readError, setReadError] = useState('');
  const [delivery, setDelivery] = useState<Delivery[]>([]);
  const [access, setAccess] = useState<boolean>(); const [bilibiliAccess,setBilibiliAccess]=useState<boolean>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [clearTarget, setClearTarget] = useState<{ id: string; label: string }>();
  const [clearError, setClearError] = useState('');
  const lastRevision = useRef('');
  const readGeneration = useRef(0);
  const refreshInFlight = useRef(false);
  const queuedReadRetry = useRef(false);
  const currentId = useRef(selected); currentId.current = selected;
  const refresh = useCallback(async function refreshNow(force = false): Promise<void> {
    if (refreshInFlight.current) { if (force) queuedReadRetry.current = true; return; }
    refreshInFlight.current = true;
    const generation = ++readGeneration.current;
    try {
      const value = await ownerRequest<Collection>('list'); if (generation !== readGeneration.current) return; setCollection(value); setCollectionError(value.storageError ?? '');
      const id = currentId.current;
      setDelivery(value.deliveries.filter(d => d.resultId === id));
      if (id) {
        const row = value.items.find(item => item.id === id);
        const revision = `${id}:${row?.revision}:${row?.retention.state}`;
        if (force || revision !== lastRevision.current) {
          try { const read = await ownerRequest<ReadResponse>('read', id); if (currentId.current !== id || generation !== readGeneration.current) return; setSnapshot(read.snapshot); setDelivery(read.deliveries); setReadError(''); lastRevision.current = revision; }
          catch (error) { if (currentId.current === id && generation === readGeneration.current) setReadError(errorMessage(error)); }
        }
      }
    } catch (error) { if (generation === readGeneration.current) setCollectionError(errorMessage(error)); }
    finally { refreshInFlight.current = false; if (queuedReadRetry.current) { queuedReadRetry.current = false; void refreshNow(true); } }
  }, []);
  useEffect(() => {
    const hash = () => { ++readGeneration.current; const id = location.hash.slice(1); currentId.current = id; setSelected(id); setSnapshot(undefined); setDelivery([]); setReadError(''); lastRevision.current = ''; };
    window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash);
  }, []);
  useEffect(() => { void refresh(true); }, [selected, refresh]);
  useEffect(() => {
    void chrome.permissions.contains({ origins: TWITTER_ORIGINS }).then(setAccess);void chrome.permissions.contains({origins:BILIBILI_ORIGINS}).then(setBilibiliAccess);
    void coordinator('reconcile').catch(error => setNotice(errorMessage(error)));
    const channel = new BroadcastChannel(CHANNEL); channel.onmessage = event => { if (event.data?.changed) void refresh(); };
    const timer = setInterval(() => { void refresh(); void chrome.permissions.contains({ origins: TWITTER_ORIGINS }).then(setAccess);void chrome.permissions.contains({origins:BILIBILI_ORIGINS}).then(setBilibiliAccess); }, 4000);
    return () => { channel.close(); clearInterval(timer); };
  }, [refresh]);
  async function enable(site:'twitter'|'bilibili'='twitter') {
    setBusy(site==='twitter'?'enable':'enable-bilibili'); setNotice('');
    try { const granted = await chrome.permissions.request({ origins: site==='twitter'?TWITTER_ORIGINS:BILIBILI_ORIGINS }); (site==='twitter'?setAccess:setBilibiliAccess)(granted); if (granted) await coordinator('activate'); else setNotice('Site access was not granted. Local results remain available.'); }
    catch (error) { setNotice(errorMessage(error)); } finally { setBusy(''); }
  }
  async function exportResult() {
    if (!snapshot) return; setBusy('export'); setNotice('');
    try { await ownerRequest('export', snapshot.result.id); setNotice('Export accepted. Chrome may ask where to save; delivery is complete only after Chrome confirms it.'); await refresh(true); }
    catch (error) { setNotice(errorMessage(error)); } finally { setBusy(''); }
  }
  async function clear() {
    if (!clearTarget) return; const target = clearTarget; setBusy('clear');setClearError('');
    try { await ownerRequest('clear', target.id); ++readGeneration.current; setClearTarget(undefined); setNotice(`Cleared ${target.label}. Exported files were not removed.`); if (currentId.current === target.id) { setSnapshot(null); lastRevision.current = ''; } await refresh(true); }
    catch (error) { setClearError(`Clear failed: ${errorMessage(error)}`); } finally { setBusy(''); }
  }
  return { collection, collectionError, selected, snapshot, readError, delivery, access, bilibiliAccess, notice, setNotice, busy, clearTarget, setClearTarget, clearError, setClearError, refresh, enable, exportResult, clear };
}
