/** Synthetic logged-in detail layout; no account content or personal profile. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function verifyFocalActions({context,until,checks,work,loggedInFixture}) {
  const page=await context.newPage();await page.setViewportSize({width:1280,height:1100});await page.goto('https://x.com/synthetic/status/103');await page.locator('[data-locus-action]').waitFor();
  await page.evaluate(fixtures=>{
    const content=document.createDocumentFragment();
    for(const {kind,id,html} of fixtures){
      const article=new DOMParser().parseFromString(html,'text/html').querySelector('article');article.dataset.fixtureDetail=kind;article.querySelector('p').textContent=`Synthetic ${kind} post ${id}`;
      const ownTime=[...article.querySelectorAll('a')].find(link=>link.querySelector('time')&&!link.closest('.r-quote'));ownTime.setAttribute('role','link');
      if(kind==='focal'){
        const row=article.querySelector('[role=group]'),analytics=row.querySelector('a[href$="/analytics"]'),slot=analytics.parentElement,metadata=document.createElement('div');metadata.dataset.fixtureMetadata='true';metadata.append(ownTime,document.createTextNode(' · '),analytics);row.before(metadata);slot.remove();analytics.setAttribute('role','link');row.style.height='22.5px';for(const icon of row.querySelectorAll('svg')){icon.style.width='22.5px';icon.style.height='22.5px';}
      }
      const wrapper=document.createElement('div');wrapper.setAttribute('role','link');wrapper.tabIndex=0;wrapper.dataset.href=`/synthetic/status/${id}`;wrapper.append(article);content.append(wrapper);
    }
    document.body.replaceChildren(content);
    for(const article of document.querySelectorAll('article')){window.installFixtureArticle(article);article.dataset.baselineHeight=String(article.getBoundingClientRect().height);}
  },[{kind:'parent',id:'501',html:loggedInFixture('501')},{kind:'focal',id:'502',html:loggedInFixture('502')},{kind:'reply',id:'503',html:loggedInFixture('503')}]);
  await until(()=>page.locator('[data-locus-action]').count(),count=>count===3,'parent focal and reply controls');
  const focal=page.locator('[data-fixture-detail=focal]'),control=focal.locator('[data-locus-action] button');
  const geometry=await page.locator('[data-fixture-detail]').evaluateAll(articles=>articles.map(article=>{const row=article.querySelector('[role=group]'),slot=row.querySelector('[data-locus-action]'),own=slot.querySelector('svg'),native=row.querySelector('[data-testid=reply] svg'),bookmark=row.querySelector('[data-testid=bookmark]');return {kind:article.dataset.fixtureDetail,ownSize:own.getBoundingClientRect().width,nativeSize:native.getBoundingClientRect().width,afterBookmark:slot.previousElementSibling===bookmark.parentElement,beforeShare:!!slot.nextElementSibling?.querySelector('[data-testid=share]'),height:article.getBoundingClientRect().height,baseline:Number(article.dataset.baselineHeight),analyticsInsideRow:!!row.querySelector('a[href$="/analytics"]')};}));
  for(const item of geometry){assert.equal(item.ownSize,item.nativeSize);assert.equal(item.afterBookmark,true);assert.equal(item.beforeShare,true);assert.equal(item.height,item.baseline);assert.equal(item.analyticsInsideRow,item.kind!=='focal');assert.equal(item.ownSize,item.kind==='focal'?22.5:18.75);}
  await writeFile(path.join(work,'logged-in-detail-geometry.json'),JSON.stringify(geometry,null,2));await page.screenshot({path:path.join(work,'logged-in-detail-actions.png')});
  for(const [kind,id] of [['parent','501'],['focal','502'],['reply','503']]){
    await page.locator(`[data-fixture-detail=${kind}] [data-locus-action] button`).click({modifiers:['Shift']});await page.getByRole('button',{name:'Add to queue · 2 media',exact:true}).waitFor();await page.getByText(`@synthetic · ${id}`,{exact:true}).waitFor();await page.getByRole('button',{name:'Minimize capture queue',exact:true}).click();
  }
  assert.equal(new URL(page.url()).pathname,'/synthetic/status/103','Each own article binds independently of page URL');
  await focal.evaluate(article=>{article.querySelector('.r-quote').append(article.querySelector('[data-fixture-metadata] a[href$="/analytics"]'));});await until(()=>control.count(),count=>count===0,'quote-only corroboration rejected');assert.equal(await page.locator('[data-locus-action]').count(),2);
  await focal.evaluate(article=>{const nested=document.createElement('article');nested.dataset.fixtureNested='true';nested.append(article.querySelector('.r-quote a[href$="/analytics"]'));article.append(nested);});await new Promise(resolve=>setTimeout(resolve,250));assert.equal(await control.count(),0,'Nested article analytics cannot restore the focal control');
  await focal.evaluate(article=>{article.querySelector('[data-fixture-metadata]').append(article.querySelector('[data-fixture-nested] a'));article.querySelector('[data-fixture-nested]').remove();});await control.waitFor();
  await focal.locator('[data-fixture-metadata] a[href$="/analytics"]').evaluate(link=>{link.href='/conflict/status/999/analytics';});await until(()=>control.count(),count=>count===0,'conflicting own timestamp and analytics rejected');assert.equal(await page.locator('[data-locus-action]').count(),2);
  await focal.locator('[data-fixture-metadata] a[href$="/analytics"]').evaluate(link=>{link.href='/renamed/status/502/analytics';});await control.waitFor();
  await focal.evaluate(article=>{const extra=document.createElement('a');extra.dataset.fixtureConflict='true';extra.href='/conflict/status/999/analytics';extra.textContent='Conflicting own analytics';article.querySelector('[data-fixture-metadata]').append(extra);});await until(()=>control.count(),count=>count===0,'multiple conflicting own analytics rejected');await focal.locator('[data-fixture-conflict]').evaluate(link=>link.remove());await control.waitFor();
  await control.click({modifiers:['Shift']});await page.getByText('@synthetic · 502',{exact:true}).waitFor();assert.equal(await page.locator('[data-locus-action]').count(),3);assert.equal(await page.evaluate(()=>window.fixtureNavigations),0);await page.close();
  checks.push('Logged-in focal detail: own analytics beside timestamp above action row corroborates exact source; parent/reply rows remain independent, 22.5px focal and 18.75px row glyphs match native geometry, and quote-only/nested/conflicting analytics are rejected');
}
