import { errorMessage, type Delivery } from '@/core/results/model';
import { isTwitterDocument, postUrl, TWITTER_ORIGINS } from '@/sites/twitter/urls';
import { ResultDatabase } from './database';
import { sourceSummaries, summarizeResult } from './result-summary';
import type { SourceStatus } from './protocol';
import { AuthenticatedProbeManager } from './authenticated-probe';
import { AUTHENTICATED_SOURCE_LIMIT } from '@/sites/twitter/authenticated-projection';
import { probeMessageSize } from './probe-protocol';

export function startCoordinator() {
  const database = new ResultDatabase();
  const scriptId = 'locus-twitter';
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const resultsUrl = chrome.runtime.getURL('results.html');
  const deliveries = new Map<string, Delivery>();
  const deliveryQueries = new Map<string, Promise<void>>();
  let queue = Promise.resolve();
  let registrations = Promise.resolve();
  let removedEpoch=0;
  let interruptedEpoch=0;
  let scriptChanges=Promise.resolve();
  async function contexts() { return chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType], documentUrls: [offscreenUrl] }); }
  async function sendOwner(op: string, values: Record<string, unknown> = {}) {
    const response = await chrome.runtime.sendMessage({ target: 'offscreen', op, ...values });
    if (!response?.ok) throw new Error(response?.error ?? 'Execution owner unavailable');
    return response.value;
  }
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const current = queue.then(operation); queue = current.then(() => {}, () => {}); return current;
  }
  async function owner(op: string, values: Record<string, unknown> = {}) {
    return exclusive(async () => {
      if (!(await contexts()).length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS' as chrome.offscreen.Reason, 'DOM_PARSER' as chrome.offscreen.Reason], justification: 'Parse selected source data, acquire and retain media Blobs, and back explicit result exports.' });
      return sendOwner(op, values);
    });
  }
  function interruptRemovedWork() {
    return exclusive(async()=>{const epoch=removedEpoch;if(interruptedEpoch===epoch)return;if((await contexts()).length)await sendOwner('revoke');interruptedEpoch=epoch;});
  }
  const access = async () => {
    if(interruptedEpoch!==removedEpoch){void interruptRemovedWork().catch(()=>{});throw new Error('Twitter access was removed. Previous queued work must be interrupted before new work starts.');}
    const epoch=removedEpoch;
    if (!(await chrome.permissions.contains({ origins: TWITTER_ORIGINS }))) throw new Error('Twitter access is not granted. Enable Twitter in the results tab.');
    if(epoch!==removedEpoch||interruptedEpoch!==removedEpoch)throw new Error('Twitter access changed during authorization. Retry after interrupted work is settled.');
    return true;
  };
  const probeScripts:chrome.scripting.RegisteredContentScript[]=[
    {id:'locus-probe-main',matches:['https://x.com/*','https://twitter.com/*'],js:['content-scripts/twitter-probe-main.js'],runAt:'document_start',world:'MAIN',persistAcrossSessions:true},
    {id:'locus-probe-bridge',matches:['https://x.com/*','https://twitter.com/*'],js:['content-scripts/twitter-probe-bridge.js'],runAt:'document_start',world:'ISOLATED',persistAcrossSessions:true},
  ];
  function synchronizeScripts(enabled:boolean){
    const next=scriptChanges.then(async()=>{
      const desired=[{id:scriptId,matches:['https://x.com/*','https://twitter.com/*'],js:['content-scripts/twitter.js'],runAt:'document_idle',persistAcrossSessions:true} as chrome.scripting.RegisteredContentScript,...probeScripts];
      const existing=await chrome.scripting.getRegisteredContentScripts({ids:desired.map(script=>script.id)});
      if(enabled){const missing=desired.filter(script=>!existing.some(value=>value.id===script.id));if(missing.length)await chrome.scripting.registerContentScripts(missing);}
      else if(existing.length)await chrome.scripting.unregisterContentScripts({ids:existing.map(script=>script.id)});
    });scriptChanges=next.catch(()=>{});return next;
  }
  const probes=new AuthenticatedProbeManager(access,()=>synchronizeScripts(true));
  async function activate() {
    const enabled = await chrome.permissions.contains({ origins: TWITTER_ORIGINS });
    await synchronizeScripts(enabled);
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    for (const tab of tabs) if (tab.id !== undefined) {
      if (enabled) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/twitter.js'] }).catch(() => {});
      else await chrome.tabs.sendMessage(tab.id, { target: 'page', op: 'revoke' }).catch(() => {});
    }
    if (!enabled && (await contexts()).length) await owner('revoke');
    return enabled;
  }
  function activation() { const next = registrations.then(activate); registrations = next.then(() => {}, () => {}); return next; }
  async function openResult(id?: string, windowId?: number) {
    const url = resultsUrl + (id ? `#${id}` : '');
    const tabs = await chrome.tabs.query(windowId === undefined ? { currentWindow: true } : { windowId });
    const existing = tabs.find(tab => tab.url?.startsWith(resultsUrl));
    if (existing?.id !== undefined) { await chrome.tabs.update(existing.id, { active: true, url }); await chrome.windows.update(existing.windowId, { focused: true }); }
    else await chrome.tabs.create({ url, ...(windowId === undefined ? {} : { windowId }) });
  }
  async function publishDelivery(delivery: Delivery) {
    if (deliveries.get(delivery.id)?.state === 'complete') delivery = deliveries.get(delivery.id)!;
    deliveries.set(delivery.id, delivery);
    try { delivery = await database.saveDelivery(delivery); deliveries.set(delivery.id, delivery); }
    catch (error) { delivery.reason = `${delivery.reason ? delivery.reason + '; ' : ''}Delivery correlation is not retained: ${errorMessage(error)}`; }
    if ((await contexts()).length) await owner('delivery', { delivery });
  }
  function reconcileDelivery(delivery: Delivery): Promise<void> {
    const previous = deliveryQueries.get(delivery.id) ?? Promise.resolve();
    const query = previous.catch(() => {}).then(() => queryDelivery(deliveries.get(delivery.id) ?? delivery));
    deliveryQueries.set(delivery.id, query);
    void query.finally(() => { if (deliveryQueries.get(delivery.id) === query) deliveryQueries.delete(delivery.id); }).catch(() => {});
    return query;
  }
  async function queryDelivery(delivery: Delivery) {
    if (delivery.state === 'complete' || delivery.state === 'failed' || delivery.state === 'interrupted') return;
    if (!delivery.dispatch && delivery.downloadId === undefined) {
      // Packaging/ready backing is not evidence that native initiation happened.
      // Ask the actual owner before inferring loss, and never reissue downloads.
      try {
        if ((await contexts()).length) {
          const state = await owner('export-state', { id: delivery.id });
          if (state) return;
        }
        delivery.state = 'failed'; delivery.reason = 'Export packaging owner no longer exists; native delivery was not started';
      } catch (error) { delivery.reason = `Cannot query export owner: ${errorMessage(error)}`; }
      await publishDelivery(delivery); return;
    }
    try {
      const items = delivery.downloadId !== undefined ? await chrome.downloads.search({ id: delivery.downloadId }) : delivery.url ? await chrome.downloads.search({ url: delivery.url }) : [];
      if (items.length !== 1) { delivery.state = 'unverified'; delivery.reason = 'Native delivery history is unavailable or ambiguous; no duplicate download was issued'; }
      else {
        const item = items[0]!; delivery.downloadId = item.id;
        delivery.state = item.state === 'complete' ? 'complete' : item.state === 'interrupted' ? 'interrupted' : 'in_progress';
        delivery.reason = item.error || (item.paused ? 'Browser download is paused; use Chrome downloads to continue' : item.danger !== 'safe' && item.danger !== 'accepted' ? 'Chrome requires download review or intervention' : undefined);
      }
    } catch (error) { delivery.state = 'unverified'; delivery.reason = `Native state query failed: ${errorMessage(error)}`; }
    await publishDelivery(delivery);
  }
  async function reconcile() {
    const stored = await database.deliveries();
    for (const delivery of stored) if (!deliveries.has(delivery.id)) deliveries.set(delivery.id, delivery);
    for (const delivery of deliveries.values()) await reconcileDelivery(delivery);
  }
  const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.target !== 'coordinator') return;
    void (async () => {
      try {
        if (sender.id !== chrome.runtime.id || (message.op==='probe-data'?probeMessageSize(message)>AUTHENTICATED_SOURCE_LIMIT:JSON.stringify(message).length>16_000)) throw new Error('Invalid extension request');
        const resultPage = sender.url?.split('#')[0] === resultsUrl;
        const offscreen = sender.url === offscreenUrl && !sender.tab;
        const page = !!sender.tab?.id && sender.frameId === 0 && !!sender.documentId && !!sender.url && isTwitterDocument(sender.url);
        const documentOwner = page ? `${sender.tab!.id}:${sender.documentId}` : '';
        if(probes.owns(sender.tab?.id,sender.url)&&!['probe-ready','probe-data'].includes(message.op))throw new Error('Internal source probes cannot perform normal page operations');
        let value: unknown;
        switch (message.op) {
          case 'authenticated-source':if(!offscreen||typeof message.url!=='string'||!Number.isSafeInteger(message.deadline)||message.deadline>Date.now()+40_000)throw new Error('Invalid authenticated source request');value=await probes.request(postUrl(message.url).url,message.deadline);break;
          case 'probe-ready':value=await probes.ready(message.token,message.url,sender);break;
          case 'probe-data':value=await probes.accept(message,sender);break;
          case 'access': if (!offscreen && !page && !resultPage) throw new Error('Untrusted access request'); value = await access(); break;
          case 'activate': if (!resultPage) throw new Error('Use the results tab to enable Twitter'); value = await activation(); break;
          case 'grant': {
            if (!resultPage || !['list','read','clear','export'].includes(message.operation) || (message.operation !== 'list' && !validId(message.id))) throw new Error('Invalid result operation');
            const token = crypto.randomUUID(); await owner('grant', { token, operation: message.operation, id: message.id }); value = token; break;
          }
          case 'inspect': if (!page) throw new Error('Inspection requires an authorized Twitter document'); await access(); value = await owner('inspect', { url: postUrl(message.url).url, owner: documentOwner }); break;
          case 'source-status': {
            if (!page || !Array.isArray(message.urls) || !message.urls.length || message.urls.length > 50) throw new Error('Invalid visible source lookup');
            const sourceIds = [...new Set<string>(message.urls.map((url: unknown) => { if (typeof url !== 'string') throw new Error('Invalid source URL'); return postUrl(url).id; }))];
            await access();
            const stored=sourceSummaries(await database.list(),sourceIds);
            // Passive indicators never create or keep alive a Blob owner.
            const ownerExists=(await contexts()).length>0;
            const live: SourceStatus[]=ownerExists?await sendOwner('source-status',{sourceIds}):[];
            value=stored.map(row=>{
              const current=live.find(item=>item.sourceId===row.sourceId)?.summary;
              const selected=current&&(!row.summary||current.createdAt>=row.summary.createdAt)?{...row,summary:current}:row;
              return !current&&selected.summary?.acquisition==='pending'?{...selected,unresolvedReason:'The capture execution cannot be verified. Open the result to inspect interrupted work; no network work was resumed.'}:selected;
            }); break;
          }
          case 'capture': {
            if (!page || !validId(message.token) || !Array.isArray(message.selected) || message.selected.length > 16 || !message.selected.every((id: unknown) => typeof id === 'string' && /^media-\d{1,2}$/.test(id))) throw new Error('Invalid source selection');
            await access(); value = await owner('capture', { token: message.token, selected: message.selected, owner: documentOwner });
            break;
          }
          case 'capture-tasks': {
            if(!page&&!resultPage)throw new Error('Invalid capture task lookup');
            if(page)await access();
            value=(await contexts()).length?await sendOwner('capture-tasks'):[];break;
          }
          case 'status':
          case 'open-result': {
            if (!validId(message.id) || (!resultPage && !page)) throw new Error('Invalid result reference');
            // Possession of an unguessable local result reference is a read-only
            // page capability; it survives worker recreation without site bytes.
            if (page) await access();
            if(message.op==='open-result') value=await openResult(message.id,sender.tab?.windowId);
            else {
              const stored=await database.metadata(message.id);
              const current=(await contexts()).length?await sendOwner('live-status',{id:message.id}):null;
              value=current??(stored?{...summarizeResult(stored),...(summarizeResult(stored).acquisition==='pending'?{unresolvedReason:'Capture execution is unavailable. Open the result to inspect interrupted work.'}:{})}:null);
            }
            break;
          }
          case 'native-download': {
            if (!offscreen) throw new Error('Native delivery requires the Blob owner');
            const delivery = message.delivery as Delivery;
            if (!validId(delivery?.id) || !validId(delivery.resultId) || delivery.state !== 'starting' || !delivery.url?.startsWith(`blob:${chrome.runtime.getURL('')}`)) throw new Error('Invalid delivery backing');
            const existing = deliveries.get(delivery.id) ?? (await database.deliveries().catch(() => [])).find(d => d.id === delivery.id && d.downloadId !== undefined);
            if (existing?.dispatch || existing?.downloadId !== undefined) { await reconcileDelivery(existing); value = true; break; }
            delivery.dispatch = 'attempted';
            deliveries.set(delivery.id, delivery);
            await database.saveDelivery(delivery).catch(() => {});
            try { delivery.downloadId = await chrome.downloads.download({ url: delivery.url, filename: `locus-${delivery.id}.zip`, saveAs: true }); delivery.state = 'in_progress'; }
            catch (error) { delivery.state = 'failed'; delivery.reason = errorMessage(error); }
            await publishDelivery(delivery); if (delivery.downloadId !== undefined) await reconcileDelivery(delivery); value = true; break;
          }
          case 'idle': {
            if (!offscreen) throw new Error('Untrusted lifecycle request');
            value = await exclusive(async () => { if ((await contexts()).length && await sendOwner('prepare-close')) { await chrome.offscreen.closeDocument(); return true; } return false; }); break;
          }
          case 'reconcile': if (!resultPage) throw new Error('Untrusted reconciliation request'); await reconcile(); value = true; break;
          default: throw new Error('Unsupported coordinator operation');
        }
        respond({ ok: true, value });
      } catch (error) { respond({ ok: false, error: errorMessage(error) }); }
    })();
    return true;
  });
  chrome.action.onClicked.addListener(tab => { void openResult(undefined, tab.windowId); });
  chrome.permissions.onAdded.addListener(() => { void activation().catch(() => {}); });
  chrome.permissions.onRemoved.addListener(removed => {
    if(removed.origins?.some(origin=>TWITTER_ORIGINS.includes(origin))){removedEpoch++;probes.abort();void interruptRemovedWork().then(activation).catch(()=>{});}
    else void activation().catch(()=>{});
  });
  chrome.downloads.onChanged.addListener(delta => { void (async () => {
    const all = [...deliveries.values(), ...await database.deliveries().catch(() => [])];
    const delivery = all.find(d => d.downloadId === delta.id);
    if (delivery) await reconcileDelivery(delivery);
  })(); });
  chrome.runtime.onStartup.addListener(() => { void activation().catch(() => {}); void reconcile().catch(() => {}); });
  chrome.runtime.onInstalled.addListener(() => { void activation().catch(() => {}); });
  void activation().catch(() => {});
  void reconcile().catch(() => {});
}
