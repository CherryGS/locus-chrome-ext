import { AUTHENTICATED_SOURCE_LIMIT } from '@locus/twitter/authenticated-projection';
import { postUrl } from '@locus/twitter/urls';
import { PROBE_TIMEOUT, probeIdentity, probeMessageSize, probeUrl } from './probe-protocol';

const STORAGE_KEY='locus-authenticated-probes-v1';
interface Ownership { token:string; url:string; tabId?:number; deadline:number; opening?:boolean }
interface Probe extends Ownership { documentId?:string; started:boolean; creating:boolean; done:boolean; timer:ReturnType<typeof setTimeout>; resolve:(value:unknown)=>void; reject:(reason:Error)=>void }

/** Only this owner creates/closes probe tabs; content messages grant no ownership. */
export class AuthenticatedProbeManager {
  private jobs=new Map<string,Probe>();
  private cleanup=new Map<string,Ownership>();
  private writes=Promise.resolve();
  private recovering:Promise<void>;
  private placeholder=(token:string)=>`${chrome.runtime.getURL('probe.html')}#${token}`;
  constructor(private access:()=>Promise<unknown>,private register:()=>Promise<void>) {
    this.recovering=this.recover();void this.recovering.catch(()=>{});
    chrome.tabs.onRemoved.addListener(id=>{const job=[...this.jobs.values()].find(job=>job.tabId===id);if(job)void this.finish(job,undefined,new Error('The temporary signed-in source tab was closed'));});
    // A late loading notification can follow document-start readiness on X's
    // initial load. Only bound()'s live documentId check proves replacement.
    chrome.tabs.onUpdated.addListener((id,change)=>{const job=[...this.jobs.values()].find(job=>job.tabId===id);if(!job)return;if(change.url&&change.url!==probeUrl(job.url,job.token)&&change.url!==this.placeholder(job.token))void this.finish(job,undefined,new Error('Signed-in source redirected away from the selected post; login or source access is unavailable'));});
  }
  private persist(){const values=[...new Map([...[...this.jobs.values()].filter(job=>!job.done&&(job.opening||job.tabId!==undefined)),...this.cleanup.values()].map(value=>[value.token,value])).values()].map(({token,url,tabId,deadline,opening})=>({token,url,tabId,deadline,opening}));const next=this.writes.then(()=>chrome.storage.session.set({[STORAGE_KEY]:values}));this.writes=next.catch(()=>{});return next;}
  private async closeOwned(value:Ownership){
    if(value.tabId===undefined){
      if(value.opening)this.cleanup.set(value.token,value);
      const placeholders=(await chrome.tabs.query({})).filter(tab=>tab.id!==undefined&&tab.url===this.placeholder(value.token));
      for(const tab of placeholders)await this.closeOwned({...value,tabId:tab.id});
      return;
    }
    try{await chrome.tabs.remove(value.tabId);this.cleanup.delete(value.token);}
    catch(error){try{await chrome.tabs.get(value.tabId);}catch{this.cleanup.delete(value.token);return;}this.cleanup.set(value.token,value);throw error;}
  }
  private async recover(){
    const stored=(await chrome.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
    if(Array.isArray(stored)&&stored.length>64)throw new Error('Temporary source ownership exceeds its recovery bound');
    if(Array.isArray(stored))for(const value of stored){
      if(!value||typeof value.token!=='string'||!/^[0-9a-f-]{36}$/.test(value.token)||typeof value.url!=='string')continue;
      try{postUrl(value.url);}catch{continue;}
      if(value.tabId!==undefined&&!Number.isSafeInteger(value.tabId))continue;
      await this.closeOwned(value).catch(()=>{});
    }
    await this.persist();
  }
  owns(tabId:number|undefined,url?:string){return tabId!==undefined&&[...this.jobs.values()].some(job=>job.tabId===tabId)||!!url&&(url.startsWith(chrome.runtime.getURL('probe.html'))||!!probeIdentity(url));}
  async request(input:string,deadline:number):Promise<unknown>{
    if(!Number.isSafeInteger(deadline))throw new Error('Invalid signed-in source deadline');
    const url=postUrl(input).url;deadline=Math.min(deadline,Date.now()+PROBE_TIMEOUT);
    if(deadline<=Date.now())throw new Error('The signed-in source inspection deadline expired');
    if(new Set([...this.jobs.keys(),...this.cleanup.keys()]).size>=6)throw new Error('Signed-in source capacity is full: two active probes and four waiting, including pending cleanup');
    const token=crypto.randomUUID();let resolve!:(value:unknown)=>void,reject!:(error:Error)=>void;
    const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const job:Probe={token,url,deadline,started:false,creating:false,done:false,resolve,reject,timer:setTimeout(()=>{const error=new Error('Signed-in source unavailable before timeout; the current X session did not provide the selected post');job.reject(error);void this.finish(job,undefined,error);},deadline-Date.now())};
    this.jobs.set(token,job);this.pump();return result;
  }
  private pump(){for(const job of this.jobs.values()){if([...this.jobs.values()].filter(item=>item.started&&!item.done).length>=2)return;if(job.started||job.done)continue;job.started=true;void this.start(job);}}
  private async start(job:Probe){
    try{
      await this.recovering;if(job.done)return;
      for(const orphan of Array.from(this.cleanup.values()))await this.closeOwned(orphan).catch(()=>{});
      if(job.done)return;if(this.cleanup.size)throw new Error('A previous temporary source tab could not be closed. Retry after Chrome allows cleanup.');
      await this.access();if(job.done)return;await this.register();if(job.done)return;
      if(this.cleanup.size)throw new Error('Previous temporary source cleanup is not complete; retry before starting another probe');
      job.opening=true;await this.persist();if(job.done){job.opening=false;this.cleanup.delete(job.token);await this.persist();return;}
      // Record an extension-owned placeholder before any X document can send a
      // ready message. Pending placeholder ownership is recoverable after crash.
      job.creating=true;
      let tab:chrome.tabs.Tab;
      try{tab=await chrome.tabs.create({url:this.placeholder(job.token),active:false});}
      catch(error){job.creating=false;job.opening=false;this.cleanup.delete(job.token);await this.persist();throw error;}
      job.creating=false;if(tab.id===undefined)throw new Error('Temporary source tab was not created');job.tabId=tab.id;job.opening=false;
      if(job.done){await this.closeOwned(job).catch(()=>{});await this.persist();return;}
      await this.persist();await this.access();if(job.done)return;
      await chrome.tabs.update(tab.id,{url:probeUrl(job.url,job.token),active:false});
    }catch(error){await this.finish(job,undefined,error instanceof Error?error:new Error(String(error)));}
  }
  private async bound(token:unknown,url:unknown,sender:chrome.runtime.MessageSender){
    await this.recovering;
    const job=typeof token==='string'?this.jobs.get(token):undefined;
    if(!job||job.done||sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.documentId||sender.tab?.id!==job.tabId||url!==job.url||sender.url!==probeUrl(job.url,job.token))throw new Error('Unowned or mismatched signed-in source document');
    await this.access();if(job.done||Date.now()>=job.deadline)throw new Error('Signed-in source attempt expired or was interrupted');
    const current=await chrome.tabs.get(job.tabId!);if(current.url!==probeUrl(job.url,job.token))throw new Error('Signed-in source tab changed before response');
    const documents=await chrome.scripting.executeScript({target:{tabId:job.tabId!,frameIds:[0]},injectImmediately:true,func:()=>location.href});
    if(job.done||documents.length!==1||documents[0]!.documentId!==sender.documentId||documents[0]!.result!==probeUrl(job.url,job.token)){
      const error=new Error('Signed-in source document is no longer the active selected document');void this.finish(job,undefined,error);throw error;
    }
    return job;
  }
  async ready(token:unknown,url:unknown,sender:chrome.runtime.MessageSender){const job=await this.bound(token,url,sender);if(job.documentId&&job.documentId!==sender.documentId){await this.finish(job,undefined,new Error('Signed-in source document changed during inspection'));throw new Error('Signed-in source document changed');}job.documentId=sender.documentId;return true;}
  async accept(message:{token?:unknown;url?:unknown;data?:unknown;error?:unknown},sender:chrome.runtime.MessageSender){
    const job=await this.bound(message.token,message.url,sender);
    if(job.documentId!==sender.documentId)throw new Error('Signed-in source document has not completed authorization');
    if(probeMessageSize(message)>AUTHENTICATED_SOURCE_LIMIT)throw new Error('Signed-in source exceeds the message capability limit');
    if(typeof message.error==='string')await this.finish(job,undefined,new Error(`Signed-in source unavailable: ${message.error.slice(0,1000)}`));
    else if(message.data!==undefined)await this.finish(job,message.data);
    else throw new Error('Signed-in source response is empty');return true;
  }
  abort(reason='Twitter access removed during signed-in source inspection') {for(const job of Array.from(this.jobs.values()))void this.finish(job,undefined,new Error(reason));}
  private async finish(job:Probe,value?:unknown,error?:Error){
    if(job.done)return;job.done=true;if(error){clearTimeout(job.timer);job.reject(error);}
    // Cancellation cannot undo an unresolved tabs.create call. Keep its token
    // recoverable until the native call settles or its exact placeholder closes.
    const ownership:Ownership=job.creating&&job.tabId===undefined?{token:job.token,url:job.url,deadline:job.deadline,opening:true}:job;
    await this.closeOwned(ownership).catch(()=>{error??=new Error('Temporary signed-in source tab could not be closed; cleanup will be retried');});
    this.jobs.delete(job.token);
    try{await this.persist();}catch{error??=new Error('Temporary source ownership cleanup could not be retained');}
    clearTimeout(job.timer);if(error)job.reject(error);else job.resolve(value);this.pump();
  }
}
