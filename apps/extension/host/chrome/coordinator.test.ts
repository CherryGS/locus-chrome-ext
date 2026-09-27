import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCoordinator } from './coordinator';
import { ResultDatabase } from './database';
import type { Delivery } from '@locus/capture-core/model';
import { syntheticSnapshot } from '@/testing/result-fixture';

let listener: (message: unknown, sender: unknown, callback: (value: any) => void) => void;
let changed: (delta: {id:number}) => void;
let contexts: ReturnType<typeof vi.fn>;
let native: ReturnType<typeof vi.fn>;
let search: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn>;
let permissions: ReturnType<typeof vi.fn>;
let removedPermissions:(removed:chrome.permissions.Permissions)=>void;
let addedPermissions:()=>void;
const runtimeUrl = (path: string) => `chrome-extension://synthetic/${path}`;
const event = () => ({addListener: vi.fn()});
beforeEach(() => {
  vi.stubGlobal('indexedDB',new IDBFactory());
  contexts = vi.fn().mockResolvedValue([{documentUrl:runtimeUrl('offscreen.html')}]);
  permissions=vi.fn().mockResolvedValue(false);native = vi.fn().mockResolvedValue(7); search = vi.fn().mockResolvedValue([{id:7,state:'in_progress',danger:'safe'}]);
  send = vi.fn().mockImplementation(async (message: {op:string}) => ({ok:true,value:message.op === 'export-state' ? {state:'packaging'} : true}));
  vi.stubGlobal('chrome',{ alarms:{get:vi.fn().mockResolvedValue(undefined),create:vi.fn(),clear:vi.fn(),onAlarm:event()},declarativeNetRequest:{getSessionRules:vi.fn().mockResolvedValue([]),updateSessionRules:vi.fn().mockResolvedValue(undefined)}, runtime:{id:'synthetic',getURL:runtimeUrl,getContexts:contexts,sendMessage:send,onMessage:{addListener:(handler:typeof listener)=>{listener=handler;}},onStartup:event(),onInstalled:event()}, action:{onClicked:event()}, permissions:{contains:permissions,onAdded:{addListener:(handler:typeof addedPermissions)=>{addedPermissions=handler;}},onRemoved:{addListener:(handler:typeof removedPermissions)=>{removedPermissions=handler;}}}, storage:{session:{get:vi.fn().mockResolvedValue({}),set:vi.fn().mockResolvedValue(undefined),remove:vi.fn().mockResolvedValue(undefined)}}, scripting:{getRegisteredContentScripts:vi.fn().mockResolvedValue([]),registerContentScripts:vi.fn().mockResolvedValue(undefined),updateContentScripts:vi.fn().mockResolvedValue(undefined),unregisterContentScripts:vi.fn().mockResolvedValue(undefined)}, tabs:{query:vi.fn().mockResolvedValue([]),onRemoved:event(),onUpdated:event()}, downloads:{download:native,search,onChanged:{addListener:(handler:typeof changed)=>{changed=handler;}}} });
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function message(op:string, values:Record<string,unknown>={}, origin='results.html') {
  const response = await new Promise<any>(resolve=>listener({target:'coordinator',op,...values},{id:'synthetic',url:runtimeUrl(origin)},resolve));
  if (!response.ok) throw new Error(response.error); return response.value;
}
function delivery(): Delivery { return {id:crypto.randomUUID(),resultId:crypto.randomUUID(),revision:1,createdAt:new Date().toISOString(),state:'packaging',partial:false}; }
describe('wakeable native delivery coordination',()=>{
  it('never exposes the saved Locus Token through settings reads or source messages',async()=>{
    const database=new ResultDatabase();await database.saveLocusConnection({origin:'http://127.0.0.1:46321',token:'private-secret'});await database.close();
    startCoordinator();expect(await message('locus-settings')).toEqual({origin:'http://127.0.0.1:46321',configured:true});
    await expect(message('locus-settings',{},'offscreen.html')).rejects.toThrow('results page');
    await expect(message('locus-connect',{origin:'https://outside.example',token:'private-secret'})).rejects.toThrow('address from Locus Settings');
    const response=await new Promise<any>(resolve=>listener({target:'coordinator',op:'locus-settings'},{id:'synthetic',url:'https://x.com/example/status/1',tab:{id:1},frameId:0,documentId:'doc'},resolve));
    expect(response.ok).toBe(false);expect(JSON.stringify(response)).not.toContain('private-secret');
  });
  it('upgrades persisted Bilibili page registration without expanding source probes to listings',async()=>{
    permissions.mockResolvedValue(true);
    vi.mocked(chrome.scripting.getRegisteredContentScripts).mockImplementation(async filter=>(filter?.ids??[]).filter(id=>id.startsWith('locus-bilibili')).map(id=>({id,matches:id==='locus-bilibili'?['https://www.bilibili.com/*','https://space.bilibili.com/*']:['https://www.bilibili.com/*']})));
    startCoordinator();await message('activate');
    const updates=vi.mocked(chrome.scripting.updateContentScripts).mock.calls.flatMap(([scripts])=>scripts);
    expect(updates.some(script=>script.id==='locus-bilibili'&&script.matches?.includes('https://space.bilibili.com/*'))).toBe(true);
    expect(updates.some(script=>script.id==='locus-bilibili'&&script.matches?.includes('https://search.bilibili.com/*'))).toBe(true);
    expect(updates.some(script=>script.id==='locus-bilibili-main'||script.id==='locus-bilibili-bridge')).toBe(false);
  });
  it('accepts ordinary card selections across granted Bilibili pages while rejecting other origins and source types',async()=>{
    permissions.mockResolvedValue(true);startCoordinator();await message('activate');send.mockClear();
    const selected='https://www.bilibili.com/video/BV145PxzCEoE/?p=2';
    const inspect=(url:string,source=selected)=>new Promise<any>(resolve=>listener({target:'coordinator',op:'inspect',url:source},{id:'synthetic',url,tab:{id:7},frameId:0,documentId:'listing-doc'},resolve));
    for(const page of ['https://www.bilibili.com/','https://space.bilibili.com/123/favlist?fid=456','https://space.bilibili.com/123/video','https://www.bilibili.com/v/popular/all','https://search.bilibili.com/all?keyword=fixture','https://search.bilibili.com/video?keyword=fixture'])expect((await inspect(page)).ok).toBe(true);
    for(const page of ['https://search.bilibili.com.evil.test/all','http://search.bilibili.com/all','http://www.bilibili.com/','https://www.bilibili.com.evil.test/'])expect((await inspect(page)).ok).toBe(false);
    expect((await inspect('https://www.bilibili.com/','https://www.bilibili.com/bangumi/play/ep123')).ok).toBe(false);
    expect((await inspect('https://www.bilibili.com/','https://x.com/user/status/123')).ok).toBe(false);
    expect((await inspect('https://search.bilibili.com/all','https://search.bilibili.com/video/BV145PxzCEoE/')).ok).toBe(false);
    expect(send.mock.calls.filter(([request])=>request.op==='inspect')).toHaveLength(6);
    permissions.mockResolvedValue(false);
    expect((await inspect('https://search.bilibili.com/all')).ok).toBe(false);
    expect(send.mock.calls.filter(([request])=>request.op==='inspect')).toHaveLength(6);
  });
  it('invalidates an old inspection across delayed owner creation and site withdrawal/regrant',async()=>{
    permissions.mockResolvedValue(true);contexts.mockResolvedValue([]);let created!:()=>void;
    Object.assign(chrome,{offscreen:{createDocument:vi.fn(()=>new Promise<void>(resolve=>{created=()=>{contexts.mockResolvedValue([{documentUrl:runtimeUrl('offscreen.html')}]);resolve();};}))}});
    startCoordinator();const selected='https://www.bilibili.com/video/BV145PxzCEoE/?p=2';
    const response=new Promise<any>(resolve=>listener({target:'coordinator',op:'inspect',url:selected},{id:'synthetic',url:selected,tab:{id:1},frameId:0,documentId:'bili-doc'},resolve));
    await vi.waitFor(()=>expect(created).toBeTypeOf('function'));removedPermissions({origins:['https://www.bilibili.com/*']});addedPermissions();await new Promise(resolve=>setTimeout(resolve,0));created();
    const result=await response;expect(result.ok).toBe(false);expect(result.error).toContain('removed');expect(send.mock.calls.some(([request])=>request.op==='inspect')).toBe(false);
  });
  it('delivers Bilibili withdrawal while an unrelated Twitter inspection holds the owner queue',async()=>{
    permissions.mockResolvedValue(true);let finishInspect!:(value:unknown)=>void,finishRevoke!:(value:unknown)=>void;
    send.mockImplementation((request:{op:string;site?:string})=>request.op==='inspect'?new Promise(resolve=>{finishInspect=resolve;}):request.op==='revoke'&&request.site==='bilibili'?new Promise(resolve=>{finishRevoke=resolve;}):Promise.resolve({ok:true,value:true}));
    startCoordinator();
    const inspect=new Promise<any>(resolve=>listener({target:'coordinator',op:'inspect',url:'https://x.com/synthetic/status/123'},{id:'synthetic',url:'https://x.com/synthetic/status/123',tab:{id:1},frameId:0,documentId:'twitter-doc'},resolve));
    await vi.waitFor(()=>expect(finishInspect).toBeTypeOf('function'));
    removedPermissions({origins:['https://www.bilibili.com/*']});addedPermissions();
    await vi.waitFor(()=>expect(finishRevoke).toBeTypeOf('function'));await expect(message('access',{site:'bilibili'})).rejects.toThrow('must be interrupted');
    finishRevoke({ok:true,value:true});await vi.waitFor(async()=>expect(await message('access',{site:'bilibili'})).toBe(true));
    finishInspect({ok:true,value:{token:'test'}});expect((await inspect).ok).toBe(true);
  });
  it('latches relevant withdrawal despite a delayed activation and immediate regrant',async()=>{
    permissions.mockResolvedValue(true);vi.mocked(chrome.scripting.getRegisteredContentScripts).mockImplementation(async()=>[{id:'locus-twitter'}]);
    let releaseActivation!:(value:unknown[])=>void,releaseRevoke!:(value:unknown)=>void;
    vi.mocked(chrome.tabs.query).mockImplementation(()=>new Promise(resolve=>{releaseActivation=resolve as typeof releaseActivation;}) as never);
    send.mockImplementation((message:{op:string})=>message.op==='revoke'?new Promise(resolve=>{releaseRevoke=resolve;}):Promise.resolve({ok:true,value:true}));
    startCoordinator();await vi.waitFor(()=>expect(releaseActivation).toBeTypeOf('function'));
    permissions.mockResolvedValue(false);removedPermissions({origins:['https://x.com/*']});permissions.mockResolvedValue(true);addedPermissions();
    await vi.waitFor(()=>expect(releaseRevoke).toBeTypeOf('function'));await expect(message('access')).rejects.toThrow('must be interrupted');expect(send.mock.calls.filter(([request])=>request.op==='capture')).toHaveLength(0);
    releaseRevoke({ok:true,value:true});await vi.waitFor(async()=>expect(await message('access')).toBe(true));
    vi.mocked(chrome.tabs.query).mockImplementation(async()=>[]);releaseActivation([]);expect(send.mock.calls.filter(([request])=>request.op==='revoke')).toHaveLength(1);
  });
  it('authorizes bounded current-task observation without creating an owner or reading stored Blobs',async()=>{
    startCoordinator();await message('reconcile');contexts.mockResolvedValue([]);send.mockClear();
    const request=(sender:Record<string,unknown>)=>new Promise<any>(resolve=>listener({target:'coordinator',op:'capture-tasks'},sender,resolve));
    const page={id:'synthetic',url:'https://x.com/home',tab:{id:7},frameId:0,documentId:'doc'};
    expect((await request(page)).ok).toBe(false);permissions.mockResolvedValue(true);expect((await request(page)).value).toEqual([]);expect(send).not.toHaveBeenCalled();
    expect((await request({...page,frameId:1})).ok).toBe(false);expect((await request({...page,url:'https://example.com/'})).ok).toBe(false);
    const read=vi.spyOn(ResultDatabase.prototype,'read'),list=vi.spyOn(ResultDatabase.prototype,'list');
    contexts.mockResolvedValue([{documentUrl:runtimeUrl('offscreen.html')}]);send.mockResolvedValue({ok:true,value:[{id:'queued',queuePosition:1}]});expect((await request(page)).value).toEqual([{id:'queued',queuePosition:1}]);expect(read).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();
    send.mockResolvedValue({ok:false,error:'Owner query failed'});expect((await request(page)).error).toContain('Owner query failed');
    contexts.mockRejectedValue(new Error('Context query failed'));expect((await request(page)).error).toContain('Context query failed');
  });
  it('uses a keyed metadata read for passive exact result status',async()=>{
    startCoordinator();await message('reconcile');contexts.mockResolvedValue([]);const database=new ResultDatabase(),snapshot=syntheticSnapshot();await database.commit(snapshot);
    const metadata=vi.spyOn(ResultDatabase.prototype,'metadata'),list=vi.spyOn(ResultDatabase.prototype,'list'),read=vi.spyOn(ResultDatabase.prototype,'read');send.mockClear();
    expect((await message('status',{id:snapshot.result.id})).id).toBe(snapshot.result.id);expect(metadata).toHaveBeenCalledWith(snapshot.result.id);expect(list).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();await database.close();
  });
  it('bounds and authorizes page source summary lookup before contacting the owner',async()=>{
    startCoordinator();await message('reconcile');
    const request=async(urls:unknown,sender:Record<string,unknown>={id:'synthetic',url:'https://x.com/home',tab:{id:7},frameId:0,documentId:'doc'})=>new Promise<any>(resolve=>listener({target:'coordinator',op:'source-status',urls},sender,resolve));
    expect((await request(['https://x.com/a/status/123'])).ok).toBe(false);
    permissions.mockResolvedValue(true);
    send.mockResolvedValue({ok:true,value:[]});
    const response=await request(['https://x.com/a/status/123','https://twitter.com/b/status/123']);expect(response.ok).toBe(true);expect(send).toHaveBeenCalledWith({target:'offscreen',op:'source-status',sourceIds:['123'],site:'twitter'});
    for(const urls of [[],Array(51).fill('https://x.com/a/status/123'),['https://example.com/a/status/123'],[null]])expect((await request(urls)).ok).toBe(false);
    expect((await request(['https://x.com/a/status/123'],{id:'synthetic',url:runtimeUrl('results.html')})).ok).toBe(false);
    expect((await request(['https://x.com/a/status/123'],{id:'synthetic',url:'https://x.com/home',tab:{id:7},frameId:1,documentId:'doc'})).ok).toBe(false);
    contexts.mockResolvedValue([]);send.mockClear();expect((await request(['https://x.com/a/status/123'])).value).toEqual([{sourceId:'123',summary:null}]);expect(send).not.toHaveBeenCalled();
    const db=new ResultDatabase(),pending=syntheticSnapshot();pending.result.site='twitter';pending.result.sourceUrl='https://x.com/a/status/123';pending.result.assets[0]!.acquisition={state:'pending'};pending.blobs={};await db.commit(pending);
    const unresolved=(await request(['https://x.com/a/status/123'])).value[0];expect(unresolved.summary.id).toBe(pending.result.id);expect(unresolved.unresolvedReason).toContain('cannot be verified');
    expect((await message('status',{id:pending.result.id})).unresolvedReason).toContain('execution is unavailable');expect(send).not.toHaveBeenCalled();await db.close();
    vi.spyOn(ResultDatabase.prototype,'list').mockRejectedValue(new Error('Storage unavailable'));expect((await request(['https://x.com/a/status/123'])).error).toContain('Storage unavailable');
  });
  it('serializes overlapping searches for one native delivery',async()=>{
    startCoordinator();await message('reconcile');
    const database=new ResultDatabase();const row={...delivery(),state:'in_progress',dispatch:'attempted',downloadId:7} as Delivery;await database.saveDelivery(row);
    let release!: (value: unknown[])=>void;
    search.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue([{id:7,state:'complete',danger:'safe'}]);
    const first=message('reconcile');await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const second=message('reconcile');await new Promise(resolve=>setTimeout(resolve,20));expect(search).toHaveBeenCalledTimes(1);
    release([{id:7,state:'in_progress',danger:'safe'}]);await Promise.all([first,second]);expect((await database.deliveries())[0]!.state).toBe('complete');await database.close();
  });
  it('queries surviving packaging before dispatch and still issues its first native download exactly once',async()=>{
    const database = new ResultDatabase(); const row=delivery(); await database.saveDelivery(row); startCoordinator();
    await message('reconcile'); expect(native).not.toHaveBeenCalled();
    const ready={...row,state:'starting',url:`blob:${runtimeUrl(crypto.randomUUID())}`} as Delivery;
    await message('native-download',{delivery:ready},'offscreen.html'); expect(native).toHaveBeenCalledTimes(1);
    expect((await database.deliveries())[0]!.state).toBe('in_progress');
    await message('native-download',{delivery:{...ready,state:'starting'}},'offscreen.html'); expect(native).toHaveBeenCalledTimes(1);
    await database.close();
  });
  it('reconciles attempted dispatch by Blob URL after worker loss without duplicate reissue',async()=>{
    const database=new ResultDatabase(); const row={...delivery(),state:'starting',dispatch:'attempted',url:`blob:${runtimeUrl(crypto.randomUUID())}`} as Delivery; await database.saveDelivery(row);
    startCoordinator(); await message('reconcile'); expect(native).not.toHaveBeenCalled(); expect((await database.deliveries())[0]!.downloadId).toBe(7); await database.close();
  });
  it('retains confirmed completion when later history access fails',async()=>{
    const database=new ResultDatabase(); const row={...delivery(),state:'in_progress',dispatch:'attempted',downloadId:7} as Delivery; await database.saveDelivery(row);
    search.mockResolvedValue([{id:7,state:'complete',danger:'safe'}]); startCoordinator(); await message('reconcile');
    expect((await database.deliveries())[0]!.state).toBe('complete');
    search.mockRejectedValue(new Error('History unavailable')); changed({id:7}); await message('reconcile'); expect((await database.deliveries())[0]!.state).toBe('complete'); await database.close();
  });
  it('reports query failure separately from known packaging loss',async()=>{
    const database=new ResultDatabase(); const row=delivery(); await database.saveDelivery(row); startCoordinator();
    contexts.mockRejectedValue(new Error('Context query unavailable'));
    await message('reconcile').catch(()=>{}); expect((await database.deliveries())[0]!.state).toBe('packaging');
    contexts.mockResolvedValue([]); await message('reconcile'); expect((await database.deliveries())[0]!.state).toBe('failed'); await database.close();
  });
  it('rejects privileged operations from untrusted contexts',async()=>{
    startCoordinator(); await expect(message('native-download',{delivery:delivery()})).rejects.toThrow('Blob owner'); await expect(message('grant',{operation:'read',id:'not-an-id'})).rejects.toThrow('Invalid');
  });
});
