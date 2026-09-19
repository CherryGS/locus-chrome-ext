import { AUTHENTICATED_SOURCE_LIMIT, selectAuthenticatedTweetDetail } from '@/sites/twitter/authenticated-projection';
import { PROBE_CHANNEL, PROBE_TIMEOUT, probeIdentity, probeMessageSize } from './probe-protocol';

/** Observe only the selected temporary document's own X response, never replay it. */
export function observeAuthenticatedSource() {
  const identity=probeIdentity(location.href);if(!identity||window!==window.top)return;
  let stopped=false,authorized=false,pending: {data?:unknown;error?:string}|undefined;
  const requests=new Set<XMLHttpRequest>();const urls=new WeakMap<XMLHttpRequest,string>();
  const readers=new Set<ReadableStreamDefaultReader<Uint8Array>>();
  const nativeOpen=XMLHttpRequest.prototype.open,nativeFetch=window.fetch;
  function operation(input:string){try{if(input.length>32768||new TextEncoder().encode(input).length>32768)return false;const url=new URL(input,location.href);return url.origin===location.origin&&/^\/i\/api\/graphql\/[A-Za-z0-9_-]{1,128}\/TweetDetail$/.test(url.pathname)&&JSON.parse(url.searchParams.get('variables')??'{}')?.focalTweetId===identity!.url.split('/').at(-1);}catch{return false;}}
  function stop(){if(stopped)return;stopped=true;clearTimeout(timer);window.removeEventListener('message',message);window.removeEventListener('pagehide',stop);if(XMLHttpRequest.prototype.open===open)XMLHttpRequest.prototype.open=nativeOpen;if(window.fetch===fetch)window.fetch=nativeFetch;for(const xhr of requests)xhr.removeEventListener('load',loaded);requests.clear();for(const reader of readers)void reader.cancel().catch(()=>{});readers.clear();}
  function publish(){if(!authorized||!pending||stopped)return;const value={channel:PROBE_CHANNEL,token:identity!.token,op:'source',...pending};if(probeMessageSize(value)>AUTHENTICATED_SOURCE_LIMIT){pending={error:'Signed-in source exceeds the message capability limit'};publish();return;}window.postMessage(value,location.origin);stop();}
  function consume(value:unknown,requestUrl:string){if(stopped||pending)return;try{const selected=selectAuthenticatedTweetDetail(value,identity!.url,new URL(requestUrl,location.href).href);if(!selected)return;pending={data:selected};}catch(error){pending={error:error instanceof Error?error.message:'Signed-in source was unsupported'};}publish();}
  function failure(reason:string){if(stopped||pending)return;pending={error:reason};publish();}
  function loaded(this:XMLHttpRequest){
    if(stopped||!operation(urls.get(this)??'')||!operation(this.responseURL))return;
    if(this.status!==200){failure(`Signed-in TweetDetail response failed (${this.status})`);return;}
    try {
      if(this.responseType==='json')consume(this.response,urls.get(this)!);
      else if(this.responseType===''||this.responseType==='text'){const text=this.responseText;if(text.length>8*1048576)throw new Error('Signed-in response exceeds the 8 MiB observation limit');consume(JSON.parse(text),urls.get(this)!);}
      else failure('Signed-in TweetDetail response encoding is unsupported');
    }catch(error){failure(error instanceof Error?error.message:'Signed-in response could not be read');}
  }
  const open=function(this:XMLHttpRequest,method:string,url:string|URL,...rest:unknown[]){
    if(!stopped){urls.set(this,String(url));if(operation(String(url))&&!requests.has(this)){if(requests.size>=32)failure('Too many signed-in detail responses');else{requests.add(this);this.addEventListener('load',loaded);}}}
    return Reflect.apply(nativeOpen,this,[method,url,...rest]);
  } as XMLHttpRequest['open'];
  const fetch:typeof window.fetch=function(this:Window,input,init){
    const response=Reflect.apply(nativeFetch,this,[input,init]) as Promise<Response>;
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(operation(url))void response.then(async result=>{
      if(stopped||!operation(result.url))return;if(result.status!==200){failure(`Signed-in TweetDetail response failed (${result.status})`);return;}
      const reader=result.clone().body?.getReader();if(!reader){failure('Signed-in response has no body');return;}
      readers.add(reader);
      const chunks:Uint8Array[]=[];let size=0;
      try{while(!stopped){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>8*1048576)throw new Error('Signed-in response exceeds the 8 MiB observation limit');chunks.push(next.value);}if(stopped)return;const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}consume(JSON.parse(new TextDecoder().decode(bytes)),url);}
      catch(error){failure(error instanceof Error?error.message:'Signed-in response could not be read');}finally{readers.delete(reader);void reader.cancel().catch(()=>{});}
    }).catch(()=>{});
    return response;
  };
  function message(event:MessageEvent){if(event.source!==window||event.origin!==location.origin||event.data?.channel!==PROBE_CHANNEL||event.data?.token!==identity!.token)return;if(event.data.op==='authorize'){authorized=true;publish();}else if(event.data.op==='stop')stop();}
  const timer=setTimeout(()=>{failure('Signed-in source did not arrive before the observation deadline');stop();},PROBE_TIMEOUT);
  window.addEventListener('message',message);window.addEventListener('pagehide',stop);XMLHttpRequest.prototype.open=open;window.fetch=fetch;window.postMessage({channel:PROBE_CHANNEL,token:identity.token,op:'observer-ready'},location.origin);
}
