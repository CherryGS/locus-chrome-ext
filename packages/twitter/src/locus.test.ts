import { describe, expect, it } from 'vitest';
import { twitterImportItems } from './locus';
import { selectTwitter, type TwitterCandidate } from './source';
import type { Snapshot } from '@locus/capture-core/model';

function fixture(): Snapshot {
  const candidate: TwitterCandidate = { sourceId:'123',sourceUrl:'https://x.com/example/status/123',label:'Example',text:'完整正文',textFailure:null,
    payload:{sourceId:'123',sourceUrl:'https://x.com/example/status/123',requestedUrl:'https://x.com/reposter/status/456',fullText:'完整正文',author:{accountId:'789',username:'example',displayName:'Example'},publishedAt:'2026-09-23T00:00:00Z',observedAt:'2026-09-23T01:00:00Z',entities:{hashtags:[{text:'media'}]},relationships:{quote:{postId:'321'},repost:{presentationPostId:'456',targetPostId:'123'}}},
    media:[1,2].map(i=>({id:`media-${i}`,sourceId:String(i),kind:'photo',url:`https://pbs.twimg.com/media/${i}.jpg`,previewUrl:null,reason:null,bitrate:null,sourceDimensions:{width:100,height:50},representationDimensions:null,sourceOrder:null,quality:'Observed',altText:null})) };
  const result=selectTwitter(candidate,['media-1','media-2'],'fixture'),blobs:Record<string,Blob>={};
  for(const asset of result.assets){const blob=new Blob(['image']);blobs[asset.id]=blob;asset.size=blob.size;asset.acquisition={state:'acquired'};}
  return {result,blobs,readErrors:{}};
}
describe('Twitter Locus mapping',()=>{
  it('maps each selected file with its subject and preserves navigation separately',()=>{
    const items=twitterImportItems(fixture());expect(items).toHaveLength(2);
    expect(items[0]!.twitter).toMatchObject({post_id:'123',text:'完整正文',requested_url:'https://x.com/reposter/status/456',published_at_unix_ms:'1790121600000',references:[{kind:'quote',post_id:'321'}],hashtags:['media'],occurrence:{media_id:'1',capture_local_id:'media-1',claims:{width:100,height:50}}});
    expect(items[0]!.twitter.occurrence).not.toHaveProperty('source_order');
    expect(items[0]!.twitter.representation!.claims).not.toHaveProperty('width');
  });
  it('rejects an incomplete selection or unreadable bytes before delivery',()=>{
    const snapshot=fixture();snapshot.result.assets[1]!.acquisition={state:'unavailable'};expect(()=>twitterImportItems(snapshot)).toThrow(/entire selected/);
    const unreadable=fixture();delete unreadable.blobs['media-2'];expect(()=>twitterImportItems(unreadable)).toThrow(/unavailable/);
  });
  it('preserves explicitly selected text-only scope, including empty text',()=>{
    const snapshot=fixture();snapshot.result.assets=[];snapshot.result.records[0]!.assetIds=[];(snapshot.result.records[0]!.payload as Record<string,unknown>).fullText='';
    expect(twitterImportItems(snapshot)).toEqual([expect.objectContaining({twitter:expect.objectContaining({text:''})})]);
  });
  it('checks UTF-8 bytes without silently truncating content',()=>{
    const snapshot=fixture();(snapshot.result.records[0]!.payload as Record<string,unknown>).fullText='中'.repeat(22_000);
    expect(()=>twitterImportItems(snapshot)).toThrow(/byte limit/);
  });
  it('rejects out-of-range identifiers and unsupported handles',()=>{
    const snapshot=fixture(),payload=snapshot.result.records[0]!.payload as Record<string,unknown>;payload.sourceId='18446744073709551616';expect(()=>twitterImportItems(snapshot)).toThrow(/identifier/);
    payload.sourceId='123';payload.author={username:'abcdefghijklmnop'};expect(()=>twitterImportItems(snapshot)).toThrow(/Author handle/);
  });
});
