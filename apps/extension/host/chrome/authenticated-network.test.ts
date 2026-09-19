import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTwitter } from './network';
const source='https://x.com/synthetic/status/601';
const script=(records:unknown)=>`<script>window.page={dehydratedData:{relayRecords:${JSON.stringify(records)}}};</script>`;
const unavailable={root:{__id:'root',__typename:'TweetResults',rest_id:'601',result:{__ref:'target'}},target:{__id:'target',__typename:'TweetTombstone'}};
beforeEach(()=>{vi.stubGlobal('DOMParser',class{parseFromString(html:string){return {scripts:[...html.matchAll(/<script>(.*?)<\/script>/gs)].map(match=>({textContent:match[1]}))};}});});
afterEach(()=>vi.unstubAllGlobals());
function response(html:string,status=200){vi.stubGlobal('fetch',vi.fn(async()=>new Response(html,{status,headers:{'content-type':'text/html'}})));}
describe('bounded public-first source fallback',()=>{
  it('uses authenticated source only for explicit bound tombstone or missing public format',async()=>{
    const fallback=vi.fn().mockResolvedValue({sourceId:'601'});response(script(unavailable));expect(await loadTwitter(source,new AbortController().signal,fallback)).toEqual({sourceId:'601'});expect(fallback).toHaveBeenCalledOnce();
    response('<html>Login shell without the verified initial source</html>');await loadTwitter(source,new AbortController().signal,fallback);expect(fallback).toHaveBeenCalledTimes(2);
  });
  it('does not turn unsafe identity, ambiguous format or HTTP failure into authenticated capability',async()=>{
    const fallback=vi.fn();response(script({...unavailable,target:{__id:'target',__typename:'Tweet',rest_id:'999'}}));await expect(loadTwitter(source,new AbortController().signal,fallback)).rejects.toThrow('identity');
    response(script(unavailable)+script(unavailable));await expect(loadTwitter(source,new AbortController().signal,fallback)).rejects.toThrow('format');response('Unavailable',503);await expect(loadTwitter(source,new AbortController().signal,fallback)).rejects.toThrow('503');expect(fallback).not.toHaveBeenCalled();
  });
  it('preserves authenticated error as a failed inspection',async()=>{response(script(unavailable));await expect(loadTwitter(source,new AbortController().signal,async()=>{throw new Error('Current signed-in session unavailable');})).rejects.toThrow('signed-in session');});
  it('honors the end-to-end inspection abort while authenticated setup is stalled',async()=>{
    response(script(unavailable));const controller=new AbortController();const fallback=vi.fn(()=>new Promise<never>(()=>{}));const result=loadTwitter(source,controller.signal,fallback);await vi.waitFor(()=>expect(fallback).toHaveBeenCalledOnce());controller.abort(new Error('Inspection deadline elapsed'));await expect(result).rejects.toThrow('deadline');
  });
});
