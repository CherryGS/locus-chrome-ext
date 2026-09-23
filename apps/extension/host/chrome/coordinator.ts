import { errorMessage, type Delivery } from '@locus/capture-core/model';
import { diagnosticError } from '@locus/capture-core/diagnostics';
import { postUrl } from '@locus/twitter/urls';
import { partUrl, BILIBILI_PAGE_ORIGINS } from '@locus/bilibili/urls';
import { BILIBILI_SOURCE_LIMIT } from '@locus/bilibili/projection';
import { documentSite, sourceSelection, siteOrigins, type CaptureSite } from './sites';
import { biliIdentity, biliProbeUrl, sameBiliDocument } from './bilibili-protocol';
import { BilibiliLeases } from './bilibili-leases';
import { ResultDatabase } from './database';
import { sourceSummaries, summarizeResult } from './result-summary';
import type { SourceStatus } from './protocol';
import { AuthenticatedProbeManager } from './authenticated-probe';
import { AUTHENTICATED_SOURCE_LIMIT } from '@locus/twitter/authenticated-projection';
import { probeMessageSize } from './probe-protocol';
import { connectionInput, transferActive } from '../locus/model';
import { checkConnection } from '../locus/client';

export function startCoordinator() {
  const database = new ResultDatabase();
  const sites:CaptureSite[]=['twitter','bilibili'];
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const resultsUrl = chrome.runtime.getURL('results.html');
  const deliveries = new Map<string, Delivery>();
  const deliveryQueries = new Map<string, Promise<void>>();
  let queue = Promise.resolve();
  let registrations = Promise.resolve();
  const removedEpoch:Record<CaptureSite,number>={twitter:0,bilibili:0};
  const interruptedEpoch:Record<CaptureSite,number>={twitter:0,bilibili:0};
  let scriptChanges=Promise.resolve();
  const interruptions:Partial<Record<CaptureSite,Promise<void>>>={};
  async function contexts() { return chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType], documentUrls: [offscreenUrl] }); }
  async function sendOwner(op: string, values: Record<string, unknown> = {}) {
    const response = await chrome.runtime.sendMessage({ target: 'offscreen', op, ...values });
    if (!response?.ok) throw new Error(response?.error ?? 'Execution owner unavailable');
    return response.value;
  }
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const current = queue.then(operation); queue = current.then(() => {}, () => {}); return current;
  }
  async function owner(op: string, values: Record<string, unknown> = {}, guard?:()=>void|Promise<void>) {
    return exclusive(async () => {
      await guard?.();
      if (!(await contexts()).length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS' as chrome.offscreen.Reason, 'DOM_PARSER' as chrome.offscreen.Reason], justification: 'Parse selected source data, acquire and retain media Blobs, and back explicit result exports.' });
      await guard?.();
      return sendOwner(op, values);
    });
  }
  function interruptRemovedWork(site:CaptureSite='twitter') {
    // Withdrawal must reach a surviving producer even while an unrelated source
    // inspection is awaiting its temporary tab inside the owner command queue.
    if(interruptions[site])return interruptions[site]!;
    const pending=(async()=>{while(interruptedEpoch[site]!==removedEpoch[site]){const epoch=removedEpoch[site];if((await contexts()).length)await sendOwner('revoke',{site});interruptedEpoch[site]=epoch;}})().finally(()=>{delete interruptions[site];});
    interruptions[site]=pending;return pending;
  }
  const access = async (site:CaptureSite='twitter') => {
    if(interruptedEpoch[site]!==removedEpoch[site]){void interruptRemovedWork(site).catch(()=>{});throw new Error('Source access was removed. Previous queued work must be interrupted before new work starts.');}
    const epoch=removedEpoch[site];
    if (!(await chrome.permissions.contains({ origins: siteOrigins[site] }))) throw new Error('Source access is not granted. Enable this site in the results tab.');
    if(epoch!==removedEpoch[site]||interruptedEpoch[site]!==removedEpoch[site])throw new Error('Source access changed during authorization. Retry after interrupted work is settled.');
    return true;
  };
  const probeScripts:chrome.scripting.RegisteredContentScript[]=[
    {id:'locus-probe-main',matches:['https://x.com/*','https://twitter.com/*'],js:['content-scripts/twitter-probe-main.js'],runAt:'document_start',world:'MAIN',persistAcrossSessions:true},
    {id:'locus-probe-bridge',matches:['https://x.com/*','https://twitter.com/*'],js:['content-scripts/twitter-probe-bridge.js'],runAt:'document_start',world:'ISOLATED',persistAcrossSessions:true},
  ];
  function synchronizeScripts(enabled:boolean,site:CaptureSite='twitter'){
    const next=scriptChanges.then(async()=>{
      const matches=site==='twitter'?['https://x.com/*','https://twitter.com/*']:BILIBILI_PAGE_ORIGINS;
      const sourceMatches=['https://www.bilibili.com/*'];
      const desired=[{id:'locus-'+site,matches,js:['content-scripts/'+site+'.js'],runAt:'document_idle',persistAcrossSessions:true} as chrome.scripting.RegisteredContentScript,...(site==='twitter'?probeScripts:[{id:'locus-bilibili-main',matches:sourceMatches,js:['content-scripts/bilibili-probe-main.js'],runAt:'document_start',world:'MAIN',persistAcrossSessions:true},{id:'locus-bilibili-bridge',matches:sourceMatches,js:['content-scripts/bilibili-probe-bridge.js'],runAt:'document_start',world:'ISOLATED',persistAcrossSessions:true}] as chrome.scripting.RegisteredContentScript[])];
      const existing=await chrome.scripting.getRegisteredContentScripts({ids:desired.map(script=>script.id)});
      if(enabled){
        const missing=desired.filter(script=>!existing.some(value=>value.id===script.id));if(missing.length)await chrome.scripting.registerContentScripts(missing);
        // Persisted registrations must gain new page matches after an upgrade.
        const changed=desired.filter(script=>{const previous=existing.find(value=>value.id===script.id);return previous&&JSON.stringify(previous.matches)!==JSON.stringify(script.matches);});
        if(changed.length)await chrome.scripting.updateContentScripts(changed);
      }
      else if(existing.length)await chrome.scripting.unregisterContentScripts({ids:existing.map(script=>script.id)});
    });scriptChanges=next.catch(()=>{});return next;
  }
  const probes=new AuthenticatedProbeManager(()=>access('twitter'),()=>synchronizeScripts(true));
  const biliProbes=new AuthenticatedProbeManager(()=>access('bilibili'),()=>synchronizeScripts(true,'bilibili'),{key:'locus-bilibili-probes-v1',canonical:url=>partUrl(url).url,identify:biliIdentity,navigate:biliProbeUrl,matches:sameBiliDocument,limit:BILIBILI_SOURCE_LIMIT});
  const leases=new BilibiliLeases(()=>access('bilibili'),async(token,jobId)=>(await contexts()).length?sendOwner('lease-live',{token,jobId}):false);
  async function activateSite(site:CaptureSite) {
    const enabled = await chrome.permissions.contains({ origins: siteOrigins[site] });
    await synchronizeScripts(enabled,site);
    const tabs = await chrome.tabs.query({ url: site==='twitter'?['https://x.com/*','https://twitter.com/*']:BILIBILI_PAGE_ORIGINS });
    for (const tab of tabs) if (tab.id !== undefined && (site==='bilibili'||documentSite(tab.url)===site)) {
      if (enabled) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/'+site+'.js'] }).catch(() => {});
      else await chrome.tabs.sendMessage(tab.id, { target: 'page', op: 'revoke' }).catch(() => {});
    }
    if (!enabled && (await contexts()).length) await sendOwner('revoke',{site});
    return enabled;
  }
  async function activate(){for(const site of sites)await activateSite(site);}
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
        if (sender.id !== chrome.runtime.id || (message.op==='probe-data'?probeMessageSize(message)>AUTHENTICATED_SOURCE_LIMIT:message.op==='bilibili-data'?probeMessageSize(message)>BILIBILI_SOURCE_LIMIT:JSON.stringify(message).length>16_000)) throw new Error('Invalid extension request');
        const resultPage = sender.url?.split('#')[0] === resultsUrl;
        const offscreen = sender.url === offscreenUrl && !sender.tab;
        const site=documentSite(sender.url);
        const page = !!sender.tab?.id && sender.frameId === 0 && !!sender.documentId && !!sender.url && !!site;
        const documentOwner = page ? `${sender.tab!.id}:${sender.documentId}` : '';
        if((probes.owns(sender.tab?.id,sender.url)||biliProbes.owns(sender.tab?.id,sender.url))&&!['probe-ready','probe-data','bilibili-ready','bilibili-data'].includes(message.op))throw new Error('Internal source probes cannot perform normal page operations');
        let value: unknown;
        switch (message.op) {
          case 'locus-settings': {
            if(!resultPage)throw new Error('Connection settings require the extension results page');
            const connection=await database.locusConnection();value={origin:connection?.origin??'',configured:!!connection};break;
          }
          case 'locus-connect': {
            if(!resultPage||typeof message.origin!=='string'||typeof message.token!=='string')throw new Error('Invalid connection settings request');
            const previous=await database.locusConnection();
            const connection=connectionInput(message.origin,message.token||((previous && previous.origin===message.origin)?previous.token:''));
            if(!await chrome.permissions.contains({origins:['http://127.0.0.1/*']}))throw new Error('Grant local Locus access first');
            try {await checkConnection(connection);}catch(error){throw new Error(errorMessage(error).replaceAll(connection.token,'[redacted]'));}
            await database.saveLocusConnection(connection);value=true;break;
          }
          case 'authenticated-source':if(!offscreen||typeof message.url!=='string'||!Number.isSafeInteger(message.deadline)||message.deadline>Date.now()+40_000)throw new Error('Invalid authenticated source request');value=await probes.request(postUrl(message.url).url,message.deadline);break;
          case 'bilibili-source':if(!offscreen||typeof message.url!=='string'||!Number.isSafeInteger(message.deadline)||message.deadline>Date.now()+40_000)throw new Error('Invalid Bilibili source request');value=await biliProbes.request(partUrl(message.url).url,message.deadline);break;
          case 'bilibili-ready':value=await biliProbes.ready(message.token,message.url,sender);break;
          case 'bilibili-data':value=await biliProbes.accept(message,sender);break;
          case 'cdn-acquire':if(!offscreen||!validId(message.token)||!validId(message.jobId)||typeof message.url!=='string'||!['cover','track'].includes(message.role)||typeof message.cid!=='string')throw new Error('Untrusted CDN lease');value=await leases.acquire(message.token,message.jobId,message.url,message.role,message.cid);break;
          case 'cdn-release':if(!offscreen||!validId(message.token))throw new Error('Invalid CDN lease release');await leases.release(message.token);value=true;break;
          case 'probe-ready':value=await probes.ready(message.token,message.url,sender);break;
          case 'probe-data':value=await probes.accept(message,sender);break;
          case 'access': if (!offscreen && !page && !resultPage) throw new Error('Untrusted access request'); value = await access(page?site!:message.site==='bilibili'?'bilibili':'twitter'); break;
          case 'activate': if (!resultPage) throw new Error('Use the results tab to enable source access'); value = await activation(); break;
          case 'grant': {
            if (!resultPage || !['list','read','clear','export','locus-continue'].includes(message.operation) || (message.operation !== 'list' && !validId(message.id))) throw new Error('Invalid result operation');
            const token = crypto.randomUUID(); await owner('grant', { token, operation: message.operation, id: message.id }); value = token; break;
          }
          case 'inspect': {
            if (!page||typeof message.url!=='string'||sourceSelection(message.url).site!==site) throw new Error('Inspection requires an authorized matching site document');
            const epoch=removedEpoch[site!];const stillAuthorized=async()=>{if(epoch!==removedEpoch[site!])throw new Error('Site access was removed during inspection preparation. Start a fresh capture.');await access(site);if(epoch!==removedEpoch[site!])throw new Error('Site access changed during inspection preparation.');};
            await stillAuthorized();value=await owner('inspect',{url:sourceSelection(message.url).url,site,owner:documentOwner},stillAuthorized);await stillAuthorized();break;
          }
          case 'source-status': {
            if (!page || !Array.isArray(message.urls) || !message.urls.length || message.urls.length > 50) throw new Error('Invalid visible source lookup');
            const sourceIds = [...new Set<string>(message.urls.map((url: unknown) => { if (typeof url !== 'string') throw new Error('Invalid source URL'); const source=sourceSelection(url);if(source.site!==site)throw new Error('Mismatched source site');return source.id; }))];
            await access(site);
            const stored=sourceSummaries(await database.list(),sourceIds,site);
            // Passive indicators never create or keep alive a Blob owner.
            const ownerExists=(await contexts()).length>0;
            const transfers=await database.locusTransfers();
            for(const row of stored){const transfer=transfers.find(item=>item.resultId===row.summary?.id);if(row.summary&&transfer)row.summary.locus=!ownerExists&&transferActive(transfer)?{state:'unverified',message:'Save execution ended. Check the original result before continuing'}:{state:transfer.state,message:transfer.message};}
            const live: SourceStatus[]=ownerExists?await sendOwner('source-status',{sourceIds,site}):[];
            value=stored.map(row=>{
              const current=live.find(item=>item.sourceId===row.sourceId)?.summary;
              const selected=current&&(!row.summary||current.createdAt>=row.summary.createdAt)?{...row,summary:current}:row;
              return !current&&selected.summary?.acquisition==='pending'?{...selected,unresolvedReason:'The capture execution cannot be verified. Open the result to inspect interrupted work; no network work was resumed.'}:selected;
            }); break;
          }
          case 'capture': {
            if (!page || !validId(message.token) || !Array.isArray(message.selected) || message.selected.length > 16 || !message.selected.every((id: unknown) => typeof id === 'string' && /^media-\d{1,2}$/.test(id))) throw new Error('Invalid source selection');
            await access(site); value = await owner('capture', { token: message.token, selected: message.selected, site, owner: documentOwner });
            break;
          }
          case 'capture-tasks': {
            if(!page&&!resultPage)throw new Error('Invalid capture task lookup');
            if(page)await access(site);
            value=(await contexts()).length?await sendOwner('capture-tasks',{site:page?site:undefined}):[];break;
          }
          case 'status':
          case 'open-result': {
            if (!validId(message.id) || (!resultPage && !page)) throw new Error('Invalid result reference');
            // Possession of an unguessable local result reference is a read-only
            // page capability; it survives worker recreation without site bytes.
            if (page) await access(site);
            if(message.op==='open-result') value=await openResult(message.id,sender.tab?.windowId);
            else {
              const stored=await database.metadata(message.id);
              const current=(await contexts()).length?await sendOwner('live-status',{id:message.id}):null;
              const transfer=(await database.locusTransfers()).find(item=>item.resultId===message.id);
              const locus=transfer?{state:transfer.state,message:transfer.message}:undefined;
              if(locus&&transferActive(locus)&&!(await contexts()).length){locus.state='unverified';locus.message='Save execution ended. Check the original result before continuing';}
              value=current??(stored?{...summarizeResult(stored),locus,...(summarizeResult(stored).acquisition==='pending'?{unresolvedReason:'Capture execution is unavailable. Open the result to inspect interrupted work.'}:{})}:null);
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
      } catch (error) { respond({ ok: false, error: diagnosticError('COORDINATOR_REQUEST_FAILED', `coordinator.${typeof message?.op === 'string' ? message.op : 'unknown'}`, errorMessage(error).split('\n')[0]!, { sourceUrl: typeof message?.url === 'string' ? message.url : null, resultId: validId(message?.id) ? message.id : null }, error).message }); }
    })();
    return true;
  });
  chrome.action.onClicked.addListener(tab => { void openResult(undefined, tab.windowId); });
  chrome.permissions.onAdded.addListener(() => { void activation().catch(() => {}); });
  chrome.permissions.onRemoved.addListener(removed => {
    for(const site of sites)if(removed.origins?.some(origin=>siteOrigins[site].includes(origin))){removedEpoch[site]++;(site==='twitter'?probes:biliProbes).abort('Site access removed during source inspection');if(site==='bilibili')void leases.revoke().catch(()=>{});void interruptRemovedWork(site).then(activation).catch(()=>{});}
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
