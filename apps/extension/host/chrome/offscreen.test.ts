import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOffscreen } from './offscreen';
import { ResultDatabase } from './database';
import { CHANNEL, type ReadResponse } from './protocol';
import type { TwitterCandidate } from '@locus/twitter/source';
import { projectBilibili } from '@locus/bilibili/projection';
import { syntheticSnapshot } from '@/testing/result-fixture';

const mocks = vi.hoisted(() => ({ acquire: vi.fn(), load: vi.fn(), coordinator: vi.fn(), archive: vi.fn(), acquireBili: vi.fn() }));
vi.mock('./bilibili-media',()=>({acquireBilibili:mocks.acquireBili}));
vi.mock('./network', () => ({ acquireMedia: mocks.acquire, loadTwitter: mocks.load }));
vi.mock('./protocol', async original => ({ ...await original<typeof import('./protocol')>(), coordinator: mocks.coordinator }));
vi.mock('./archive', () => ({ createArchive: mocks.archive }));
let listener: (message: unknown, sender: unknown, respond: (value: any) => void) => void;
let dispose: (() => void) | undefined;
const candidate: TwitterCandidate = { sourceId:'1', sourceUrl:'https://x.com/synthetic/status/1', label:'Synthetic post', text:'Synthetic text', textFailure:null, payload:{fullText:'Synthetic text'}, media:[1,2].map(index => ({ id:`media-${index}`, sourceId:String(index), kind:'photo', url:`https://pbs.twimg.com/media/synthetic${index}.jpg`, reason:null, bitrate:null, sourceDimensions:null, representationDimensions:null, sourceOrder:null, quality:'Unverified', altText:null })) };
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('chrome', { runtime:{ id:'synthetic', getURL:(path: string) => `chrome-extension://synthetic/${path}`, onMessage:{ addListener:(handler: typeof listener) => { listener = handler; } } } });
  mocks.acquireBili.mockReset();mocks.coordinator.mockReset().mockResolvedValue(true); mocks.load.mockReset().mockResolvedValue(structuredClone(candidate)); mocks.acquire.mockReset().mockImplementation(async (media: {id: string}) => new Blob([media.id],{type:'image/jpeg'}));
  dispose = startOffscreen();
});
afterEach(() => { dispose?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function command(op: string, values: Record<string, unknown> = {}) {
  const reply = await new Promise<any>(resolve => listener({target:'offscreen', op, ...values}, {id:'synthetic', url:'chrome-extension://synthetic/background.js'}, resolve));
  if (!reply.ok) throw new Error(reply.error); return reply.value;
}
async function consume<T>(operation: string, id?: string): Promise<T> {
  const token = crypto.randomUUID(); const channel = new BroadcastChannel(CHANNEL);
  await command('grant', {token, operation, id});
  return new Promise((resolve, reject) => { channel.onmessage = event => { if (event.data.requestId !== token) return; channel.close(); if (event.data.ok) resolve(event.data.value); else reject(new Error(event.data.error)); }; channel.postMessage({requestId:token}); });
}
async function begin() { const inspection = await command('inspect',{url:candidate.sourceUrl, owner:'tab:doc'}); return command('capture',{token:inspection.token, selected:['media-1','media-2'], owner:'tab:doc'}); }
describe('offscreen producer lifetime', () => {
  it('publishes live byte progress without committing stream chunks', async () => {
    let release!: (blob: Blob) => void;
    let progress!: (value: { receivedBytes: number; totalBytes: number | null }) => void;
    mocks.acquire.mockImplementationOnce((_media, _signal, observe) => { progress = observe;return new Promise<Blob>(resolve => { release = resolve; }); });
    const accepted = await begin();await vi.waitFor(() => expect(progress).toBeTypeOf('function'));
    const commit = vi.spyOn(ResultDatabase.prototype, 'commit');
    progress({ receivedBytes: 40, totalBytes: 100 });
    expect((await command('capture-tasks'))[0].progress.percent).toBe(20);
    progress({ receivedBytes: 80, totalBytes: 100 });
    expect((await command('status', { id: accepted.id })).progress.percent).toBe(40);
    expect(commit).not.toHaveBeenCalled();
    release(new Blob(['media'], { type: 'image/jpeg' }));
    await vi.waitFor(async () => expect((await command('status', { id: accepted.id })).progress.percent).toBe(100));
  });
  it('interrupts only the withdrawn site and cannot retain late Bilibili bytes after rapid regrant',async()=>{
    const sourceUrl='https://www.bilibili.com/video/BV145PxzCEoE/?p=2',cid='123';
    const track=(id:number,codecs:string)=>({id,codecs,bandwidth:100,width:320,height:180,baseUrl:`https://synthetic.bilivideo.com/upgcxcode/1/2/${cid}/${cid}-1-${id}.m4s`});
    const source=projectBilibili({bvid:'BV145PxzCEoE',aid:'1',cid,p:2,videoData:{bvid:'BV145PxzCEoE',title:'Synthetic',desc:'',desc_v2:null,rights:{ugc_pay_preview:0,is_stein_gate:0},pic:'https://i0.hdslb.com/bfs/archive/synthetic.png',pages:[{page:2,cid,duration:3}]}},{code:0,data:{timelength:3000,accept_quality:[64],support_formats:[{quality:64}],dash:{video:[track(64,'avc1.64000d')],audio:[track(30280,'mp4a.40.2')]}}},sourceUrl,true);
    mocks.coordinator.mockImplementation(async(op:string)=>op==='bilibili-source'?source:true);
    let finishTwitter!:(blob:Blob)=>void,finishBilibili!:(blob:Blob)=>void;
    mocks.acquire.mockImplementationOnce(()=>new Promise<Blob>(resolve=>{finishTwitter=resolve;}));
    mocks.acquireBili.mockImplementation((media:{kind:string})=>media.kind==='cover'?Promise.resolve(new Blob(['cover'],{type:'image/png'})):new Promise<Blob>(resolve=>{finishBilibili=resolve;}));
    const twitter=await begin();const inspected=await command('inspect',{site:'bilibili',url:sourceUrl,owner:'bili-doc'});const bili=await command('capture',{site:'bilibili',token:inspected.token,selected:['media-1','media-2'],owner:'bili-doc'});
    await vi.waitFor(()=>expect(finishBilibili).toBeTypeOf('function'));
    const secondInspection=await command('inspect',{site:'bilibili',url:sourceUrl,owner:'bili-doc'});const second=await command('capture',{site:'bilibili',token:secondInspection.token,selected:['media-1','media-2'],owner:'bili-doc'});
    expect(second.queuePosition).toBe(1);expect(mocks.acquireBili).toHaveBeenCalledTimes(2);await command('revoke',{site:'bilibili'});
    finishBilibili(new Blob(['late video'],{type:'video/mp4'}));finishTwitter(new Blob(['photo'],{type:'image/jpeg'}));
    await vi.waitFor(async()=>expect((await command('status',{id:twitter.id})).acquisition).toBe('complete'));
    await vi.waitFor(async()=>expect((await command('status',{id:bili.id})).acquisition).toBe('partial'));
    const read=await consume<ReadResponse>('read',bili.id);expect(read.snapshot!.blobs['media-2']).toBeUndefined();expect(read.snapshot!.blobs['media-1']).toBeInstanceOf(Blob);
    expect((await consume<ReadResponse>('read',second.id)).snapshot!.result.assets.every(asset=>asset.acquisition.state==='unavailable')).toBe(true);expect(mocks.acquireBili).toHaveBeenCalledTimes(2);
  });
  it('returns live source overrides without storage, payloads, Blobs or network acquisition', async () => {
    let release!: (blob:Blob)=>void;mocks.acquire.mockImplementationOnce(()=>new Promise<Blob>(resolve=>{release=resolve;}));
    const accepted=await begin();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const read=vi.spyOn(ResultDatabase.prototype,'read'),list=vi.spyOn(ResultDatabase.prototype,'list');mocks.load.mockClear();
    const values=await command('source-status',{sourceIds:['1','789']});expect(values[0].summary.id).toBe(accepted.id);expect(values[1]).toEqual({sourceId:'789',summary:null});expect(JSON.stringify(values)).not.toContain('payload');expect(read).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled();
    release(new Blob(['media'],{type:'image/jpeg'}));await vi.waitFor(async()=>expect((await command('status',{id:accepted.id})).acquisition).toBe('complete'));
  });
  it('exposes new acquired bytes as pending retention until their own transaction commits', async () => {
    const commit = ResultDatabase.prototype.commit;
    let release!: () => void;
    vi.spyOn(ResultDatabase.prototype, 'commit').mockImplementation(async function(this: ResultDatabase, snapshot) {
      if (snapshot.result.revision === 2) await new Promise<void>(resolve => { release = resolve; });
      return commit.call(this, snapshot);
    });
    const accepted = await begin(); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const read = await consume<ReadResponse>('read', accepted.id);
    expect(read.snapshot!.result.revision).toBe(2); expect(read.snapshot!.result.retention).toEqual({state:'pending',revision:1}); expect(read.snapshot!.blobs['media-1']).toBeInstanceOf(Blob);
    release(); await vi.waitFor(async () => expect((await command('status',{id:accepted.id})).acquisition).toBe('complete'));
  });
  it('retries recovery after a transient read failure before classifying known-lost pending work', async () => {
    dispose?.(); const database = new ResultDatabase(); const snapshot = syntheticSnapshot(); snapshot.result.assets[0]!.acquisition={state:'pending'};snapshot.blobs={};await database.commit(snapshot);
    const read=ResultDatabase.prototype.read;let fail=true;
    vi.spyOn(ResultDatabase.prototype,'read').mockImplementation(function(this: ResultDatabase,id){if(fail){fail=false;return Promise.reject(new Error('Transient read failure'));}return read.call(this,id);});
    dispose=startOffscreen(); await command('hello'); await command('hello');
    const recovered=await consume<ReadResponse>('read',snapshot.result.id);expect(recovered.snapshot!.result.assets[0]!.acquisition.state).toBe('unavailable');expect(recovered.snapshot!.result.assets[0]!.acquisition.reason).toContain('Interrupted');await database.close();
  });
  it('releases terminal packaging work with no native backing and retains its failure report', async () => {
    mocks.archive.mockRejectedValue(new Error('Injected ZIP failure'));
    const accepted=await begin();await vi.waitFor(async()=>expect((await command('status',{id:accepted.id})).acquisition).toBe('complete'));
    const exportId=await consume<string>('export',accepted.id);
    await vi.waitFor(async()=>expect((await consume<ReadResponse>('read',accepted.id)).deliveries.find(d=>d.id===exportId)?.state).toBe('failed'));
    expect(await command('prepare-close')).toBe(true);
  });
  it('retains every selected file in a multi-asset capture and reopens independently', async () => {
    const accepted = await begin();
    await vi.waitFor(async () => expect((await command('status',{id:accepted.id})).acquisition).toBe('complete'));
    const read = await consume<ReadResponse>('read',accepted.id);
    expect(read.snapshot!.result.assets.map(asset=>asset.acquisition.state)).toEqual(['acquired','acquired']);
    expect(await read.snapshot!.blobs['media-2']!.text()).toBe('media-2');
    const database = new ResultDatabase(); expect((await database.read(accepted.id))!.result.retention.state).toBe('retained'); await database.close();
  });
  it('keeps acquired bytes usable after retention failure without a recovery promise', async () => {
    vi.spyOn(ResultDatabase.prototype,'commit').mockRejectedValue(new Error('Injected disk failure'));
    const accepted = await begin();
    await vi.waitFor(async () => expect((await command('status',{id:accepted.id})).acquisition).toBe('complete'));
    const read = await consume<ReadResponse>('read',accepted.id);
    expect(read.snapshot!.result.retention.state).toBe('failed'); expect(await read.snapshot!.blobs['media-1']!.text()).toBe('media-1');
    expect(await command('prepare-close')).toBe(false);
  });
  it('clear wins against late media and prevents new reads while an old snapshot stays usable', async () => {
    let release!: (blob: Blob) => void;
    mocks.acquire.mockImplementationOnce(() => new Promise<Blob>(resolve => { release = resolve; }));
    const accepted = await begin(); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const grant = await consume<ReadResponse>('read',accepted.id); expect(grant.snapshot!.result.records[0]!.payload).toBeDefined();
    await consume('clear',accepted.id); release(new Blob(['late'],{type:'image/jpeg'}));
    await vi.waitFor(async () => expect((await command('hello')).active).toHaveLength(0));
    expect((await consume<ReadResponse>('read',accepted.id)).snapshot).toBeNull(); expect(grant.snapshot!.result.records[0]!.payload).toBeDefined();
  });
  it('does not accept another document selection token', async () => {
    const inspection = await command('inspect',{url:candidate.sourceUrl,owner:'one'});
    await expect(command('capture',{token:inspection.token,selected:[],owner:'two'})).rejects.toThrow('another document');
    expect(await command('prepare-close')).toBe(false);
  });
});
