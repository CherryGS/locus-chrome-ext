/** Disposable real-Chrome regression. No test hooks enter production bundles. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import { verifyInboxUi } from './inbox-ui-smoke.mjs';
import { verifyLibraryUi } from './library-ui-smoke.mjs';
import { verifyPageStatus } from './page-status-smoke.mjs';
import { verifyBrowserQueue } from './queue-smoke.mjs';
import { verifyQuickCapture } from './quick-capture-smoke.mjs';
import { verifyFocalActions } from './focal-action-smoke.mjs';
import { verifyShareActions } from './share-action-smoke.mjs';
import { installProgressFixture, verifyProgressRing } from './progress-ring-smoke.mjs';
import { verifyProgressRingGeometry } from './progress-ring-geometry.mjs';
import { authenticatedFixtureIds, authenticatedPage, authenticatedResponse, verifyAuthenticatedProbe } from './authenticated-probe-smoke.mjs';

const member = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = process.env.LOCUS_CHROME_PATH;
if (!executablePath) throw new Error('Set LOCUS_CHROME_PATH to an isolated Chrome for Testing or Chromium executable');
const work = await mkdtemp(path.join(tmpdir(), 'locus-browser-smoke-'));
const extension = path.join(work, 'extension');
const downloads = path.join(work, 'downloads');
await cp(path.join(member, '.output/chrome-mv3'), extension, {recursive:true});
await mkdir(downloads);
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.action.default_popup, undefined);
const image = await readFile(path.join(member,'testing/fixtures/black-frame.png'));
const video = await readFile(path.join(member,'testing/fixtures/black-frame.mp4'));
const checks = [];
let liveProbe;
let context;
let extensionId;
let downloadBehavior;
let captureGate;
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(read, predicate, label, timeout=20_000) {
  const deadline=Date.now()+timeout; let value;
  do { value=await read(); if (predicate(value)) return value; await pause(100); } while(Date.now()<deadline);
  throw new Error(`Timed out: ${label}; last value: ${JSON.stringify(value)}`);
}
async function launch(profile) {
  context=await chromium.launchPersistentContext(path.join(work,profile), { executablePath, headless:process.env.LOCUS_HEADED !== '1', acceptDownloads:true, downloadsPath:downloads, args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
  context.on('page',page=>page.on('pageerror',error=>console.error('Page runtime error:',String(error))));
  const worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'); extensionId=new URL(worker.url()).host;
  const browser=context.browser(); downloadBehavior=await browser.newBrowserCDPSession();
  await downloadBehavior.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
  return worker;
}
function publicFixture(id, failed=false) {
  const records={};
  const put=(key,type,fields)=>{records[key]={__id:key,__typename:type,...fields};return {__ref:key};};
  const core=put('core','TweetCore',{user_results:put('users','UserResults',{result:put('author','User',{rest_id:'123',core:put('author-core','UserCore',{screen_name:'synthetic',name:'Synthetic fixture'})})})});
  const details=put('details','TBirdData',{full_text:id==='104'?('A long synthetic message for the floating capture window. Each paragraph stays inside the scrolling body while the close and capture controls remain reachable.\n\n').repeat(10):`Synthetic post ${id}\nFull message`,created_at_ms:1711047760000,display_text_range:[0,10],hashtag_entities:{__refs:[]}});
  const media=[];
  if(id!=='100') {
    put('image','ApiMediaEntity',{id_str:'1001',type:'photo',source_status_id_str:null,media_url_https:`https://pbs.twimg.com/media/${failed?'synthetic-failure':Number(id)>=200?'synthetic-image-'+id:'synthetic-image'}.png`}); media.push('image');
    put('video','ApiMediaEntity',{id_str:'1002',type:'video',source_status_id_str:null,video_info:put('info','ApiMediaEntityVideoInfo',{variants:{__refs:['variant']}})});
    put('variant','ApiMediaEntityVideoVariant',{content_type:'video/mp4',bitrate:100,url:'https://video.twimg.com/amplify_video/1002/vid/synthetic.mp4'}); media.push('video');
  }
  if(id==='104')for(let n=3;n<=12;n++){put(`photo${n}`,'ApiMediaEntity',{id_str:String(1000+n),type:'photo',source_status_id_str:null,media_url_https:`https://pbs.twimg.com/media/synthetic-${n}.png`});media.push(`photo${n}`);}
  put('root','TweetResults',{rest_id:id,result:put('tweet','Tweet',{rest_id:id,core,details,legacy:put('legacy','LegacyTweet',{retweeted_status_results:null}),article:null,note_tweet:null,media_entities2:{__refs:media},reply_to_results:null,quoted_tweet_results:null,mention_entities:{__refs:[]},url_entities:{__refs:[]}})});
  if(authenticatedFixtureIds.has(id))records.root.result=put('withheld','TweetTombstone',{tombstone:put('notice','BlurredMediaTombstone',{text:put('notice-text','TimelineRichText',{text:'Log in to X to view this synthetic post.'})})});
  const compact=id!=='100';
  const glyphs={Repost:'m4 7 3-3 3 3M7 4v13h12m1 0-3 3-3-3M17 20V7H5',Like:'M20.5 4.5a5 5 0 0 0-7 0L12 6l-1.5-1.5a5 5 0 0 0-7 7L12 20l8.5-8.5a5 5 0 0 0 0-7Z','View count':'M4 20V12m5 8V4m6 16V9m5 11V2',Bookmark:'M6 3h12v18l-6-4-6 4Z',Share:'M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8'};
  const action=(name,icon,count='')=>`<button type="button" aria-label="${name}" data-fixture-native="${name}" class="fixture-action inline-flex items-center"><span class="fixture-icon ${compact?'compact':'focal'}"><svg data-icon="${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="${glyphs[name]}"/></svg>${count?`<span data-animated-count="true">${count}</span>`:''}</span></button>`;
  return `<!doctype html><html><head><meta charset="UTF-8"><title>Synthetic Twitter fixture</title><style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}article{max-width:620px;margin:36px auto;padding:20px;border:1px solid #2f3336}.fixture-message{margin-bottom:28px;line-height:1.5}.flex{display:flex}.flex-col{flex-direction:column}.gap-1{gap:4px}.flex-1{flex:1;min-width:0}.fixture-row{height:20px;min-height:20px;align-items:center;justify-content:space-between;overflow:visible;margin:0 -8px;width:calc(100% + 16px)}.fixture-trailing{display:flex;flex-shrink:0;align-items:center}.fixture-action{border:0;padding:0;background:none;color:rgba(255,255,255,.6);text-decoration:none;cursor:pointer;align-items:center;border-radius:9999px}.fixture-action:hover{color:#1d9bf0}.fixture-action:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}.fixture-icon{display:inline-flex;gap:5px;align-items:center;border-radius:9999px}.fixture-icon.focal{height:40px;padding:0 12px}.fixture-icon.compact{height:36px;padding:0 10px}.fixture-icon.focal>svg{width:20px;height:20px}.fixture-icon.compact>svg{width:18px;height:18px}.fixture-action:hover .fixture-icon{background:rgba(29,155,240,.1)}
    </style></head><body><div role="link" tabindex="0" data-href="/synthetic/status/${id}"><article class="flex flex-col gap-1"><p>Synthetic author · @synthetic</p><p class="fixture-message">Synthetic post ${id}<br>Full message, with its own selected attachments.</p><div class="fixture-row flex ${compact?'timeline':'focal'}"><div class="flex-1"><a aria-label="Reply" data-fixture-native="Reply" href="/synthetic/status/${id}" class="fixture-action inline-flex items-center"><span class="fixture-icon ${compact?'compact':'focal'}"><svg data-icon="icon-reply-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5h16v12H9l-5 4z"/></svg><span data-animated-count="true">2</span></span></a></div><div class="flex-1">${action('Repost','icon-repost-stroke','3')}</div><div class="flex-1">${action('Like','icon-heart-stroke','4')}</div>${compact?`<div class="flex-1">${action('View count','icon-chart-stroke','5')}</div>`:''}<div class="fixture-trailing">${action('Bookmark','icon-bookmark-stroke')}${action('Share','icon-share-stroke')}</div></div></article></div><script>
    window.fixture={dehydratedData:{relayRecords:${JSON.stringify(records)}}};window.fixtureNavigations=0;window.fixtureNativeClicks=0;
    window.installFixtureArticle=article=>{const boundary=article.closest('[role=link]');if(!boundary.dataset.fixtureNavBound){boundary.dataset.fixtureNavBound='true';boundary.addEventListener('click',()=>{window.fixtureNavigations++;location.hash='unexpected-article-navigation'});boundary.addEventListener('keydown',event=>{if(event.key==='Enter'){window.fixtureNavigations++;location.hash='unexpected-keyboard-navigation'}});}for(const action of article.querySelectorAll('[data-fixture-native]'))action.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();window.fixtureNativeClicks++});};
    window.installFixtureArticle(document.querySelector('article'));window.fixtureArticleHeight=document.querySelector('article').getBoundingClientRect().height;
    </script><script>window.stream={relayRecords:{unrelated:{__id:'unrelated',__typename:'Stream'}}};</script></body></html>`;
}
function loggedInFixture(id) {
  // Synthetic RNW structure; localized labels deliberately cannot serve as
  // English action selectors. Quoted timestamps must not identify the own post.
  const icon='<svg viewBox="0 0 24 24" aria-hidden="true" class="r-svg"><path d="M4 4h16v13H9l-5 4z"/></svg>';
  const button=(testId,label)=>`<button type="button" data-testid="${testId}" data-fixture-native="${testId}" aria-label="${label}" class="css-action r-button"><div dir="ltr" class="css-text r-presentation" style="color:rgb(113,118,123)"><div class="css-box r-icon-wrap"><div class="css-box r-overlay"></div>${icon}</div><div class="r-count">2</div></div></button>`;
  const article=`<article role="article" tabindex="0" data-testid="tweet" class="css-article r-column"><p>Synthetic logged-in post</p><div role="link" tabindex="0" class="r-quote"><a href="/quoted/status/999"><time datetime="2026-09-18T00:00:00Z">Quoted timestamp</time></a><a href="/quoted/status/999/photo/1">Quoted media</a></div><a href="/synthetic/status/${id}"><time datetime="2026-09-19T00:00:00Z">Own timestamp</time></a><p class="fixture-message">Own message and direct media selection</p><div role="group" class="css-box r-row"><div class="css-box r-slot">${button('reply','2 条回复')}</div><div class="css-box r-slot">${button('retweet','3 次转帖')}</div><div class="css-box r-slot">${button('like','4 次喜欢')}</div><div class="css-box r-slot"><a href="/synthetic/status/${id}/analytics" class="css-action r-button">5 views</a></div><div class="css-box r-bookmark-slot">${button('bookmark','加入书签')}</div><div class="css-box r-share"><div>${button('share','分享帖子')}</div></div></div></article>`;
  return publicFixture(id).replace(/<article[\s\S]*?<\/article>/,article).replace('<style>','<style>.r-column{display:flex;flex-direction:column;gap:4px}.r-row{display:flex;align-items:center;justify-content:space-between;height:20px;min-height:20px}.r-slot{display:flex;flex:1;min-width:0}.r-bookmark-slot{display:flex;flex:0 0 auto;margin-right:8px}.r-button{display:flex;align-items:center;border:0;padding:0;background:none;color:rgb(231,233,234);text-decoration:none;cursor:pointer}.r-presentation{display:flex;align-items:center;font-size:15px;line-height:20px}.r-icon-wrap{display:inline-flex;position:relative}.r-overlay{position:absolute;inset:-8px;border-radius:9999px;opacity:0}.r-svg{width:1.25em;height:1.25em;fill:currentColor;display:inline-block}.r-count{padding-left:4px}.r-share{display:flex;flex-shrink:0}.r-quote{border:1px solid #2f3336;padding:8px}');
}
function fixture(id,failed=false) {const html=['103','104'].includes(id)?loggedInFixture(id):publicFixture(id,failed);return authenticatedFixtureIds.has(id)?authenticatedPage(id,html):html;}
async function routeFixtures(delay=0) {
  await context.route('https://x.com/**',route=>{const url=new URL(route.request().url());if(url.pathname.includes('/i/api/graphql/')){const id=JSON.parse(url.searchParams.get('variables')).focalTweetId;return route.fulfill({status:id==='699'?500:200,contentType:'application/json',body:id==='699'?'invalid unrelated JSON':JSON.stringify(authenticatedResponse(id))});}const id=url.pathname.split('/').at(-1);return route.fulfill({status:200,contentType:'text/html',body:fixture(id,id==='102')});});
  await context.route('https://pbs.twimg.com/**',async route=>{if(delay) await pause(delay); return route.fulfill({status:route.request().url().includes('failure')?503:200,contentType:'image/png',body:image});});
  await context.route('https://video.twimg.com/**',async route=>{if(delay) await pause(delay); return route.fulfill({status:200,contentType:'video/mp4',body:video});});
}
async function routeOffscreen(delay=0) {
  const cdp=await context.browser().newBrowserCDPSession();
  const target=await until(async()=> (await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/offscreen.html')),Boolean,'offscreen target');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
  let sequence=0;const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});void cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  cdp.on('Target.receivedMessageFromTarget',event=>{
    if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);if(message.error)task?.reject(new Error(JSON.stringify(message.error)));else task?.resolve(message.result);return;}
    if(message.method==='Fetch.requestPaused')void(async()=>{
      const request=message.params;const url=new URL(request.request.url);let body,type,status=200;
      if(captureGate)await captureGate(url);
      if(url.hostname==='x.com'){const id=url.pathname.split('/').at(-1);body=Buffer.from(fixture(id,id==='102'));type='text/html';if(id==='302')status=503;}
      else {if(delay)await pause(delay);body=url.hostname==='pbs.twimg.com'?image:video;type=url.hostname==='pbs.twimg.com'?'image/png':'video/mp4';if(url.pathname.includes('failure'))status=503;}
      await send('Fetch.fulfillRequest',{requestId:request.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type},{name:'Content-Length',value:String(body.length)}],body:body.toString('base64')});
    })().catch(error=>console.error('Fixture route error:',String(error)));
  });
  await send('Fetch.enable',{patterns:[{urlPattern:'https://x.com/*'},{urlPattern:'https://pbs.twimg.com/*'},{urlPattern:'https://video.twimg.com/*'}]});
}
async function results(id='', slowRead=false) {
  const page=await context.newPage();
  if(slowRead)await page.addInitScript(()=>{
    const Original=BroadcastChannel;
    globalThis.BroadcastChannel=class extends Original {
      set onmessage(handler){super.onmessage=event=>{if(event.data?.value?.snapshot)setTimeout(()=>handler?.call(this,event),5500);else handler?.call(this,event);};}
    };
  });
  await page.goto(`chrome-extension://${extensionId}/results.html${id?'#'+id:''}`);return page;
}
async function capture(id) {
  const page=await context.newPage();await page.goto(`https://x.com/synthetic/status/${id}`);const action=page.locator('[data-locus-action] button');await action.waitFor();
  const geometry=await page.evaluate(()=>{const row=document.querySelector('.fixture-row'),slot=row.querySelector('[data-locus-action]'),button=slot.querySelector('button'),reply=row.querySelector('[aria-label="Reply"]');return {count:row.querySelectorAll('[data-locus-action]').length,afterBookmark:slot.previousElementSibling===row.querySelector('[aria-label="Bookmark"]'),beforeShare:slot.nextElementSibling===row.querySelector('[aria-label="Share"]'),rowHeight:row.getBoundingClientRect().height,articleHeight:document.querySelector('article').getBoundingClientRect().height,baseline:window.fixtureArticleHeight,buttonClasses:button.className,replyClasses:reply.className,iconSize:button.querySelector('svg').getBoundingClientRect().width,nativeIconSize:reply.querySelector('svg').getBoundingClientRect().width};});
  assert.equal(geometry.count,1);assert.equal(geometry.afterBookmark,true);assert.equal(geometry.beforeShare,true);assert.equal(geometry.rowHeight,20);assert.equal(geometry.articleHeight,geometry.baseline);assert.equal(geometry.buttonClasses,geometry.replyClasses);assert.equal(geometry.iconSize,geometry.nativeIconSize);
  if(id==='100'){await page.evaluate(()=>{const quote=document.createElement('article');quote.dataset.fixtureQuote='true';quote.innerHTML='<button data-testid="reply">Nested quoted reply</button>';document.querySelector('article').prepend(quote);});await pause(200);assert.equal(await page.locator('[data-locus-action]').count(),1);await page.locator('[data-fixture-quote]').evaluate(quote=>quote.remove());}
  if(id==='101'){await page.locator('article').screenshot({path:path.join(work,'capture-collapsed-wide.png')});await page.setViewportSize({width:390,height:844});await page.locator('article').screenshot({path:path.join(work,'capture-collapsed-narrow.png')});await page.setViewportSize({width:1280,height:900});}
  await until(()=>action.getAttribute('data-locus-state'),state=>state==='uncaptured','passive source lookup settles before activation');
  await action.evaluate(button=>button.click());await pause(100);assert.equal(await action.getAttribute('data-locus-state'),'uncaptured','Script cannot initiate capture');
  const tabs=context.pages().length;
  await action.focus();await page.keyboard.press('Shift+Enter');
  await until(()=>action.getAttribute('data-locus-state'),state=>state!=='uncaptured' && state!=='checking','Trusted modified activation starts full-scope capture');
  assert.equal(await action.evaluate(button=>document.activeElement===button),true,'Starting capture preserves source focus');
  assert.equal(await page.getByRole('checkbox').count(),0,'There is no media-picker step');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(context.pages().length,tabs);
  await page.getByRole('button',{name:'Expand capture queue',exact:true}).click();
  const task=page.locator('[data-task-id]').filter({hasText:'@synthetic · '+id});await task.waitFor();
  await task.locator('[data-slot="item-actions"] button').evaluate(button=>button.click());await pause(100);assert.equal(context.pages().length,tabs,'Script cannot navigate to results');
  await page.getByRole('button',{name:'Minimize capture queue',exact:true}).click();await page.evaluate(()=>{const row=document.querySelector('.fixture-row'),replacement=row.cloneNode(true);replacement.querySelector('[data-locus-action]')?.remove();row.replaceWith(replacement);});await until(()=>page.locator('[data-locus-action]').count(),count=>count===1,'single row action after replacement');
  await page.evaluate(()=>{const article=document.querySelector('article'),replacement=article.cloneNode(true);replacement.querySelector('[data-locus-action]')?.remove();article.replaceWith(replacement);window.installFixtureArticle(replacement);});await until(()=>page.locator('[data-locus-action]').count(),count=>count===1,'single article action after replacement');await page.getByRole('button',{name:'Expand capture queue',exact:true}).click();await task.waitFor();assert.equal(await page.evaluate(()=>window.fixtureNavigations),0);
  if(id==='100'){await page.locator('[aria-label="Reply"]').evaluate(link=>{link.href='/synthetic/status/199';});await pause(200);await until(()=>action.getAttribute('data-locus-state'),state=>state==='uncaptured','changed source has independent state');await task.waitFor();await page.locator('[aria-label="Reply"]').evaluate(link=>{link.href='/synthetic/status/100';});await until(()=>action.getAttribute('data-locus-state'),state=>state==='saved','restored exact-source missing-connection state');}
  return page;
}
async function verifyLoggedInAction() {
  const page=await context.newPage();await page.goto('https://x.com/synthetic/status/103');
  const action=page.locator('[data-locus-action] button');await action.waitFor();
  await until(()=>action.getAttribute('data-locus-state'),state=>state==='uncaptured','unrecorded RNW source');
  const presentation=await page.evaluate(()=>{
    const row=document.querySelector('[role="group"]'),slot=row.querySelector('[data-locus-action]'),button=slot.querySelector('button'),ownIcon=button.querySelector('svg'),reply=row.querySelector('[data-testid="reply"]'),nativeIcon=reply.querySelector('svg');
    return {dataIcons:document.querySelectorAll('[data-icon]').length,literalFlex:document.querySelectorAll('.flex').length,afterBookmark:slot.previousElementSibling===row.querySelector('[data-testid="bookmark"]').parentElement,beforeShare:!!slot.nextElementSibling.querySelector('[data-testid="share"]'),height:row.getBoundingClientRect().height,articleHeight:document.querySelector('article').getBoundingClientRect().height,baseline:window.fixtureArticleHeight,color:getComputedStyle(ownIcon).color,nativeColor:getComputedStyle(nativeIcon).color,width:ownIcon.getBoundingClientRect().width,nativeWidth:nativeIcon.getBoundingClientRect().width,fill:getComputedStyle(ownIcon).fill,copiedNativeState:button.hasAttribute('data-testid')||button.hasAttribute('aria-pressed'),hidden:button.getAttribute('aria-expanded')==='false'};
  });
  assert.equal(presentation.dataIcons,0);assert.equal(presentation.literalFlex,0);assert.equal(presentation.afterBookmark,true);assert.equal(presentation.beforeShare,true);assert.equal(presentation.height,20);assert.equal(presentation.articleHeight,presentation.baseline);assert.equal(presentation.color,presentation.nativeColor);assert.equal(presentation.width,presentation.nativeWidth);assert.equal(presentation.nativeWidth,18.75);assert.equal(presentation.fill,'none');assert.equal(presentation.copiedNativeState,false);assert.equal(presentation.hidden,true);
  const nativeReply=page.locator('[data-testid="reply"]');
  await nativeReply.evaluate(button=>{const color=button.firstElementChild;button.addEventListener('pointerenter',()=>{color.style.color='rgb(29,155,240)';});button.addEventListener('pointerleave',()=>{color.style.color='rgb(113,118,123)';});});
  await nativeReply.hover();await pause(200);assert.equal(await action.locator('svg').evaluate(svg=>getComputedStyle(svg).color),presentation.color,'Locus idle color must not follow transient native Reply hover');
  await action.hover();await until(()=>action.locator('[data-locus-glyph]').evaluate(glyph=>Number(getComputedStyle(glyph,'::before').opacity)),value=>value>.1,'extension-owned RNW hover feedback');
  await page.locator('article').screenshot({path:path.join(work,'logged-in-hover.png')});await page.mouse.move(0,0);
  await until(()=>action.locator('[data-locus-glyph]').evaluate(glyph=>Number(getComputedStyle(glyph,'::before').opacity)),value=>value===0,'RNW hover feedback settles before idle screenshot');
  await writeFile(path.join(work,'logged-in-presentation.json'),JSON.stringify(presentation,null,2));
  await page.locator('article').screenshot({path:path.join(work,'logged-in-collapsed-wide.png')});await page.setViewportSize({width:390,height:844});await page.locator('article').screenshot({path:path.join(work,'logged-in-collapsed-narrow.png')});await page.setViewportSize({width:1280,height:900});
  await action.evaluate(button=>button.click());assert.equal(await action.getAttribute('aria-expanded'),'false');
  await action.focus();await page.keyboard.press('Shift+Enter');
  await page.getByRole('button',{name:'Expand capture queue',exact:true}).click();
  await page.locator('[data-task-id]').filter({hasText:'@synthetic · 103'}).waitFor();
  assert.equal(await page.getByRole('checkbox').count(),0,'Modified activation does not open media picking');
  await page.getByRole('button',{name:'Minimize capture queue',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>{const row=document.querySelector('[role="group"]');const next=row.cloneNode(true);next.querySelector('[data-locus-action]').remove();next.querySelector('[data-testid="like"]').setAttribute('data-testid','unlike');row.replaceWith(next);});
  await until(()=>page.locator('[data-locus-action]').count(),count=>count===1,'RNW unlike row replacement');assert.equal(await action.count(),1);
  assert.equal(await page.getByRole('dialog').count(),0,'Replacing a native row must preserve the minimized queue');
  await page.evaluate(()=>{document.querySelector('a[href$="/103/analytics"]').href='/different/status/999/analytics';});await until(()=>page.locator('[data-locus-action]').count(),count=>count===0,'contradictory own analytics must not bind quoted subject');
  await page.evaluate(()=>{document.querySelector('a[href$="/999/analytics"]').href='/synthetic/status/103/analytics';});await action.waitFor();assert.equal(await action.count(),1);
  assert.equal(await page.evaluate(()=>window.fixtureNavigations),0);await page.close();
  checks.push('Logged-in RNW action row: localized labels, quoted-link exclusion, neutral 18.75px icon with independent hover, unlike/rerender source binding, conflicting analytics rejection, and trusted keyboard opening');
}
async function verifyFloatingQueue() {
  const page=await context.newPage();await page.setViewportSize({width:1280,height:900});await page.goto('https://x.com/synthetic/status/104');
  const launcher=page.getByRole('button',{name:'Expand capture queue',exact:true});await launcher.waitFor();
  assert.equal(await launcher.getAttribute('aria-expanded'),'false','Queue entry is available without initiating this source');
  assert.equal(await page.getByRole('checkbox').count(),0);
  await page.evaluate(()=>{const outside=document.createElement('div');outside.style.cssText='padding:20px;min-height:1700px';outside.innerHTML='<label>Outside note <input aria-label="Outside note"></label> <a href="#outside" id="outside-link">Outside link</a>';document.body.append(outside);});
  await page.getByRole('textbox',{name:'Outside note'}).fill('Browsing continues');
  assert.equal(await page.getByRole('dialog').count(),0,'Background work does not open task inspection');
  assert.equal(await page.evaluate(()=>document.querySelector('article').getBoundingClientRect().height),await page.evaluate(()=>window.fixtureArticleHeight));
  await launcher.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.setViewportSize({width:390,height:844});
  const rect=await dialog.boundingBox();assert(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=390 && rect.y+rect.height<=844);
  await page.screenshot({path:path.join(work,'capture-queue-narrow.png')});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await until(()=>launcher.evaluate(button=>button.getRootNode().activeElement===button),Boolean,'Explicit queue close restores launcher focus');
  await page.getByRole('textbox',{name:'Outside note'}).fill('Still browsing');await page.locator('#outside-link').click();
  await page.close();checks.push('Queue entry is available before source capture; browsing stays usable, task inspection is explicit, narrow modal bounds and focus return remain valid, and no media picker exists');
}
async function databaseRows(page,store) {return page.evaluate(async store=>{const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('locus-results-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});try{return await new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}},store);}
async function verifyRestoredVideo(page) {
  const preview=page.locator('video');await preview.waitFor();
  const state=()=>preview.evaluate(element=>({readyState:element.readyState,networkState:element.networkState,width:element.videoWidth,height:element.videoHeight,duration:element.duration,currentTime:element.currentTime,paused:element.paused,ended:element.ended,error:element.error?{code:element.error.code,message:element.error.message}:null,sourceProtocol:new URL(element.currentSrc).protocol,decodedFrames:element.getVideoPlaybackQuality().totalVideoFrames,visible:element.getBoundingClientRect().top<innerHeight&&element.getBoundingClientRect().bottom>0}));
  const before=await state();
  await preview.scrollIntoViewIfNeeded();
  const presentedFrame=await preview.evaluate(async element=>{
    element.muted=true;
    const frame=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Restored Blob video did not present a decoded frame')),10_000);
      element.requestVideoFrameCallback((_,metadata)=>{clearTimeout(timeout);resolve({width:metadata.width,height:metadata.height,mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames});});
    });
    try { await element.play(); } catch(error) {
      // Chrome can finish this one-frame fixture before settling play(). Accept
      // that specific terminal race only with actual decoded playback evidence.
      if (!(error instanceof DOMException && error.name==='AbortError' && element.ended && !element.error && element.currentTime>0 && element.getVideoPlaybackQuality().totalVideoFrames>0)) throw error;
    }
    return frame;
  });
  const playing=await until(state,value=>!value.error&&value.readyState>=2&&value.width>0&&value.height>0&&value.currentTime>0&&value.decodedFrames>0,'restored Blob video decoding and playback');
  assert.equal(playing.sourceProtocol,'blob:');
  await preview.evaluate(element=>element.pause());
  const paused=await state();
  assert.equal(paused.error,null);assert.equal(paused.paused,true);
  await writeFile(path.join(work,'video-preview-readiness.json'),JSON.stringify({before,presentedFrame,playing,paused},null,2));
  return preview;
}
try {
  await launch('production-permissions-profile');
  let resultPage=await results();
  await resultPage.getByText('No captures yet',{exact:true}).waitFor();
  await resultPage.screenshot({path:path.join(work,'library-empty.png')});
  await resultPage.getByRole('button',{name:'Settings',exact:true}).click();
  await resultPage.getByRole('dialog',{name:'Settings',exact:true}).getByRole('tab',{name:'General',exact:true}).click();
  assert.equal(await resultPage.getByRole('button',{name:'Enable Twitter',exact:true}).isEnabled(),true);
  const actualGrants=await resultPage.evaluate(()=>chrome.permissions.getAll());
  assert.equal(actualGrants.origins?.length ?? 0,0);
  checks.push('Unmodified production manifest: no site grants, empty result UI, explicit enabling action');
  await context.close(); context=undefined;

  // Headless Chrome has no supported automation for the native host-permission
  // prompt. Only this disposable build copy gets pre-grants for fixture tests.
  manifest.host_permissions=manifest.optional_host_permissions;
  await writeFile(manifestPath,JSON.stringify(manifest));
  // Capture the native event listener only in this disposable worker copy so
  // revocation ordering can be exercised without automating a permission prompt.
  const backgroundPath=path.join(extension,'background.js');await writeFile(backgroundPath,`{const event=chrome.permissions.onRemoved,add=event.addListener.bind(event);globalThis.fixturePermissionRemovalListeners=[];event.addListener=listener=>{fixturePermissionRemovalListeners.push(listener);add(listener);};}\n`+await readFile(backgroundPath,'utf8'));
  const twitterPath=path.join(extension,'content-scripts/twitter.js');
  await writeFile(twitterPath,`if(location.pathname==='/synthetic/status/505'){const send=chrome.runtime.sendMessage.bind(chrome.runtime);let attempts=0;chrome.runtime.sendMessage=(message,...args)=>{if(message?.op==='access'){document.documentElement.dataset.fixtureAccessAttempts=String(++attempts);if(attempts<3)return Promise.reject(new Error('Synthetic worker startup failure'));}return send(message,...args);};}\n`+await readFile(twitterPath,'utf8'));
  await installProgressFixture(extension);
  await launch('fixture-profile'); await routeFixtures(700);
  resultPage=await results();
  await resultPage.getByRole('button',{name:'Settings',exact:true}).click();
  await resultPage.getByRole('dialog',{name:'Settings',exact:true}).getByRole('tab',{name:'General',exact:true}).click();
  await resultPage.getByRole('button',{name:'Twitter enabled',exact:true}).waitFor();
  await resultPage.keyboard.press('Escape');
  await resultPage.getByRole('dialog',{name:'Settings',exact:true}).waitFor({state:'hidden'});
  await routeOffscreen(700);
  await verifyLoggedInAction();
  await verifyFocalActions({context,until,checks,work,loggedInFixture});
  await verifyShareActions({context,until,checks,loggedInFixture});
  await verifyFloatingQueue();
  let source=await capture('100');
  let rows=await until(()=>databaseRows(resultPage,'results'),rows=>rows.some(row=>row.sourceUrl.endsWith('/100')),'text-only retention');
  const textRow=rows.find(row=>row.sourceUrl.endsWith('/100'));const textId=textRow.id; assert.equal(textRow.assets.length,0); assert.equal(textRow.records[0].payload.fullText,'Synthetic post 100\nFull message');
  await source.reload();await until(()=>source.locator('[data-locus-action] button').getAttribute('data-locus-state'),value=>value==='saved','missing-connection status restored after reload');assert.equal(await source.getByRole('dialog').count(),0);await source.locator('article').screenshot({path:path.join(work,'capture-state-saved.png')});await source.getByRole('button',{name:'Expand capture queue',exact:true}).click();
  // Reload restores passive source status; terminal tasks belong to the result
  // library rather than being recreated as this page's active queue entries.
  await resultPage.getByRole('button',{name:'Open capture @synthetic · 100',exact:true}).click();
  resultPage=await until(async()=>context.pages().find(page=>page.url()===`chrome-extension://${extensionId}/results.html#${textId}`),Boolean,'explicit result opens in an existing or new tab');
  await resultPage.waitForLoadState();
  checks.push('Actual article control + initial-source loader + text-only capture; script clicks rejected, trusted keyboard start and explicit result opening work');
  checks.push('Compact action groups between Bookmark and Share without increasing row/article height; close/reopen and row/article/source replacement preserve the correct state and stop enclosing link navigation');
  await source.close();

  source=await capture('101');
  rows=await until(()=>databaseRows(resultPage,'results'),rows=>rows.some(r=>r.sourceUrl.endsWith('/101') && r.assets.length===2),'accepted media capture');
  const mediaId=rows.find(r=>r.sourceUrl.endsWith('/101') && r.assets.length===2).id;
  await source.close();await resultPage.close();
  const observer=await context.newPage(); await observer.goto(`chrome-extension://${extensionId}/results.html#${mediaId}`);
  rows=await until(()=>databaseRows(observer,'results'),rows=>rows.find(r=>r.id===mediaId)?.assets.every(a=>a.acquisition.state==='acquired'),'independent complete media capture');
  await observer.getByRole('button',{name:'Export ZIP',exact:true}).waitFor();
  const bytes=await observer.evaluate(async id=>{const db=await new Promise(resolve=>{const req=indexedDB.open('locus-results-v1');req.onsuccess=()=>resolve(req.result);}); const row=await new Promise(resolve=>{const req=db.transaction('blobs').objectStore('blobs').get([id,'media-2']);req.onsuccess=()=>resolve(req.result);});db.close();return {type:row.type,size:row.size,bytes:Array.from(new Uint8Array(await row.arrayBuffer()))};},mediaId);
  assert.equal(bytes.type,'video/mp4');assert.deepEqual(Buffer.from(bytes.bytes),video);
  checks.push('Real offscreen acquisition continues after source/result closure; exact PNG/MP4 Blobs committed');
  const beforeWorker=context.serviceWorkers().find(worker=>worker.url().includes(extensionId));
  await beforeWorker.evaluate(()=>{globalThis.__locusDisposableWorkerMarker=true;});
  const workerControl=await context.newCDPSession(observer);
  await workerControl.send('ServiceWorker.enable');await workerControl.send('ServiceWorker.stopAllWorkers');
  await observer.getByRole('button',{name:'Retry loading',exact:true}).click();await observer.getByRole('button',{name:'Export ZIP',exact:true}).waitFor();
  await until(async()=>{const worker=context.serviceWorkers().find(worker=>worker.url().includes(extensionId));if(!worker)return false;return worker.evaluate(()=>globalThis.__locusDisposableWorkerMarker!==true).catch(()=>false);},Boolean,'worker actually recreated');
  assert.equal((await databaseRows(observer,'results')).find(row=>row.id===mediaId).assets.every(asset=>asset.acquisition.state==='acquired'),true);
  checks.push('Worker stop/wake preserves surviving offscreen results without resubmitting capture');

  await observer.getByRole('button',{name:'Export ZIP',exact:true}).click();
  let deliveries=await until(()=>databaseRows(observer,'deliveries'),rows=>rows.some(d=>d.state==='complete'),'confirmed native download',30_000);
  const delivered=deliveries.find(d=>d.state==='complete');
  const nativeItem=(await observer.evaluate(id=>chrome.downloads.search({id}),delivered.downloadId))[0];
  assert.ok(path.resolve(nativeItem.filename).startsWith(path.resolve(work)+path.sep),'Test download must stay inside the disposable workspace');
  const zipBytes=await readFile(nativeItem.filename);
  const reader=new ZipReader(new BlobReader(new Blob([zipBytes])),{useWebWorkers:false}); const entries=(await reader.getEntries()).filter(e=>!e.directory);
  const metadata=JSON.parse(await entries.find(e=>e.filename==='metadata.json').getData(new TextWriter()));
  const line=JSON.parse((await entries.find(e=>e.filename==='records.jsonl').getData(new TextWriter())).trim());
  assert.deepEqual(metadata.files.map(f=>f.path),['files/asset-001.png','files/asset-002.mp4']);assert.deepEqual(line.files.map(f=>f.path),metadata.files.map(f=>f.path));
  assert.deepEqual(Buffer.from(await (await entries.find(e=>e.filename.endsWith('.mp4')).getData(new BlobWriter())).arrayBuffer()),video);await reader.close();
  checks.push('Native ZIP download confirmed complete; exported MP4 bytes and JSON/JSONL paths match');

  // Clear target stays pinned even when result routing changes while dialog open.
  const beforeClearIds=(await databaseRows(observer,'results')).map(row=>row.id).sort();
  const retainedSource=await context.newPage();await retainedSource.goto('https://x.com/renamed/status/101');await retainedSource.locator('[data-locus-action] button').waitFor();await retainedSource.locator('[aria-label="Reply"]').evaluate(link=>{link.href='/renamed/status/101';});await pause(300);await until(()=>retainedSource.locator('[data-locus-action] button').getAttribute('data-locus-state'),value=>value==='saved','source identity survives username change');
  await observer.getByRole('button',{name:'Clear capture',exact:true}).click();
  await observer.evaluate(id=>{location.hash=id;},textId);
  await observer.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual((await databaseRows(observer,'results')).map(row=>row.id).sort(),beforeClearIds);
  await observer.goto(`chrome-extension://${extensionId}/results.html#${mediaId}`);await observer.getByRole('button',{name:'Clear capture',exact:true}).click();await observer.getByRole('alertdialog').getByRole('button',{name:'Clear capture',exact:true}).click();
  await until(()=>databaseRows(observer,'results'),rows=>!rows.some(r=>r.id===mediaId),'confirmed clear');
  await until(()=>retainedSource.locator('[data-locus-action] button').getAttribute('data-locus-state'),value=>value==='uncaptured','cleared source returns to not captured',20_000);await retainedSource.close();
  assert.ok((await readFile(nativeItem.filename)).length>0);
  checks.push('Clear cancellation survives route change; confirmed clear preserves downloaded filesystem artifact');

  source=await capture('102');rows=await until(()=>databaseRows(observer,'results'),rows=>rows.some(r=>r.sourceUrl.endsWith('/102') && r.assets.every(a=>a.acquisition.state!=='pending')),'partial media capture');
  const partial=rows.find(r=>r.sourceUrl.endsWith('/102'));assert.equal(partial.assets[0].acquisition.state,'unavailable');assert.equal(partial.assets[1].acquisition.state,'acquired');await until(()=>source.locator('[data-locus-action] button').getAttribute('data-locus-state'),state=>state==='partial','partial scope stays amber');await source.getByRole('button',{name:'Minimize capture queue',exact:true}).click();await source.locator('article').screenshot({path:path.join(work,'capture-state-partial.png')});await source.close();
  await observer.goto(`chrome-extension://${extensionId}/results.html#${partial.id}`);await observer.getByRole('button',{name:'Export available content',exact:true}).click();
  deliveries=await until(()=>databaseRows(observer,'deliveries'),rows=>rows.some(d=>d.resultId===partial.id && d.state==='complete'),'partial native export');assert.equal(deliveries.find(d=>d.resultId===partial.id).partial,true);
  checks.push('Actual HTTP failure remains selected/unavailable; successful MP4 is retained and partial export completes');

  await context.close();context=undefined;
  await launch('fixture-profile');const reopened=await results(partial.id,true);
  await reopened.getByRole('button',{name:'Export available content',exact:true}).waitFor();
  const recovered=await databaseRows(reopened,'results');assert.equal(recovered.find(r=>r.id===partial.id).assets[1].acquisition.state,'acquired');
  checks.push('Full restart recovers committed media without network; a 5.5-second read completes despite the 4-second poll interval');
  const restoredPreview=await verifyRestoredVideo(reopened);
  checks.push('Restored actual Blob MP4 decodes, presents a frame, and advances playback time without media errors');
  await reopened.setViewportSize({width:390,height:844});assert.equal(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await restoredPreview.scrollIntoViewIfNeeded();await restoredPreview.screenshot({path:path.join(work,'video-preview.png')});
  await reopened.screenshot({path:path.join(work,'results-narrow.png'),fullPage:true});
  await reopened.setViewportSize({width:1280,height:900});await restoredPreview.scrollIntoViewIfNeeded();await reopened.screenshot({path:path.join(work,'results-wide.png'),fullPage:true});
  checks.push('Narrow result layout has no horizontal page overflow; narrow/wide screenshots saved');
  checks.push(await verifyLibraryUi({context,extensionId,work}));
  checks.push(await verifyInboxUi({context,extensionId,work}));
  await routeFixtures();await routeOffscreen();await verifyBrowserQueue({context,extensionId,until,checks,work,fixture,setGate:gate=>{captureGate=gate;}});await verifyPageStatus({context,extensionId,until,checks});await verifyQuickCapture({context,extensionId,until,checks,work,resultPage:reopened,databaseRows,setGate:gate=>{captureGate=gate;}});
  await verifyAuthenticatedProbe({context,extensionId,resultPage:reopened,databaseRows,until,checks,work});
  await verifyProgressRing({context,until,checks,work});
  const ringGeometry=await verifyProgressRingGeometry(context,work);checks.push(`Progress ring: ${ringGeometry.glyphChecks} center/radius checks across animation phases, reduced motion, native sizes and zoom; maximum center error ${ringGeometry.maxCenterError}px`);
  if(process.env.LOCUS_LIVE_ACTION_PROBE==='1') {
    const live=await context.newPage();
    try {
      await live.goto('https://x.com/jack/status/20',{waitUntil:'domcontentloaded'});
      const article=live.locator('article').filter({has:live.locator('a[aria-label="Reply"][href="/jack/status/20"]')}).first();
      await article.locator('[data-locus-action]').waitFor({timeout:20_000});
      assert.equal(await page.getByRole('dialog').count(),0);
      assert.equal(await article.locator('[data-locus-action]').evaluate(slot=>!!slot.previousElementSibling?.querySelector('svg[data-icon="icon-bookmark-stroke"],svg[data-icon="icon-bookmark-fill"]')),true);
      await article.screenshot({path:path.join(work,'live-x-action-row.png')});liveProbe={status:'PASS'};checks.push('Read-only live x.com/jack/status/20: collapsed native-row entry verified; actual article screenshot saved');
    } catch(error) { liveProbe={status:'BLOCKED',reason:String(error)};await live.screenshot({path:path.join(work,'live-x-probe-unavailable.png'),fullPage:true}); }
  }
  console.log(JSON.stringify({status:'PASS',work,checks,liveProbe,manual:['Native optional-host permission prompt acceptance/denial/removal','Native download intervention UI and browser-forced mid-download interruption','Live public X source/network coverage beyond these disposable fixtures']},null,2));
} catch(error) {
  for(const page of context?.pages()??[])if(page.url().includes('/results.html'))await page.screenshot({path:path.join(work,'failed-results-ui.png'),fullPage:true}).catch(()=>{});
  for (const page of context?.pages() ?? []) console.error('Page state:',page.url(),await page.locator('body').innerText().catch(()=>''));
  if(context) {
    const cdp=await context.browser().newBrowserCDPSession();const targets=await cdp.send('Target.getTargets');console.error('Targets:',JSON.stringify(targets));
    for(const target of targets.targetInfos.filter(t=>t.url.endsWith('/offscreen.html'))) {
      const attached=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
      cdp.on('Target.receivedMessageFromTarget',event=>console.error('Offscreen diagnostic:',event.message));
      await cdp.send('Target.sendMessageToTarget',{sessionId:attached.sessionId,message:JSON.stringify({id:2,method:'Runtime.enable'})});
      await cdp.send('Target.sendMessageToTarget',{sessionId:attached.sessionId,message:JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'({head:document.head.innerHTML,listeners:chrome.runtime.onMessage.hasListeners(),resources:performance.getEntriesByType("resource").map(r=>r.name)})',returnByValue:true}})});
      await pause(300);
    }
  }
  console.error(JSON.stringify({status:'FAIL',work,checks,error:String(error),stack:error.stack},null,2));process.exitCode=1;
} finally { await context?.close(); }
