import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOffscreen } from './offscreen';
import { ResultDatabase } from './database';
import { CHANNEL, type ResultSummary, type Collection, type ReadResponse } from './protocol';
import type { TwitterCandidate } from '@/sites/twitter/source';

const mocks=vi.hoisted(()=>({load:vi.fn(),acquire:vi.fn(),coordinator:vi.fn()}));
vi.mock('./network',()=>({loadTwitter:mocks.load,acquireMedia:mocks.acquire}));
vi.mock('./protocol',async original=>({...await original<typeof import('./protocol')>(),coordinator:mocks.coordinator}));
let listener:(message:unknown,sender:unknown,respond:(reply:any)=>void)=>void;
let dispose:()=>void;
let allowed=true;
let starts:string[];
let held:Map<string,(blob:Blob)=>void>;
const candidate=(id:string):TwitterCandidate=>({sourceId:id,sourceUrl:`https://x.com/synthetic/status/${id}`,label:`Synthetic ${id}`,text:'Acquired synthetic message',textFailure:null,payload:{fullText:'Acquired synthetic message'},media:[{id:'media-1',sourceId:id,kind:'photo',url:`https://pbs.twimg.com/media/${id}.png`,reason:null,bitrate:null,sourceDimensions:null,representationDimensions:null,sourceOrder:null,quality:'Unverified',altText:null}]});
const blob=()=>new Blob(['fixture'],{type:'image/png'});
beforeEach(()=>{
  vi.stubGlobal('indexedDB',new IDBFactory());allowed=true;starts=[];held=new Map();
  vi.stubGlobal('chrome',{runtime:{id:'synthetic',getURL:(path:string)=>`chrome-extension://synthetic/${path}`,onMessage:{addListener:(handler:typeof listener)=>{listener=handler;}}}});
  mocks.load.mockReset().mockImplementation(async(url:string)=>candidate(url.split('/').at(-1)!));
  mocks.coordinator.mockReset().mockImplementation(async(op:string)=>{if(op==='access'&&!allowed)throw new Error('Twitter access denied');return true;});
  mocks.acquire.mockReset().mockImplementation((media:{sourceId:string},signal:AbortSignal)=>new Promise<Blob>((resolve,reject)=>{starts.push(media.sourceId);held.set(media.sourceId,resolve);signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true});}));
  dispose=startOffscreen();
});
afterEach(async()=>{dispose();await new Promise(resolve=>setTimeout(resolve,0));vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function command<T=any>(op:string,values:Record<string,unknown>={}):Promise<T>{const reply=await new Promise<any>(resolve=>listener({target:'offscreen',op,...values},{id:'synthetic',url:'chrome-extension://synthetic/background.js'},resolve));if(!reply.ok)throw new Error(reply.error);return reply.value;}
async function inspect(id:string){return command('inspect',{url:candidate(id).sourceUrl,owner:'source-document'});}
async function begin(id:string){const token=await inspect(id);return command<ResultSummary>('capture',{token:token.token,selected:['media-1'],owner:'source-document'});}
async function consume<T=any>(operation:string,id?:string):Promise<T>{const token=crypto.randomUUID(),channel=new BroadcastChannel(CHANNEL);await command('grant',{token,operation,id});return new Promise((resolve,reject)=>{channel.onmessage=event=>{if(event.data.requestId!==token)return;channel.close();if(event.data.ok)resolve(event.data.value);else reject(new Error(event.data.error));};channel.postMessage({requestId:token});});}
const tasks=()=>command<ResultSummary[]>('capture-tasks');
async function waitStarts(count:number){await vi.waitFor(()=>expect(starts).toHaveLength(count));}
async function finish(...ids:string[]){for(const id of ids)held.get(id)!(blob());await vi.waitFor(async()=>expect(await tasks()).toHaveLength(0));}

describe('bounded offscreen capture queue',()=>{
  it('persists queued scope once and dispatches FIFO behind two running jobs',async()=>{
    const one=await begin('1'),two=await begin('2');await waitStarts(2);
    const three=await begin('3'),four=await begin('4');expect(starts).toEqual(['1','2']);expect(three.queuePosition).toBe(1);expect(four.queuePosition).toBe(2);
    const pending=await consume<ReadResponse>('read',three.id);expect(pending.snapshot!.result.revision).toBe(1);expect(pending.snapshot!.result.retention).toEqual({state:'retained',revision:1});expect(pending.snapshot!.result.records[0]!.payload).toBeDefined();expect(pending.snapshot!.result.assets[0]!.acquisition.state).toBe('pending');
    expect((await consume<Collection>('list')).items.find(item=>item.id===three.id)?.queuePosition).toBe(1);expect((await command('source-status',{sourceIds:['3']}))[0].summary.queuePosition).toBe(1);expect((await command('status',{id:four.id})).queuePosition).toBe(2);
    expect((await tasks()).map(item=>item.id)).toEqual([one.id,two.id,three.id,four.id]);expect(JSON.stringify(await tasks())).not.toContain('payload');expect(await command('prepare-close')).toBe(false);
    held.get('2')!(blob());await waitStarts(3);expect(starts).toEqual(['1','2','3']);expect((await tasks()).find(item=>item.id===four.id)?.queuePosition).toBe(1);
    held.get('1')!(blob());await waitStarts(4);expect(starts).toEqual(['1','2','3','4']);await finish('3','4');
    const completed=await command('status',{id:three.id});expect(completed.revision).toBe(2);expect(completed.retention).toEqual({state:'retained',revision:2});expect(completed.queuePosition).toBeUndefined();
  });
  it('keeps accepted candidate data after its consumed token expires and the original document is no longer involved',async()=>{
    await begin('1');await begin('2');await waitStarts(2);const inspection=await inspect('3');const three=await command<ResultSummary>('capture',{token:inspection.token,selected:['media-1'],owner:'source-document'});
    await expect(command('capture',{token:inspection.token,selected:['media-1'],owner:'source-document'})).rejects.toThrow('expired');
    const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+6*60_000);expect((await tasks()).find(item=>item.id===three.id)?.queuePosition).toBe(1);
    held.get('1')!(blob());await waitStarts(3);expect(starts[2]).toBe('3');await finish('2','3');
  });
  it('bounds admission to two running plus twenty waiting and leaves rejected tokens retryable',async()=>{
    const accepted=[];for(let n=1;n<=22;n++)accepted.push(await begin(String(n)));await waitStarts(2);expect((await tasks()).filter(item=>item.queuePosition)).toHaveLength(20);
    const extra=await inspect('23');await expect(command('capture',{token:extra.token,selected:['media-1'],owner:'source-document'})).rejects.toThrow('queue is full');
    held.get('1')!(blob());await waitStarts(3);const retry=await command<ResultSummary>('capture',{token:extra.token,selected:['media-1'],owner:'source-document'});expect(retry.queuePosition).toBe(20);
    await command('revoke');await vi.waitFor(async()=>expect(await tasks()).toHaveLength(0));expect(starts).toEqual(['1','2','3']);
    const database=new ResultDatabase();expect(await database.metadata(accepted[2]!.id)).not.toHaveProperty('queuePosition');await database.close();
  });
  it('clears waiting work before dispatch and rejects a late initial commit without resurrection',async()=>{
    await begin('1');await begin('2');await waitStarts(2);
    const commit=ResultDatabase.prototype.commit;let release!:()=>void;
    vi.spyOn(ResultDatabase.prototype,'commit').mockImplementation(async function(this:ResultDatabase,snapshot){if(snapshot.result.sourceUrl.endsWith('/3'))await new Promise<void>(resolve=>{release=resolve;});return commit.call(this,snapshot);});
    const admission=begin('3').catch(error=>error);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));const third=(await tasks()).find(item=>item.sourceUrl.endsWith('/3'))!;
    await consume('clear',third.id);release();expect(await admission).toBeInstanceOf(Error);held.get('1')!(blob());await vi.waitFor(async()=>expect((await tasks()).length).toBe(1));expect(starts).toEqual(['1','2']);expect(await command('status',{id:third.id})).toBeNull();await finish('2');
  });
  it('withdrawal aborts active and queued work permanently even if access is granted again',async()=>{
    await begin('1');await begin('2');const queued=await begin('3');await waitStarts(2);allowed=false;await command('revoke');await vi.waitFor(async()=>expect(await tasks()).toHaveLength(0));
    const read=await consume<ReadResponse>('read',queued.id);expect(read.snapshot!.result.assets[0]!.acquisition.reason).toContain('access was removed');expect(read.snapshot!.result.records[0]!.acquisition.state).toBe('acquired');expect(starts).toEqual(['1','2']);allowed=true;await command('hello');expect(await tasks()).toEqual([]);expect(starts).toEqual(['1','2']);
    await begin('4');await waitStarts(3);await finish('4');
  });
  it('checks actual permission again before dispatch and frees a denied slot without a media request',async()=>{
    await begin('1');await begin('2');const queued=await begin('3');await waitStarts(2);allowed=false;held.get('1')!(blob());await vi.waitFor(async()=>expect((await command('status',{id:queued.id})).acquisition).toBe('partial'));expect(starts).toEqual(['1','2']);
    await expect(begin('4')).rejects.toThrow('access denied');await command('revoke');await vi.waitFor(async()=>expect(await tasks()).toHaveLength(0));
  });
  it('recovers queued and running committed scopes after owner loss without resuming their network work',async()=>{
    const accepted=[await begin('1'),await begin('2'),await begin('3')];await waitStarts(2);dispose();await new Promise(resolve=>setTimeout(resolve,0));dispose=startOffscreen();await command('hello');
    expect(await tasks()).toEqual([]);expect(starts).toEqual(['1','2']);for(const item of accepted){const read=await consume<ReadResponse>('read',item.id);expect(read.snapshot!.result.assets[0]!.acquisition.reason).toContain('Interrupted');expect(read.snapshot!.result.retention.state).toBe('retained');}
  });
  it('does not let passive current-task reads touch storage, network, or extend idle lifetime',async()=>{
    dispose();vi.useFakeTimers({toFake:['setInterval','clearInterval','Date']});dispose=startOffscreen();await command('hello');const list=vi.spyOn(ResultDatabase.prototype,'list'),read=vi.spyOn(ResultDatabase.prototype,'read');mocks.coordinator.mockClear();
    await vi.advanceTimersByTimeAsync(59_000);expect(await tasks()).toEqual([]);expect(list).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(16_000);expect(mocks.coordinator).toHaveBeenCalledWith('idle');
  });
  it('does not retain more than the aggregate live-byte limit after storage failures',async()=>{
    vi.spyOn(ResultDatabase.prototype,'commit').mockRejectedValue(new Error('Storage full'));await begin('1');await begin('2');const third=await begin('3'),fourth=await begin('4');await waitStarts(2);
    const large=()=>{const value=blob();Object.defineProperty(value,'size',{value:256*1048576});return value;};
    held.get('1')!(large());await waitStarts(3);held.get('2')!(large());await vi.waitFor(async()=>expect((await tasks()).length).toBe(2));held.get('3')!(large());await vi.waitFor(async()=>expect(await tasks()).toHaveLength(0));
    const read=await consume<ReadResponse>('read',third.id);expect(read.snapshot!.result.assets[0]!.acquisition.reason).toContain('memory limit');expect(read.snapshot!.blobs).toEqual({});await vi.waitFor(async()=>expect((await consume<ReadResponse>('read',fourth.id)).snapshot!.result.assets[0]!.acquisition.reason).toContain('could not start'));expect(starts).toEqual(['1','2','3']);await expect(begin('5')).rejects.toThrow('memory limit');
  });
});
