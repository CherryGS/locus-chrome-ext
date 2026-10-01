/** Real extension -> real Locus server, using only a disposable library/profile. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createBilibiliLocusSmoke } from './locus-bilibili-smoke.mjs';

const member=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const binary=process.env.LOCUS_SERVER_PATH,chromePath=process.env.LOCUS_CHROME_PATH;
assert(binary&&chromePath,'Set LOCUS_SERVER_PATH and LOCUS_CHROME_PATH to the built server and isolated Chrome for Testing');
const work=await mkdtemp(path.join(tmpdir(),'locus-extension-integration-'));
const serverPath=path.join(work,process.platform==='win32'?'server.exe':'server');await cp(binary,serverPath);
const extension=path.join(work,'extension');await cp(path.join(member,'.output/chrome-mv3'),extension,{recursive:true});
const manifestPath=path.join(extension,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
// Grant fixture origins only in the disposable build; production uses a gesture.
manifest.host_permissions=manifest.optional_host_permissions;
await writeFile(manifestPath,JSON.stringify(manifest));
const image=await readFile(path.join(member,'testing/fixtures/black-frame.png'));
const bilibili=await createBilibiliLocusSmoke({work,image});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,predicate,label){const deadline=Date.now()+30_000;let value;do{value=await read();if(predicate(value))return value;await pause(100);}while(Date.now()<deadline);throw new Error(`${label}: ${JSON.stringify(value)}`);}
async function start(){
  const credential=randomBytes(32).toString('hex'),process=spawn(serverPath,[],{stdio:'pipe',windowsHide:true});process.stderr.resume();
  const exited=once(process,'exit'),lines=createInterface({input:process.stdout});
  const next=once(lines,'line',{signal:AbortSignal.timeout(30_000)});process.stdin.end(JSON.stringify({credential,library_root:path.join(work,'library')}));
  const [line]=await next;lines.close();const ready=JSON.parse(String(line));
  async function request(route,body){const response=await fetch(ready.origin+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${credential}`,'X-Locus-Run':ready.run_id,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert(response.ok,`Local fixture route ${route}: ${response.status}`);return response.json();}
  return {process,exited,request,async stop(){await request('/api/v1/drain',{});await exited;}};
}
function fixture(id,failed=false){
  const records={};const put=(key,type,fields)=>(records[key]={__id:key,__typename:type,...fields},{__ref:key});
  const core=put('core','TweetCore',{user_results:put('users','UserResults',{result:put('author','User',{rest_id:'123',core:put('author-core','UserCore',{screen_name:'synthetic',name:'Synthetic'})})})});
  const details=put('details','TBirdData',{full_text:`Synthetic complete post ${id}`,created_at_ms:1711047760000,hashtag_entities:{__refs:[]}});
  put('image','ApiMediaEntity',{id_str:'1001',type:'photo',source_status_id_str:null,media_url_https:`https://pbs.twimg.com/media/${failed?'failure':'synthetic'}.png`});
  put('root','TweetResults',{rest_id:id,result:put('tweet','Tweet',{rest_id:id,core,details,legacy:put('legacy','LegacyTweet',{retweeted_status_results:null}),article:null,note_tweet:null,media_entities2:{__refs:['image']},reply_to_results:null,quoted_tweet_results:null,mention_entities:{__refs:[]},url_entities:{__refs:[]}})});
  const button=name=>`<button aria-label="${name}" style="background:none;border:0;color:inherit"><span><svg data-icon="icon-${name.toLowerCase()}-stroke" width="20" height="20" viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4z"/></svg></span></button>`;
  return `<!doctype html><html><body style="background:#111;color:white;font:16px Arial"><article style="margin:40px;padding:20px"><a href="/synthetic/status/${id}"><time>Today</time></a><p>Synthetic post ${id}</p><div style="display:flex;gap:30px"><div><a aria-label="Reply" href="/synthetic/status/${id}"><span><svg width="20" height="20" data-icon="icon-reply-stroke" viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4z"/></svg></span></a></div><div>${button('Repost')}</div><div>${button('Like')}</div><div>${button('Bookmark')}${button('Share')}</div></div></article><script>window.fixture={dehydratedData:{relayRecords:${JSON.stringify(records)}}};</script></body></html>`;
}
let application=await start(),context;
try{
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const group='8bf9fb31-5633-44ca-956d-ef2b373c61af';const settings=await application.request(`/api/v1/settings/groups/${group}`);
  await application.request(`/api/v1/settings/groups/${group}`,{request_id:randomUUID(),change:{operation:'update',expected_revision:settings.saved.metadata.revision,value:{address:`127.0.0.1:${port}`}}});
  await application.stop();application=await start();const credential=await application.request('/api/v1/external-access/token');
  context=await chromium.launchPersistentContext(path.join(work,'profile'),{executablePath:chromePath,headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(String(error))));
  await context.route('https://x.com/**',route=>{const id=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({status:200,contentType:'text/html',body:fixture(id,id==='124')});});
  await context.route('https://pbs.twimg.com/**',route=>route.request().url().includes('failure')?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({status:200,contentType:'image/png',body:image}));
  await bilibili.route(context);
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),extensionId=new URL(worker.url()).host;
  const results=await context.newPage();await results.goto(`chrome-extension://${extensionId}/results.html`);
  await results.getByRole('button',{name:'Settings',exact:true}).click();
  await results.getByLabel('Locus address',{exact:true}).fill(`http://127.0.0.1:${port}`);await results.getByLabel('Token',{exact:true}).fill(credential.token);
  await results.getByRole('button',{name:'Connect and save'}).click();await results.getByText('Locus connection verified',{exact:true}).waitFor();
  // Offscreen documents are not Playwright pages; route their site fixtures via
  // their own CDP target. Loopback traffic continues to the real Locus server.
  const cdp=await context.browser().newBrowserCDPSession();
  const target=await until(async()=>(await cdp.send('Target.getTargets')).targetInfos.find(value=>value.url.endsWith('/offscreen.html')),Boolean,'offscreen owner');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
  const pending=new Map(),locusRequests=[];let sequence=0;
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});void cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  cdp.on('Target.receivedMessageFromTarget',event=>{
    if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);
    if(message.id){const receiver=pending.get(message.id);pending.delete(message.id);if(message.error)receiver?.reject(new Error(message.error.message));else receiver?.resolve(message.result);}
    if(message.method==='Network.requestWillBeSent'){const {url,method,postData}=message.params.request;const parsed=new URL(url);if(parsed.hostname==='127.0.0.1'&&parsed.pathname.startsWith('/external/v1/'))locusRequests.push({path:parsed.pathname,method,...(parsed.pathname.endsWith('/import-batches')&&postData?{body:JSON.parse(postData)}:{})});}
    if(message.method==='Fetch.requestPaused')void(async()=>{const request=message.params,url=new URL(request.request.url),id=url.pathname.split('/').at(-1);const response=await bilibili.response(url);if(response){await send('Fetch.fulfillRequest',{requestId:request.requestId,...response});return;}const source=url.hostname==='x.com';const body=source?Buffer.from(fixture(id,id==='124')):image;
      await send('Fetch.fulfillRequest',{requestId:request.requestId,responseCode:url.pathname.includes('failure')?503:200,responseHeaders:[{name:'Content-Type',value:source?'text/html':'image/png'},{name:'Content-Length',value:String(body.length)}],body:body.toString('base64')});
    })().catch(error=>errors.push(String(error)));
  });
  await send('Network.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'https://x.com/*'},{urlPattern:'https://pbs.twimg.com/*'},...bilibili.patterns]});
  const rows=()=>results.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('locus-results-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('locus-transfers').objectStore('locus-transfers').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}});
  const page=await context.newPage();await page.goto('https://x.com/synthetic/status/123');await page.locator('[data-locus-action] button').click();
  const saved=await until(rows,values=>values.some(value=>value.state==='complete'),'automatic Locus import').catch(async error=>{await page.getByRole('button',{name:'Expand capture queue',exact:true}).click();throw new Error(`${error.message}\n${await page.locator('[data-locus-capture]').evaluate(host=>host.shadowRoot.querySelector('.dark').innerText)}`);});
  assert.equal(saved[0].entityIds.length,1);assert.equal(saved[0].uploads.length,1);
  await until(()=>page.locator('[data-locus-action] button').getAttribute('aria-label'),value=>value?.includes('Saved to Locus'),'page confirmation');
  const batches=await application.request('/api/v1/import-batches');assert.equal(batches.batches.length,1);assert.equal(batches.batches[0].items[0].current.overall,'success');
  assert.equal(batches.batches[0].items[0].current.twitter.state,'success');assert.equal(batches.batches[0].items[0].current.association.state,'success');
  await results.goto(`chrome-extension://${extensionId}/results.html#${saved[0].resultId}`);await results.getByText('Locus confirmed this save', {exact:false}).waitFor();await results.getByRole('button',{name:'Saved',exact:true}).waitFor();
  await results.screenshot({path:path.join(work,'saved-to-locus.png'),fullPage:true});
  await page.goto('https://x.com/synthetic/status/124');await page.locator('[data-locus-action] button').click();
  await until(rows,values=>values.length===2&&values.some(value=>value.state==='failed'),'partial capture blocks delivery');
  assert.equal((await application.request('/api/v1/import-batches')).batches.length,1);
  const failed=(await rows()).find(value=>value.state==='failed');assert.equal(failed.uploads.length,0);
  await results.goto(`chrome-extension://${extensionId}/results.html#${failed.resultId}`);await results.getByRole('button',{name:'Inbox',exact:true}).waitFor();await results.getByRole('button',{name:'Export available content',exact:true}).waitFor();await results.getByRole('tab',{name:/^Activity/}).click();assert.equal(await results.getByRole('button',{name:'Check and continue save',exact:true}).count(),0);await results.getByRole('tab',{name:'Preview',exact:true}).click();await results.screenshot({path:path.join(work,'failed-save-inbox.png'),fullPage:true});
  const bilibiliChecks=await bilibili.verify({context,results,rows,application,extensionId,until,locusRequests});
  // A complete capture must remain usable when the actual receiver is offline.
  // This exercises the requested fallback, independently of acquisition failure.
  await application.stop();
  const priorIds=new Set((await rows()).map(value=>value.resultId));
  await page.goto('https://x.com/synthetic/status/125');await page.locator('[data-locus-action] button').click();
  const offlineRows=await until(rows,values=>values.some(value=>!priorIds.has(value.resultId)&&value.state==='failed'),'offline receiver retains complete capture');
  const offline=offlineRows.find(value=>!priorIds.has(value.resultId));assert.equal(offline.uploads.length,0);
  await results.goto(`chrome-extension://${extensionId}/results.html`);
  await results.getByRole('button',{name:'Open capture @synthetic · 125',exact:true}).click();
  await results.getByRole('button',{name:'Export ZIP',exact:true}).waitFor();
  await results.getByRole('tab',{name:/^Activity/}).click();
  await results.getByRole('button',{name:'Check and continue save',exact:true}).waitFor();
  assert.equal(await results.locator('[data-capture-diagnostic] pre').isVisible(),false);
  await results.getByRole('tab',{name:'Preview',exact:true}).click();
  await results.getByText('Synthetic complete post 125',{exact:true}).waitFor();
  await results.locator('img').evaluate(image=>image.decode());
  assert.equal(await results.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
  await results.screenshot({path:path.join(work,'offline-save-inbox.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:['Connection UI and credential check','One-click complete Twitter capture -> real upload -> real File/Twitter import','Page shows confirmed Locus result','Incomplete capture sends no upload or import',...bilibiliChecks,'Offline real receiver: complete capture reopens in default Inbox with retained preview, export and original-save continuation'],artifacts:work}));
}finally{await context?.close();if(application.process.exitCode===null){await application.stop().catch(async()=>{application.process.kill();await application.exited;});}}
