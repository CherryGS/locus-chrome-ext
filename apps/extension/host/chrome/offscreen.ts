import { availability, errorMessage, interrupt, type CaptureResult, type Delivery, type Snapshot } from '@/core/results/model';
import { selectTwitter, type TwitterCandidate } from '@/sites/twitter/source';
import { normalizeAuthenticatedTwitter } from '@/sites/twitter/authenticated-source';
import { sourceSummaries, summarizeResult } from './result-summary';
import { ResultDatabase, ClearedError } from './database';
import { acquireMedia, loadTwitter } from './network';
import { createArchive } from './archive';
import { CHANNEL, coordinator, type Inspection } from './protocol';

export function startOffscreen() {
  const database = new ResultDatabase();
  const live = new Map<string, Snapshot>();
  const active = new Map<string, AbortController>();
  type Job = { id: string; candidate: TwitterCandidate; controller: AbortController; initial: Promise<void> };
  const jobs=new Map<string,Job>();
  const waiting:string[]=[];
  const clearing=new Set<string>();
  let accessEpoch=0;
  let inspections=0;
  let disposed=false;
  const candidates = new Map<string, { owner: string; expiresAt: number; candidate: TwitterCandidate }>();
  const grants = new Map<string, { operation: string; id?: string; expiresAt: number }>();
  const exports = new Map<string, { delivery: Delivery; url?: string }>();
  const terminalReports = new Map<string, Delivery>();
  const channel = new BroadcastChannel(CHANNEL);
  let storageError: string | undefined;
  let requests = 0;
  let closing = false;
  let lastUse = Date.now();
  const changed = () => { if(disposed)return;lastUse = Date.now(); channel.postMessage({ changed: true }); };
  const summary = (result:CaptureResult) => {const value=summarizeResult(result),position=waiting.indexOf(result.id);return position<0?value:{...value,queuePosition:position+1};};
  const liveBytes=()=>[...live.values()].reduce((total,item)=>total+Object.values(item.blobs).reduce((sum,blob)=>sum+blob.size,0),0);
  const removeWaiting=(id:string)=>{const index=waiting.indexOf(id);if(index>=0)waiting.splice(index,1);};
  function pump() {
    if(disposed||closing)return;
    while(active.size<2&&waiting.length){
      const id=waiting[0]!;if(clearing.has(id))return;
      const job=jobs.get(id),snapshot=live.get(id);
      if(!job||!snapshot){waiting.shift();continue;}
      if(liveBytes()>=512*1048576&&availability(snapshot.result).pending){
        if(!active.size){
          const blocked=waiting.splice(0).map(id=>jobs.get(id)).filter((job):job is Job=>!!job);
          for(const job of blocked){job.controller.abort();void abandon(job,'Capture could not start: unsaved live content uses the 512 MiB owner memory limit. Export any needed content, then clear those results before starting a new capture.');}
        }
        return;
      }
      waiting.shift();active.set(id,job.controller);changed();void capture(job);
    }
  }
  async function abandon(job:Job,reason:string) {
    try {
      await job.initial;const snapshot=live.get(job.id);if(disposed||!snapshot)return;
      for(const part of [...snapshot.result.records,...snapshot.result.assets])if(part.acquisition.state==='pending')part.acquisition={state:'unavailable',reason};
      snapshot.result.revision++;await retain(snapshot);
      if(snapshot.result.retention.state==='retained')live.delete(job.id);
    } catch(error) {if(!(error instanceof ClearedError))storageError=errorMessage(error);}
    finally{jobs.delete(job.id);changed();pump();}
  }
  async function retain(snapshot: Snapshot) {
    snapshot.result.retention = { state: 'pending', revision: snapshot.result.retention.revision };
    changed();
    try { const committed = await database.commit(snapshot); snapshot.result.retention = committed.retention; storageError = undefined; }
    catch (error) {
      if (error instanceof ClearedError) { live.delete(snapshot.result.id); throw error; }
      snapshot.result.retention = { state: 'failed', revision: snapshot.result.retention.revision, reason: errorMessage(error) };
      storageError = errorMessage(error);
    }
    changed();
  }
  // This runs only on a newly created execution document. A worker waking while
  // this document survives does not rerun recovery or interrupt active producers.
  let recoveryNeeded = true;
  let recovery: Promise<void> | undefined;
  function recover(): Promise<void> {
    if (recovery) return recovery;
    if (!recoveryNeeded) return Promise.resolve();
    recovery = (async () => {
      recoveryNeeded = false;
      try {
        for (const result of await database.list()) if (availability(result).pending && !active.has(result.id) && !live.has(result.id)) {
          try {
            const snapshot = await database.read(result.id);
            if (snapshot) { snapshot.result = interrupt(result); live.set(result.id, snapshot); await retain(snapshot); if (snapshot.result.retention.state === 'retained') live.delete(result.id); }
          } catch (error) { recoveryNeeded = true; storageError = `Recovery read failed: ${errorMessage(error)}`; }
        }
      } catch (error) { recoveryNeeded = true; storageError = `Recovery read failed: ${errorMessage(error)}`; }
    })().finally(() => { recovery = undefined; });
    return recovery;
  }
  void recover();
  async function read(id: string): Promise<Snapshot | null> {
    const snapshot = live.get(id);
    if (snapshot) return structuredClone(snapshot);
    return database.read(id);
  }
  async function deliveryList() {
    const saved = await database.deliveries().catch(error => { storageError = errorMessage(error); return [] as Delivery[]; });
    return [...new Map([...saved, ...terminalReports.values(), ...[...exports.values()].map(item => item.delivery)].map(row => [row.id, row])).values()];
  }
  async function capture(job:Job) {
    const {id,candidate,controller}=job;
    const snapshot = live.get(id)!;
    try {
      await job.initial;
      if(disposed)return;
      if(!live.has(id))throw new ClearedError();
      if(controller.signal.aborted)throw new Error('Twitter access removed or capture cleared');
      await coordinator('access');
      if(controller.signal.aborted||!live.has(id))throw new Error('Twitter access removed or capture cleared');
      let size = 0;
      for (const asset of snapshot.result.assets) {
        if (!live.has(id)) break;
        if (asset.acquisition.state !== 'pending') continue;
        try {
          if (controller.signal.aborted) throw new Error('Twitter access removed or capture cleared');
          await coordinator('access');
          if(controller.signal.aborted||!live.has(id))throw new Error('Twitter access removed or capture cleared');
          const media = candidate.media.find(m => m.id === asset.id)!;
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
          const blob = await acquireMedia(media, signal);
          if(disposed)return;
          if(controller.signal.aborted||!live.has(id))throw new Error('Twitter access removed or capture cleared');
          if (size + blob.size > 512 * 1048576) throw new Error('Capture exceeds the 512 MiB capability limit');
          if(liveBytes()+blob.size>512*1048576)throw new Error('Live capture content exceeds the 512 MiB owner memory limit. Finish or clear unsaved content before another capture.');
          size += blob.size; snapshot.blobs[asset.id] = blob;
          asset.mime = blob.type; asset.size = blob.size; asset.acquisition = { state: 'acquired' };
        } catch (error) { asset.acquisition = { state: 'unavailable', reason: errorMessage(error) }; }
        if(disposed)return;
        snapshot.result.revision++; await retain(snapshot);
      }
    } catch (error) {
      if (!disposed&&!(error instanceof ClearedError)) {
        for (const asset of snapshot.result.assets) if (asset.acquisition.state === 'pending') asset.acquisition = { state: 'unavailable', reason: errorMessage(error) };
        snapshot.result.revision++; await retain(snapshot).catch(() => {});
      }
    } finally {
      active.delete(id);
      jobs.delete(id);
      if (snapshot.result.retention.state === 'retained') live.delete(id);
      changed();
      pump();
    }
  }
  async function packageExport(snapshot: Snapshot, delivery: Delivery) {
    const backing = { delivery } as { delivery: Delivery; url?: string };
    exports.set(delivery.id, backing); changed();
    try {
      await database.saveDelivery(delivery).catch(() => {});
      const archive = await createArchive(snapshot);
      backing.url = URL.createObjectURL(archive.blob);
      delivery.url = backing.url; delivery.partial = archive.partial; delivery.state = 'starting';
      await database.saveDelivery(delivery).catch(() => {});
      await coordinator('native-download', { delivery });
    } catch (error) {
      // A lost coordinator response may follow a successful native initiation.
      // Keep its backing until browser reconciliation establishes consumption.
      const saved = (await database.deliveries().catch(() => [])).find(row => row.id === delivery.id);
      const confirmed = [backing.delivery, saved].find(row => row && ['complete', 'interrupted', 'failed'].includes(row.state));
      if (confirmed) {
        if (backing.url) URL.revokeObjectURL(backing.url);
        exports.delete(delivery.id);
      } else {
        const current = saved ?? backing.delivery;
        current.state = backing.url ? 'unverified' : 'failed'; current.reason = errorMessage(error);
        backing.delivery = current;
        await database.saveDelivery(current).catch(() => {});
        if (!backing.url) { terminalReports.set(current.id, current); exports.delete(delivery.id); }
      }
      changed();
    }
  }
  async function consume(operation: string, id?: string) {
    if (operation === 'list') {
      let stored: CaptureResult[] = [];
      try { stored = await database.list(); storageError = undefined; } catch (error) { storageError = errorMessage(error); }
      const items = [...new Map([...stored, ...[...live.values()].map(v => v.result)].map(r => [r.id, r])).values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(summary);
      return { items, deliveries: await deliveryList(), storageError };
    }
    if (!id) throw new Error('Result reference required');
    if (operation === 'read') return { snapshot: await read(id), deliveries: (await deliveryList()).filter(d => d.resultId === id) };
    if (operation === 'clear') {
      clearing.add(id);
      try {await database.clear(id);live.delete(id);jobs.get(id)?.controller.abort();removeWaiting(id);if(!active.has(id))jobs.delete(id);changed();return true;}
      finally{clearing.delete(id);pump();}
    }
    if (operation === 'export') {
      if ([...exports.values()].filter(e => !['complete', 'failed', 'interrupted'].includes(e.delivery.state)).length >= 2) throw new Error('Two exports are already awaiting delivery; finish them before exporting again');
      const snapshot = await read(id);
      if (!snapshot) throw new Error('Result no longer exists');
      if (!availability(snapshot.result).acquired) throw new Error('No acquired content is available to export yet');
      const delivery: Delivery = { id: crypto.randomUUID(), resultId: id, revision: snapshot.result.revision, createdAt: new Date().toISOString(), state: 'packaging', partial: !availability(snapshot.result).complete };
      void packageExport(snapshot, delivery); return delivery.id;
    }
    throw new Error('Unsupported consumer operation');
  }
  channel.onmessage = event => {
    const token = event.data?.requestId;
    const grant = typeof token === 'string' ? grants.get(token) : undefined;
    if (!grant) return;
    grants.delete(token);
    requests++;
    void (async () => {
      try { if (grant.expiresAt < Date.now()) throw new Error('Read authorization expired; retry'); await recover(); channel.postMessage({ requestId: token, ok: true, value: await consume(grant.operation, grant.id) }); }
      catch (error) { channel.postMessage({ requestId: token, ok: false, error: errorMessage(error) }); }
      finally { requests--; lastUse = Date.now(); }
    })();
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id || sender.tab || (sender.url && sender.url !== chrome.runtime.getURL('background.js'))) return;
    requests++;
    void (async () => {
      try {
        if (closing) throw new Error('Execution owner is closing; retry');
        const passive=message.op==='source-status'||message.op==='live-status'||message.op==='capture-tasks';
        if(!passive) await recover();
        let value: unknown;
        switch (message.op) {
          case 'hello': value = { active: [...active.keys()] }; break;
          case 'export-state': value = exports.get(message.id)?.delivery ?? null; break;
          case 'grant': grants.set(message.token, { operation: message.operation, id: message.id, expiresAt: Date.now() + 30_000 }); value = true; break;
          case 'inspect': {
            for (const [token, entry] of candidates) if (entry.expiresAt < Date.now()) candidates.delete(token);
            if (candidates.size+inspections >= 30) throw new Error('Too many inspections; wait for an existing inspection to expire');
            const epoch=accessEpoch;inspections++;
            try {
              const deadline=Date.now()+40_000;
              const candidate=await loadTwitter(message.url,AbortSignal.timeout(40_000),async()=>normalizeAuthenticatedTwitter(await coordinator('authenticated-source',{url:message.url,deadline}),message.url));await coordinator('access');
              if(epoch!==accessEpoch)throw new Error('Twitter access was removed during inspection. Inspect again after enabling access.');
              const token = crypto.randomUUID(); const expiresAt = Date.now() + 5 * 60_000;
              candidates.set(token, { owner: message.owner, expiresAt, candidate });
              value = { token, expiresAt, sourceUrl: candidate.sourceUrl, label: candidate.label, textPreview: candidate.text?.slice(0, 1000) ?? null, textFailure: candidate.textFailure, media: candidate.media.map(({ id, kind, sourceId, previewUrl, reason, quality }) => ({ id, kind, sourceId, previewUrl, reason, quality })) } satisfies Inspection;
            }finally{inspections--;}
            break;
          }
          case 'capture': {
            const epoch=accessEpoch;
            await coordinator('access');
            if(epoch!==accessEpoch)throw new Error('Twitter access was removed before queue acceptance');
            const entry = candidates.get(message.token);
            if (!entry || entry.owner !== message.owner || entry.expiresAt < Date.now()) throw new Error('Inspection expired or belongs to another document. Inspect this post again.');
            if(waiting.length>=20||jobs.size>=22)throw new Error('Capture queue is full: two running and twenty waiting. Wait for a task to finish.');
            if(liveBytes()>=512*1048576)throw new Error('Live capture content uses the 512 MiB owner memory limit. Finish or clear an existing capture first.');
            const id = crypto.randomUUID(); const result = selectTwitter(entry.candidate, message.selected, id);
            candidates.delete(message.token);
            const snapshot={result,blobs:{},readErrors:{}};live.set(id,snapshot);
            const job:Job={id,candidate:structuredClone(entry.candidate),controller:new AbortController(),initial:Promise.resolve()};jobs.set(id,job);waiting.push(id);
            job.initial=retain(snapshot);void job.initial.catch(()=>{});pump();
            await job.initial;value=summary(snapshot.result);break;
          }
          case 'status': { const snapshot = await read(message.id); value = snapshot ? summary(snapshot.result) : null; break; }
          case 'live-status': { const snapshot=live.get(message.id);value=snapshot?summary(snapshot.result):null;break; }
          case 'source-status': {
            value=sourceSummaries([...live.values()].map(item=>item.result),message.sourceIds).map(row=>({...row,summary:row.summary?summary(live.get(row.summary.id)!.result):null}));break;
          }
          case 'capture-tasks':value=[...jobs.keys()].filter(id=>active.has(id)||waiting.includes(id)).map(id=>live.get(id)).filter((snapshot):snapshot is Snapshot=>!!snapshot).map(snapshot=>summary(snapshot.result));break;
          case 'revoke': {
            accessEpoch++;for (const job of jobs.values())job.controller.abort();candidates.clear();
            const queued=waiting.splice(0).map(id=>jobs.get(id)).filter((job):job is Job=>!!job);
            await Promise.all(queued.map(job=>abandon(job,'Interrupted: Twitter access was removed before this queued capture started. Start a new capture explicitly.')));value=true;break;
          }
          case 'delivery': {
            const delivery = message.delivery as Delivery;
            const backing = exports.get(delivery.id);
            if (backing) {
              backing.delivery = delivery;
              if (['complete', 'interrupted', 'failed'].includes(delivery.state)) { if (backing.url) URL.revokeObjectURL(backing.url); terminalReports.set(delivery.id, delivery); exports.delete(delivery.id); }
            }
            changed(); value = true; break;
          }
          case 'prepare-close': {
            const unsaved = [...live.values()].some(s => s.result.retention.state !== 'retained');
            value = !jobs.size && !active.size && !exports.size && !grants.size && !candidates.size && !unsaved && requests === 1;
            if (value) closing = true; break;
          }
          default: throw new Error('Unsupported execution command');
        }
        respond({ ok: true, value });
      } catch (error) { respond({ ok: false, error: errorMessage(error) }); }
      finally { requests--; if(message.op!=='source-status'&&message.op!=='live-status'&&message.op!=='capture-tasks') lastUse = Date.now(); }
    })();
    return true;
  });
  const idleTimer = setInterval(() => {
    for (const [token, grant] of grants) if (grant.expiresAt < Date.now()) grants.delete(token);
    for (const [token, candidate] of candidates) if (candidate.expiresAt < Date.now()) candidates.delete(token);
    if (Date.now() - lastUse > 60_000 && !requests && !jobs.size && !active.size && !exports.size && !grants.size && !candidates.size && ![...live.values()].some(s => s.result.retention.state !== 'retained')) void coordinator('idle').catch(() => {});
  }, 15_000);
  return () => { disposed=true;clearInterval(idleTimer); channel.close(); for (const job of jobs.values())job.controller.abort(); void database.close(); };
}
