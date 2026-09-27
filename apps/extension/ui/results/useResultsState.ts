import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, type Snapshot, type Delivery } from '@locus/capture-core/model';
import { CHANNEL, coordinator, ownerRequest, type Collection, type ReadResponse } from '@/host/chrome/protocol';
import { TWITTER_ORIGINS } from '@locus/twitter/urls';
import { BILIBILI_ORIGINS } from '@locus/bilibili/urls';
import type { LocusTransfer } from '@/host/locus/model';
import { createFeedbackObserver, type ResultFeedback } from './feedback';
export function useResultsState(onFeedback: (feedback: ResultFeedback) => void) {
  const [collection, setCollection] = useState<Collection>();
  const [collectionError, setCollectionError] = useState('');
  const [selected, setSelected] = useState(location.hash.slice(1));
  const [snapshot, setSnapshot] = useState<Snapshot | null>();
  const [readError, setReadError] = useState('');
  const [delivery, setDelivery] = useState<Delivery[]>([]);
  const [locus,setLocus]=useState<LocusTransfer>();
  const [access, setAccess] = useState<boolean>(); const [bilibiliAccess,setBilibiliAccess]=useState<boolean>();
  const feedback = useRef(onFeedback); feedback.current = onFeedback;
  const observer = useRef(createFeedbackObserver());
  const [readConcerns, setReadConcerns] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const operation = useRef(false);
  const setNotice = useCallback((message: string) => { if (message) feedback.current({ title: message }); }, []);
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
      const value = await ownerRequest<Collection>('list'); if (generation !== readGeneration.current) return; setCollection(value); setCollectionError(value.storageError ?? ''); observer.current(value).forEach(feedback.current);
      const id = currentId.current;
      setDelivery(value.deliveries.filter(d => d.resultId === id));
      if (id) {
        const row = value.items.find(item => item.id === id);
        const revision = `${id}:${row?.revision}:${row?.retention.state}:${row?.locus?.state}:${row?.locus?.message}`;
        if (force || revision !== lastRevision.current) {
          try { const read = await ownerRequest<ReadResponse>('read', id); if (currentId.current !== id || generation !== readGeneration.current) return; setSnapshot(read.snapshot); setDelivery(read.deliveries);setLocus(read.locus); setReadError(''); setReadConcerns(previous => { const next = { ...previous }; const errors = Object.values(read.snapshot?.readErrors ?? {}); if (errors.length) next[id] = 'Some retained files could not be read.'; else delete next[id]; return next; }); lastRevision.current = revision; }
          catch (error) { if (currentId.current === id && generation === readGeneration.current) { setReadError(errorMessage(error)); setReadConcerns(previous => ({ ...previous, [id]: errorMessage(error) })); } }
        }
      }
    } catch (error) { if (generation === readGeneration.current) setCollectionError(errorMessage(error)); }
    finally { refreshInFlight.current = false; if (queuedReadRetry.current) { queuedReadRetry.current = false; void refreshNow(true); } }
  }, []);
  useEffect(() => {
    const hash = () => { ++readGeneration.current; const id = location.hash.slice(1); currentId.current = id; setSelected(id); setSnapshot(undefined); setDelivery([]); setLocus(undefined); setReadError(''); lastRevision.current = ''; };
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
    if (operation.current) return; operation.current = true; setBusy(site==='twitter'?'enable':'enable-bilibili');
    try { const granted = await chrome.permissions.request({ origins: site==='twitter'?TWITTER_ORIGINS:BILIBILI_ORIGINS }); (site==='twitter'?setAccess:setBilibiliAccess)(granted); if (granted) { await coordinator('activate'); feedback.current({ title: `${site === 'twitter' ? 'Twitter' : 'Bilibili'} access enabled`, type: 'success' }); } else setNotice('Site access was not granted. Local results remain available.'); }
    catch (error) { setNotice(errorMessage(error)); } finally { operation.current = false; setBusy(''); }
  }
  async function exportResult() {
    if (!snapshot || operation.current) return;
    const target = snapshot.result;
    operation.current = true; setBusy('export');
    setActionErrors(previous => ({ ...previous, [target.id]: '' }));
    try {
      await ownerRequest('export', target.id);
      feedback.current({ title: 'Export accepted', description: `${target.label} · Chrome will confirm the download separately.`, resultId: target.id, type: 'info' });
      await refresh(true);
    } catch (error) {
      const message = `Export failed: ${errorMessage(error)}`;
      setActionErrors(previous => ({ ...previous, [target.id]: message }));
      feedback.current({ title: 'Export could not start', description: target.label, resultId: target.id, type: 'error' });
    } finally { operation.current = false; setBusy(''); }
  }
  async function clear() {
    if (!clearTarget || operation.current) return;
    const target = clearTarget; operation.current = true; setBusy('clear'); setClearError('');
    try {
      await ownerRequest('clear', target.id);
      ++readGeneration.current; setClearTarget(undefined);
      feedback.current({ title: 'Local capture cleared', description: `${target.label} · Exported files and Locus entries remain.`, type: 'success' });
      if (currentId.current === target.id && location.hash.slice(1) === target.id) { setSnapshot(null); setLocus(undefined); lastRevision.current = ''; location.hash = ''; }
      await refresh(true);
    } catch (error) { setClearError(`Clear failed: ${errorMessage(error)}`); }
    finally { operation.current = false; setBusy(''); }
  }
  async function continueLocus() {
    if (!snapshot || !locus || operation.current) return;
    const target = snapshot.result; operation.current = true; setBusy('locus');
    setActionErrors(previous => ({ ...previous, [target.id]: '' }));
    try { await ownerRequest('locus-continue', target.id); feedback.current({ title: 'Save check requested', description: target.label, resultId: target.id }); await refresh(true); }
    catch (error) { setActionErrors(previous => ({ ...previous, [target.id]: errorMessage(error) })); feedback.current({ title: 'Could not check the save', description: target.label, resultId: target.id, type: 'error' }); }
    finally { operation.current = false; setBusy(''); }
  }
  const visibleCollection = collection && { ...collection, items: collection.items.map(item => readConcerns[item.id] ? { ...item, unresolvedReason: readConcerns[item.id] } : item) };
  return { collection: visibleCollection, collectionError, selected, snapshot, readError, actionError: actionErrors[selected] ?? '', delivery, locus, continueLocus, access, bilibiliAccess, setNotice, busy, clearTarget, setClearTarget, clearError, setClearError, refresh, enable, exportResult, clear };
}
