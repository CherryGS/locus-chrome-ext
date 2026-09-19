import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedProbeManager } from './authenticated-probe';
import { probeIdentity, probeUrl } from './probe-protocol';
import { biliIdentity, biliProbeUrl, sameBiliDocument } from './bilibili-protocol';
import { partUrl } from '@locus/bilibili/urls';

let activeDocument='document-one';
let stored:Record<string,unknown>,tabs:Map<number,{id:number;url:string}>,nextId:number;
let removed:((id:number)=>void)[],updated:((id:number,change:{url?:string;status?:string})=>void)[];
let access:ReturnType<typeof vi.fn<() => Promise<unknown>>>,register:ReturnType<typeof vi.fn<() => Promise<void>>>,manager:AuthenticatedProbeManager;
const url='https://x.com/synthetic/status/601';
beforeEach(()=>{
  activeDocument='document-one';stored={};tabs=new Map([[99,{id:99,url:'https://x.com/home'}]]);nextId=1;removed=[];updated=[];access=vi.fn().mockResolvedValue(true);register=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome',{scripting:{executeScript:vi.fn(async(injection:{target:{tabId:number}})=>[{frameId:0,documentId:activeDocument,result:tabs.get(injection.target.tabId)?.url}])},runtime:{id:'synthetic',getURL:(path:string)=>`chrome-extension://synthetic/${path}`},storage:{session:{get:vi.fn(async()=>structuredClone(stored)),set:vi.fn(async(value:Record<string,unknown>)=>{stored={...stored,...structuredClone(value)};}),remove:vi.fn(async(key:string)=>{delete stored[key];})}},tabs:{onRemoved:{addListener:(fn:typeof removed[number])=>removed.push(fn)},onUpdated:{addListener:(fn:typeof updated[number])=>updated.push(fn)},query:vi.fn(async()=>[...tabs.values()]),get:vi.fn(async(id:number)=>{const value=tabs.get(id);if(!value)throw new Error('No tab');return value;}),create:vi.fn(async(options:{url:string;active:boolean})=>{const tab={id:nextId++,url:options.url};tabs.set(tab.id,tab);return tab;}),update:vi.fn(async(id:number,change:{url:string})=>{const tab=tabs.get(id);if(!tab)throw new Error('No tab');tab.url=change.url;return tab;}),remove:vi.fn(async(id:number)=>{if(!tabs.delete(id))throw new Error('No tab');for(const fn of removed)fn(id);})}});
  manager=new AuthenticatedProbeManager(access,register);
});
afterEach(()=>{manager.abort('Test ended');vi.useRealTimers();vi.restoreAllMocks();});
async function start(){const result=manager.request(url,Date.now()+40_000);void result.catch(()=>{});await vi.waitFor(()=>expect([...tabs.values()].some(tab=>!!probeIdentity(tab.url))).toBe(true));const tab=[...tabs.values()].find(tab=>probeIdentity(tab.url))!;const identity=probeIdentity(tab.url)!;const sender={id:'synthetic',tab:{id:tab.id},frameId:0,documentId:'document-one',url:tab.url} as chrome.runtime.MessageSender;return {result,tab,identity,sender};}

describe('owned authenticated source tabs',()=>{
  it('allows Bilibili tracking hydration only with the same P, nonce and active document',async()=>{
    manager=new AuthenticatedProbeManager(access,register,{key:'locus-bilibili-probes-v1',canonical:url=>partUrl(url).url,identify:biliIdentity,navigate:biliProbeUrl,matches:sameBiliDocument,limit:524288});
    const selected='https://www.bilibili.com/video/BV145PxzCEoE/?p=2',result=manager.request(selected,Date.now()+40000);void result.catch(()=>{});
    await vi.waitFor(()=>expect([...tabs.values()].some(tab=>biliIdentity(tab.url))).toBe(true));const tab=[...tabs.values()].find(tab=>biliIdentity(tab.url))!,identity=biliIdentity(tab.url)!;
    tab.url=tab.url.replace('?p=2#','?p=2&vd_source=hydration#');for(const fn of updated)fn(tab.id,{url:tab.url});
    const sender={id:'synthetic',tab:{id:tab.id},frameId:0,documentId:'document-one',url:tab.url} as chrome.runtime.MessageSender;
    await manager.ready(identity.token,selected,sender);await manager.accept({token:identity.token,url:selected,data:{bound:true}},sender);expect(await result).toEqual({bound:true});
    const changed=manager.request(selected,Date.now()+40000);void changed.catch(()=>{});await vi.waitFor(()=>expect([...tabs.values()].some(tab=>biliIdentity(tab.url))).toBe(true));const next=[...tabs.values()].find(tab=>biliIdentity(tab.url))!;for(const fn of updated)fn(next.id,{url:next.url.replace('?p=2#','?p=1#')});await expect(changed).rejects.toThrow('redirected');
  });
  it.each(['timeout','abort'] as const)('keeps write-ahead ownership through %s while tab creation is unresolved',async(reason)=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});
    let release!:(tab:chrome.tabs.Tab)=>void;
    const create=chrome.tabs.create;
    vi.spyOn(chrome.tabs,'create').mockImplementationOnce(async(options)=>{
      const tab=await create(options);
      return new Promise<chrome.tabs.Tab>(resolve=>{release=()=>resolve(tab);});
    });
    const result=manager.request(url,Date.now()+1000).catch(error=>error);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const placeholder=[...tabs.values()].find(tab=>tab.id!==99)!;
    const token=new URL(placeholder.url).hash.slice(1);
    tabs.set(98,{id:98,url:`https://x.com/home#${token}`});
    // Native creation is still pending and its tab is not yet discoverable.
    vi.spyOn(chrome.tabs,'query').mockImplementationOnce(async()=>[]);
    if(reason==='timeout')await vi.advanceTimersByTimeAsync(1001);else manager.abort();
    expect(await result).toBeInstanceOf(Error);
    await vi.waitFor(()=>expect(stored['locus-authenticated-probes-v1']).toEqual([{token,url,deadline:expect.any(Number),tabId:undefined,opening:true}]));
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    manager=new AuthenticatedProbeManager(access,register);
    await vi.waitFor(()=>expect(tabs.has(placeholder.id)).toBe(false));
    await vi.waitFor(()=>expect(stored['locus-authenticated-probes-v1']).toEqual([]));
    release(placeholder as chrome.tabs.Tab);
    await vi.waitFor(()=>expect(chrome.tabs.remove).toHaveBeenCalledTimes(2));
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(tabs.has(98)).toBe(true);expect(tabs.has(99)).toBe(true);
    expect(stored['locus-authenticated-probes-v1']).toEqual([]);
  });
  it.each(['timeout','abort'] as const)('closes an already-discoverable placeholder on %s without waiting for tabs.create to return',async(reason)=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});let release!:(tab:chrome.tabs.Tab)=>void;
    const create=chrome.tabs.create;
    vi.spyOn(chrome.tabs,'create').mockImplementationOnce(async(options)=>{const tab=await create(options);return new Promise<chrome.tabs.Tab>(resolve=>{release=()=>resolve(tab);});});
    const result=manager.request(url,Date.now()+1000).catch(error=>error);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));const placeholder=[...tabs.values()].find(tab=>tab.id!==99)!;
    if(reason==='timeout')await vi.advanceTimersByTimeAsync(1001);else manager.abort();expect(await result).toBeInstanceOf(Error);
    await vi.waitFor(()=>expect(tabs.has(placeholder.id)).toBe(false));await vi.waitFor(()=>expect(stored['locus-authenticated-probes-v1']).toEqual([]));
    expect(chrome.tabs.update).not.toHaveBeenCalled();expect(tabs.has(99)).toBe(true);
    release(placeholder as chrome.tabs.Tab);await vi.waitFor(()=>expect(chrome.tabs.remove).toHaveBeenCalledTimes(2));
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });
  it('counts unresolved cleanup toward capacity and retries token-only cleanup without dropping ownership',async()=>{
    let release!:(tab:chrome.tabs.Tab)=>void;
    vi.spyOn(chrome.tabs,'create').mockImplementationOnce(()=>new Promise<chrome.tabs.Tab>(resolve=>{release=resolve;}));
    const abandoned=manager.request(url,Date.now()+40_000).catch(error=>error);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));manager.abort();await abandoned;
    await vi.waitFor(()=>expect(stored['locus-authenticated-probes-v1']).toHaveLength(1));
    const ownership=(stored['locus-authenticated-probes-v1'] as {token:string}[])[0]!;
    let releaseQuery!:()=>void;const query=chrome.tabs.query;
    vi.spyOn(chrome.tabs,'query').mockImplementationOnce(()=>new Promise<chrome.tabs.Tab[]>(resolve=>{releaseQuery=()=>{void query({}).then(resolve);};}));
    const queued=Array.from({length:5},()=>manager.request(url,Date.now()+40_000).catch(error=>error));
    await expect(manager.request(url,Date.now()+40_000)).rejects.toThrow('capacity');
    const placeholder={id:77,url:`chrome-extension://synthetic/probe.html#${ownership.token}`};tabs.set(77,placeholder);
    await vi.waitFor(()=>expect(releaseQuery).toBeTypeOf('function'));releaseQuery();
    await vi.waitFor(()=>expect(tabs.has(77)).toBe(false));
    release(placeholder as chrome.tabs.Tab);manager.abort();await Promise.all(queued);
    expect(tabs.has(99)).toBe(true);
  });
  it('retries failed tab cleanup before admitting a later probe',async()=>{
    const first=await start();await manager.ready(first.identity.token,url,first.sender);vi.spyOn(chrome.tabs,'remove').mockImplementationOnce(async()=>{throw new Error('Temporary Chrome remove failure');});await manager.accept({token:first.identity.token,url,data:{}},first.sender);await expect(first.result).rejects.toThrow('could not be closed');expect(tabs.has(first.tab.id)).toBe(true);
    const result=manager.request(url,Date.now()+40_000);void result.catch(()=>{});await vi.waitFor(()=>expect(tabs.has(first.tab.id)).toBe(false));await vi.waitFor(()=>expect([...tabs.values()].some(tab=>tab.id!==99&&!!probeIdentity(tab.url))).toBe(true));const tab=[...tabs.values()].find(tab=>tab.id!==99)!;const identity=probeIdentity(tab.url)!,sender={...first.sender,tab:{...first.sender.tab!,id:tab.id},url:tab.url};await manager.ready(identity.token,url,sender);await manager.accept({token:identity.token,url,data:{retry:true}},sender);expect(await result).toEqual({retry:true});expect(tabs.size).toBe(1);
  });
  it('bounds stalled setup before creating a tab and never resumes it after timeout',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});let release!:()=>void;register.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    const result=manager.request(url,Date.now()+1000).catch(error=>error);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await vi.advanceTimersByTimeAsync(1001);expect(await result).toBeInstanceOf(Error);expect(chrome.tabs.create).not.toHaveBeenCalled();release();await Promise.resolve();await Promise.resolve();expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
  it('rejects a delayed old-document payload after a same-URL reload without waiting for a new ready handshake',async()=>{
    const {result,identity,sender,tab}=await start();await manager.ready(identity.token,url,sender);activeDocument='document-two';await expect(manager.accept({token:identity.token,url,data:{}},sender)).rejects.toThrow('active selected document');await expect(result).rejects.toThrow('active selected document');expect(tabs.has(tab.id)).toBe(false);
  });
  it('accepts the same document after a late initial-loading notification',async()=>{
    const {result,identity,sender}=await start();await manager.ready(identity.token,url,sender);for(const fn of updated)fn(sender.tab!.id!,{status:'loading'});await manager.accept({token:identity.token,url,data:{source:'same-document'}},sender);expect(await result).toEqual({source:'same-document'});
  });
  it('creates inactive placeholder, persists ownership before navigation, binds a document, and closes only that tab',async()=>{
    const {result,tab,identity,sender}=await start();expect(chrome.tabs.create).toHaveBeenCalledWith({url:`chrome-extension://synthetic/probe.html#${identity.token}`,active:false});expect(chrome.tabs.update).toHaveBeenCalledWith(tab.id,{url:probeUrl(url,identity.token),active:false});
    expect(JSON.stringify(stored)).not.toContain('tweet');await manager.ready(identity.token,url,sender);await manager.accept({token:identity.token,url,data:{schema:'minimal-projection'}},sender);expect(await result).toEqual({schema:'minimal-projection'});expect(tabs.has(tab.id)).toBe(false);expect(tabs.has(99)).toBe(true);expect(stored['locus-authenticated-probes-v1']).toEqual([]);
  });
  it('rejects unrelated tab, token, URL and document, and will not accept data before ready',async()=>{
    const {result,identity,sender}=await start();for(const wrong of [{...sender,tab:{id:99}},{...sender,frameId:1},{...sender,url:url+'#other'}])await expect(manager.ready(identity.token,url,wrong as chrome.runtime.MessageSender)).rejects.toThrow();
    await expect(manager.ready(crypto.randomUUID(),url,sender)).rejects.toThrow();await expect(manager.ready(identity.token,url.replace('601','602'),sender)).rejects.toThrow();await expect(manager.accept({token:identity.token,url,data:{}},sender)).rejects.toThrow('authorization');await manager.ready(identity.token,url,sender);await expect(manager.accept({token:identity.token,url,data:{}},{...sender,documentId:'other'})).rejects.toThrow();manager.abort();await expect(result).rejects.toThrow();
  });
  it('interrupts immediately on removal and rejects late successful data after regrant',async()=>{
    const {result,identity,sender,tab}=await start();await manager.ready(identity.token,url,sender);manager.abort();await expect(result).rejects.toThrow('access removed');await expect(manager.accept({token:identity.token,url,data:{}},sender)).rejects.toThrow();expect(tabs.has(tab.id)).toBe(false);expect(tabs.has(99)).toBe(true);
  });
  it('reports redirects and closure rather than substituting another source',async()=>{
    let item=await start();for(const fn of updated)fn(item.tab.id,{url:'https://x.com/i/flow/login'});await expect(item.result).rejects.toThrow('redirected');item=await start();await chrome.tabs.remove(item.tab.id);await expect(item.result).rejects.toThrow('closed');
  });
  it('bounds active/waiting probes and includes waiting time in deadline',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});const requests=Array.from({length:6},()=>manager.request(url,Date.now()+40_000).catch(error=>error));await vi.waitFor(()=>expect(chrome.tabs.update).toHaveBeenCalledTimes(2));await expect(manager.request(url,Date.now()+40_000)).rejects.toThrow('capacity');await vi.advanceTimersByTimeAsync(25_001);expect((await Promise.all(requests)).every(value=>value instanceof Error)).toBe(true);expect(tabs.size).toBe(1);
  });
  it('keeps payload limits and permission checks separate from source projection',async()=>{
    const {result,identity,sender}=await start();await manager.ready(identity.token,url,sender);await expect(manager.accept({token:identity.token,url,data:'x'.repeat(262144)},sender)).rejects.toThrow('limit');access.mockRejectedValue(new Error('Permission denied'));await expect(manager.accept({token:identity.token,url,data:{}},sender)).rejects.toThrow('Permission denied');manager.abort();await expect(result).rejects.toThrow();
  });
  it('recovers owned orphan tabs and placeholders after worker loss without closing a user tab or restarting source work',async()=>{
    const token=crypto.randomUUID();tabs.set(7,{id:7,url:'https://x.com/i/flow/login'});tabs.set(8,{id:8,url:`chrome-extension://synthetic/probe.html#${token}`});stored['locus-authenticated-probes-v1']=[{token:crypto.randomUUID(),url,tabId:7,deadline:1},{token,url,deadline:1}];
    manager=new AuthenticatedProbeManager(access,register);await vi.waitFor(()=>expect(tabs.size).toBe(1));expect(tabs.has(99)).toBe(true);expect(chrome.tabs.create).not.toHaveBeenCalled();expect(chrome.tabs.update).not.toHaveBeenCalled();
  });
});
