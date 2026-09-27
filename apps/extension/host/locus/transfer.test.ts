import { describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '@locus/capture-core/model';
import { newTransfer, transferToLocus } from './transfer';
import type { LocusTransfer } from './model';

function fixture():Snapshot {
  const blob=new Blob(['file']);return {result:{id:'capture',site:'twitter',label:'Post',sourceUrl:'https://x.com/example/status/123',createdAt:'2026-09-23T00:00:00Z',revision:2,retention:{state:'retained',revision:2},records:[{id:'post',assetIds:['media-1'],acquisition:{state:'acquired'},payload:{sourceId:'123',sourceUrl:'https://x.com/example/status/123',fullText:'Post'}}],assets:[{id:'media-1',recordId:'post',acquisition:{state:'acquired'},size:blob.size,description:{kind:'photo',url:'https://pbs.twimg.com/media/example.jpg'}}]},blobs:{'media-1':blob},readErrors:{}};
}
const connection={origin:'http://127.0.0.1:46321',token:'secret-token'};
function backend({lost=false,importFailure=false}:{lost?:boolean;importFailure?:boolean}={}) {
  const requests=new Map<string,{kind:string;task:string}>(),mutations:string[]=[];
  let importId='';let run='run-one';let disconnected=false;
  const transport=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input)),path=url.pathname.split('/external/v1/')[1]!;
    if(path==='bootstrap')return Response.json({run_id:run});
    if(disconnected)throw new Error('Offline');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token');expect(new Headers(init?.headers).get('X-Locus-Run')).toBe(run);
    if(path==='tasks')return Response.json({tasks:[]});
    if(init?.method==='POST'){
      const kind=path==='uploads'?'upload':'import_batch';
      const body=path==='uploads'?undefined:JSON.parse(String(init.body));
      const id=path==='uploads'?url.searchParams.get('request_id')!:body.request_id;
      if(body){expect(body.items[0].file_id).toBe('file-1');importId=id;}
      else expect(await (init.body as Blob).text()).toBe('file');
      mutations.push(kind);requests.set(id,{kind,task:id});
      if(lost&&kind==='upload'){disconnected=true;throw new Error('Lost response');}
      return Response.json({status:'accepted',receipt:{run_id:run,request_id:id,task_id:id}});
    }
    if(path.startsWith('requests/')){const id=path.slice(9);return requests.has(id)?Response.json({status:'accepted',receipt:{run_id:run,request_id:id,task_id:id}}):Response.json({code:'unknown_request',message:'Unknown request'},{status:404});}
    if(path.startsWith('tasks/')){const request=requests.get(path.split('/')[1]!)!;return Response.json({status:'complete',outcome:request.kind==='upload'?{status:'upload',result:{confirmed_file_id:'file-1',uncertain:false}}:{status:'import_batch',batch_id:'batch-1'}});}
    if(path==='import-batches')return Response.json({run_id:run,batches:[{batch_id:'batch-1',original_request_id:importId,original_ended:true,items:[{item_id:'item-1',actions:[],current:{overall:importFailure?'failure':'success',complete:!importFailure,confirmed_entity_id:'entity-1',twitter:{state:importFailure?'failed':'success',reason:importFailure?'Source rejected':null}}}]}]});
    throw new Error(`Unexpected path ${path}`);
  }) as unknown as typeof fetch;
  return {transport,mutations,reconnect(){disconnected=false;},restart(){run='run-two';disconnected=false;}};
}
describe('Locus two-stage delivery',()=>{
  it('persists intent before uploads/imports and marks success only after whole-item completion',async()=>{
    const api=backend(),snapshot=fixture(),transfer=newTransfer(snapshot.result.id,2),saved:LocusTransfer[]=[];
    await transferToLocus(snapshot,transfer,connection,async value=>{saved.push(value);},{transport:api.transport});
    expect(api.mutations).toEqual(['upload','import_batch']);expect(transfer.state).toBe('complete');expect(transfer.entityIds).toEqual(['entity-1']);
    expect(saved.some(value=>value.uploads[0]?.request.dispatched&&!value.uploads[0].fileId)).toBe(true);
    expect(saved.some(value=>value.importRequest?.dispatched&&value.state==='importing')).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(connection.token);
  });
  it('sends nothing for incomplete capture, missing blobs or missing configuration',async()=>{
    for(const kind of ['partial','bytes','connection']){
      const api=backend(),snapshot=fixture(),transfer=newTransfer('capture',2);
      if(kind==='partial')snapshot.result.assets[0]!.acquisition={state:'unavailable'};
      if(kind==='bytes')snapshot.blobs={};
      await transferToLocus(snapshot,transfer,kind==='connection'?undefined:connection,async()=>{},{transport:api.transport});
      expect(api.transport).not.toHaveBeenCalled();expect(transfer.state).toBe(kind === 'connection' ? 'configuration-required' : 'failed');
    }
  });
  it('validates completeness before configuration and continues only when explicitly invoked', async () => {
    const api = backend(), snapshot = fixture(), transfer = newTransfer('capture', 2);
    await transferToLocus(snapshot, transfer, undefined, async () => {}, { transport: api.transport });
    expect(transfer.state).toBe('configuration-required'); expect(api.transport).not.toHaveBeenCalled();
    await transferToLocus(snapshot, transfer, connection, async () => {}, { transport: api.transport });
    expect(transfer.state).toBe('complete'); expect(api.mutations).toEqual(['upload', 'import_batch']);
    const incomplete = fixture(); incomplete.blobs = {};
    const blocked = newTransfer('capture', 2);
    await transferToLocus(incomplete, blocked, undefined, async () => {}, { transport: api.transport });
    expect(blocked.state).toBe('failed'); expect(blocked.message).not.toContain('Configure');
  });
  it('preserves real failures and uncertainty when configuration later disappears', async () => {
    for (const state of ['failed', 'unverified'] as const) {
      const api = backend(), transfer = { ...newTransfer('capture', 2), state, message: 'Network unreachable' };
      await transferToLocus(fixture(), transfer, undefined, async () => {}, { transport: api.transport });
      expect(transfer.state).toBe(state); expect(api.transport).not.toHaveBeenCalled();
    }
  });
  it('does not downgrade dispatched uncertainty when settings are absent', async () => {
    const api = backend(), transfer = newTransfer('capture', 2);
    transfer.importRequest = { id: 'original', dispatched: true };
    await transferToLocus(fixture(), transfer, undefined, async () => {}, { transport: api.transport });
    expect(transfer.state).toBe('unverified'); expect(transfer.importRequest.id).toBe('original');
    expect(api.transport).not.toHaveBeenCalled();
  });
  it('observes a lost upload response after owner recreation without resending bytes',async()=>{
    const api=backend({lost:true}),snapshot=fixture(),transfer=newTransfer('capture',2);
    await transferToLocus(snapshot,transfer,connection,async()=>{},{transport:api.transport});expect(transfer.state).toBe('unverified');
    const reopened=structuredClone(transfer);api.reconnect();await transferToLocus(snapshot,reopened,connection,async()=>{},{transport:api.transport});
    expect(reopened.state).toBe('complete');expect(api.mutations).toEqual(['upload','import_batch']);
  });
  it('does not replay a previous run or silently move a save to another address',async()=>{
    const api=backend({lost:true}),snapshot=fixture(),transfer=newTransfer('capture',2);
    await transferToLocus(snapshot,transfer,connection,async()=>{},{transport:api.transport});api.restart();
    await transferToLocus(snapshot,transfer,connection,async()=>{},{transport:api.transport});expect(transfer.message).toContain('restarted');expect(api.mutations).toEqual(['upload']);
    await transferToLocus(snapshot,transfer,{...connection,origin:'http://127.0.0.1:5000'},async()=>{},{transport:api.transport});expect(transfer.message).toContain('another Locus address');expect(api.mutations).toEqual(['upload']);
  });
  it('never reports a retained entity or successful upload as whole import success',async()=>{
    const api=backend({importFailure:true}),transfer=newTransfer('capture',2);
    await transferToLocus(fixture(),transfer,connection,async()=>{},{transport:api.transport});
    expect(transfer.state).not.toBe('complete');expect(transfer.message).toContain('Source rejected');expect(transfer.entityIds).toEqual(['entity-1']);
    await transferToLocus(fixture(),transfer,connection,async()=>{},{transport:api.transport});expect(api.mutations).toEqual(['upload','import_batch']);
  });
  it('refuses to dispatch when the write-ahead record cannot be committed',async()=>{
    const api=backend(),transfer=newTransfer('capture',2);
    await expect(transferToLocus(fixture(),transfer,connection,async()=>{throw new Error('Disk full');},{transport:api.transport})).rejects.toThrow('Disk full');expect(api.mutations).toEqual([]);
  });
});
