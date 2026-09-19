import { AUTHENTICATED_SOURCE_LIMIT } from '@locus/twitter/authenticated-projection';
import { coordinator } from './protocol';
import { PROBE_CHANNEL, PROBE_TIMEOUT, probeIdentity, probeMessageSize } from './probe-protocol';

export function bridgeAuthenticatedSource(options={identity:probeIdentity,channel:PROBE_CHANNEL,ready:'probe-ready',data:'probe-data',limit:AUTHENTICATED_SOURCE_LIMIT}) {
  const identity=options.identity(location.href);if(!identity||window!==window.top)return;
  let stopped=false,authorized=false,sent=false;
  const post=(op:string)=>window.postMessage({channel:options.channel,token:identity.token,op},location.origin);
  function stop(){if(stopped)return;stopped=true;clearTimeout(timer);window.removeEventListener('message',message);window.removeEventListener('pagehide',stop);post('stop');}
  async function report(value:{data?:unknown;error?:string}){if(stopped||sent||!authorized)return;sent=true;try{await coordinator(options.data,{token:identity!.token,url:identity!.url,...value});}finally{stop();}}
  function message(event:MessageEvent){
    if(stopped||!authorized||event.source!==window||event.origin!==location.origin||event.data?.channel!==options.channel||event.data?.token!==identity!.token)return;
    if(event.data.op==='observer-ready'){post('authorize');return;}if(event.data.op!=='source')return;
    if(probeMessageSize(event.data)>options.limit){void report({error:'Signed-in source exceeds message limit'}).catch(()=>{});return;}
    if(typeof event.data.error==='string')void report({error:event.data.error.slice(0,1000)}).catch(()=>{});
    else if(event.data.data!==undefined)void report({data:event.data.data}).catch(()=>{});
  }
  const timer=setTimeout(()=>{if(authorized&&!sent)void report({error:'Signed-in source was unavailable before timeout'}).catch(()=>{}).finally(stop);else stop();},PROBE_TIMEOUT);
  window.addEventListener('message',message);window.addEventListener('pagehide',stop);
  void coordinator(options.ready,{token:identity.token,url:identity.url}).then(()=>{if(!stopped){authorized=true;post('authorize');}}).catch(stop);
}
