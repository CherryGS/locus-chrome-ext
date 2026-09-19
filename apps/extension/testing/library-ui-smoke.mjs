/** Synthetic library data and UI-only fault injection in the disposable profile. */
import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyLibraryUi({ context, extensionId, work }) {
  const page=await context.newPage();await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(()=>{
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=(message,...rest)=>{
      if(globalThis.__locusUiFault==='clear'&&message?.op==='grant'&&message.operation==='clear'){globalThis.__locusUiFault=null;return Promise.resolve({ok:false,error:'Synthetic removal failure; the capture is still available.'});}
      return send(message,...rest);
    };
    const Original=BroadcastChannel;
    globalThis.BroadcastChannel=class extends Original {
      set onmessage(handler){super.onmessage=event=>{
        if(globalThis.__locusUiHold){(globalThis.__locusUiHeld??=[]).push(()=>handler?.call(this,event));return;}
        const value=event.data?.value;
        if(Array.isArray(value?.deliveries)&&globalThis.__locusUiDelivery)value.deliveries=[...value.deliveries,globalThis.__locusUiDelivery];
        const matches=globalThis.__locusUiFault==='collection'&&Array.isArray(value?.items)||globalThis.__locusUiFault==='read'&&value&&Object.hasOwn(value,'snapshot');
        if(matches){handler?.call(this,new MessageEvent('message',{data:{...event.data,ok:false,error:'Synthetic read interruption. Retry to reconnect.'}}));}
        else handler?.call(this,event);
      };}
    };
  });
  await page.goto(`chrome-extension://${extensionId}/results.html`);
  const fixtures=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;const draw=canvas.getContext('2d');
    draw.fillStyle='#e6ebe6';draw.fillRect(0,0,960,600);draw.fillStyle='#f5e5ba';draw.beginPath();draw.arc(738,136,61,0,Math.PI*2);draw.fill();
    draw.fillStyle='#b9c9bb';draw.beginPath();draw.moveTo(0,390);draw.bezierCurveTo(200,170,380,420,620,240);draw.bezierCurveTo(800,110,850,360,960,210);draw.lineTo(960,600);draw.lineTo(0,600);draw.fill();
    draw.fillStyle='#647d70';draw.beginPath();draw.moveTo(0,470);draw.bezierCurveTo(290,280,490,550,960,330);draw.lineTo(960,600);draw.lineTo(0,600);draw.fill();
    draw.fillStyle='#c8b79b';draw.beginPath();draw.moveTo(0,565);draw.bezierCurveTo(230,360,580,600,960,475);draw.lineTo(960,600);draw.lineTo(0,600);draw.fill();
    const landscape=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const entries=[
      {author:'Avery Park',username:'fieldnotes',post:'1979876543210987654',age:0.2,text:'A little room to slow down.\n\nKeeping this view from our morning walk: layers of green, a quiet path, and the last light over the hills.',image:true},
      {author:'Lena Reed',username:'lenareed',post:'9001002',age:1,text:'Good interfaces make room for the thing you came to see.\n\nStart with the content. Keep the details close by. Let the tools get out of the way.'},
      {author:'Studio North',username:'studionorth_archive',post:'1979876543210987668',age:2,text:'A few references for the next chapter of our field journal.\n\nThe message and one file are here. The second selected image could not be fetched.',image:true,partial:true},
      {author:'Noah Ellis',username:'noahellis',post:'9001004',age:24,text:'Notes from today’s prototype review:\n• Preserve the useful context.\n• Make the next action clear.\n• Keep the original details available.'},
      {author:'Avery Park',username:'fieldnotes',post:'9001005',age:48,text:'Small observations become useful when you can find them again. A few lines from the notebook, kept for later.'},
      {author:'Paper & Form',username:'paperandform',post:'9001006',age:120,text:'A simple test for a reading space: is the content still the first thing you notice?'}
    ];
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('locus-results-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const tx=db.transaction(['results','blobs'],'readwrite');
    const records=entries.map(entry=>{
      const id=crypto.randomUUID(),createdAt=new Date(Date.now()-entry.age*3600_000).toISOString(),sourceUrl=`https://x.com/${entry.username}/status/${entry.post}`;
      const assets=entry.image?[{id:'photo',recordId:'post',description:{kind:'photo',fixture:true},acquisition:{state:'acquired'},mime:landscape.type,size:landscape.size}]:[];
      if(entry.partial)assets.push({id:'missing-photo',recordId:'post',description:{kind:'photo',fixture:true},acquisition:{state:'unavailable',reason:'Source image request failed (HTTP 503). The acquired content remains available.'}});
      const result={id,site:'twitter',label:`@${entry.username} · ${entry.post}`,sourceUrl,createdAt,revision:1,retention:{state:'retained',revision:1},records:[{id:'post',assetIds:assets.map(asset=>asset.id),acquisition:{state:'acquired'},payload:{schema:'twitter-post/1',sourceId:entry.post,sourceUrl,fullText:entry.text,author:{accountId:entry.post,username:entry.username,displayName:entry.author},publishedAt:createdAt,observedAt:createdAt,selectedMedia:assets.map(asset=>({sourceId:asset.id,kind:'photo'})),fixture:'Disposable synthetic UI example; no real author or source content'}}],assets};
      tx.objectStore('results').put(result,id);if(entry.image)tx.objectStore('blobs').put(landscape,[id,'photo']);return {id,label:result.label,text:entry.text,partial:!!entry.partial};
    });
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();return records;
  });
  const open=async fixture=>{await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByRole('button',{name:`Open capture ${fixture.label}`,exact:true}).click();await page.getByRole('tab',{name:'Preview',exact:true}).waitFor();await page.getByText(fixture.text,{exact:true}).waitFor();};
  await open(fixtures[0]);
  await page.locator('img').evaluate(image=>image.decode());
  await page.screenshot({path:path.join(work,'library-preview-desktop.png')});
  await page.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();await page.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();
  await page.getByRole('tab',{name:'Metadata',exact:true}).click();await page.getByRole('button',{name:'Copy JSON',exact:true}).waitFor();await page.screenshot({path:path.join(work,'library-metadata-desktop.png')});
  await open(fixtures[1]);assert.equal(await page.getByRole('tab',{name:'Preview',exact:true}).getAttribute('aria-selected'),'true','Switching captures starts with content, not the previous Metadata tab');
  const search=page.getByRole('textbox',{name:'Search captures by label, author, post ID or URL',exact:true});
  await search.fill('fieldnotes');assert.equal(await page.getByRole('button',{name:/^Open capture /}).count(),2);
  await search.fill('quiet path');await page.getByText('No matching captures',{exact:true}).waitFor();await page.screenshot({path:path.join(work,'library-no-matches.png')});
  await page.getByRole('button',{name:'Clear search',exact:true}).first().click();
  await page.getByRole('button',{name:'Needs attention',exact:true}).click();assert.equal(await page.getByRole('button',{name:`Open capture ${fixtures[0].label}`,exact:true}).count(),0);await page.getByRole('button',{name:`Open capture ${fixtures[2].label}`,exact:true}).click();await page.getByText(fixtures[2].text,{exact:true}).waitFor();await page.screenshot({path:path.join(work,'library-partial-desktop.png')});
  await page.getByRole('button',{name:'All captures',exact:true}).click();await page.getByRole('button',{name:'Sort captures',exact:true}).click();await page.getByRole('menuitemradio',{name:'Oldest first',exact:true}).click();assert.equal(await page.getByRole('button',{name:/^Open capture /}).first().getAttribute('aria-label'),`Open capture ${fixtures[5].label}`);
  await page.keyboard.press('Escape');await page.getByRole('menuitemradio',{name:'Oldest first',exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'Sort captures',exact:true}).click();await page.getByRole('menuitemradio',{name:'Newest first',exact:true}).click();await page.keyboard.press('Escape');
  await open(fixtures[0]);await page.getByRole('tab',{name:'Activity',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.getByRole('tab',{name:'Activity',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Preview',exact:true}).click();
  await page.evaluate(id=>{globalThis.__locusUiDelivery={id:crypto.randomUUID(),resultId:id,revision:1,createdAt:new Date().toISOString(),state:'unverified',partial:false,reason:'Chrome could not confirm this download. Check your downloads before trying again.'};},fixtures[0].id);
  await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByText('Download not verified',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Preview',exact:true}).getAttribute('aria-selected'),'true');await page.screenshot({path:path.join(work,'library-export-unverified.png')});
  await page.getByRole('button',{name:'View export activity',exact:true}).click();await page.getByRole('tab',{name:/^Activity/}).waitFor();assert.equal(await page.getByRole('tab',{name:/^Activity/}).getAttribute('aria-selected'),'true');await page.getByRole('tab',{name:'Preview',exact:true}).click();
  await page.evaluate(()=>{globalThis.__locusUiHold=true;});await page.getByRole('button',{name:`Open capture ${fixtures[1].label}`,exact:true}).click();await page.getByRole('heading',{name:'Selected capture',exact:true}).waitFor();assert.equal(await page.getByText(/Latest export:/).count(),0,'A delayed selection must not show the previous capture delivery');
  await page.evaluate(()=>{globalThis.__locusUiHold=false;globalThis.__locusUiHeld?.splice(0).forEach(release=>release());});await page.getByText(fixtures[1].text,{exact:true}).waitFor();await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByRole('tab',{name:'Activity',exact:true}).waitFor();assert.equal(await page.getByText(/Latest export:/).count(),0,'Unrelated delivery responses must stay outside the header and Activity');
  await open(fixtures[0]);await page.getByText('Download not verified',{exact:true}).waitFor();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{globalThis.__locusUiHold=true;});await page.getByRole('button',{name:'Back to captures',exact:true}).click();await search.waitFor();assert.equal(await page.getByText(/Latest export:/).count(),0,'Back to captures clears selected delivery feedback even with delayed reads');await page.evaluate(()=>{globalThis.__locusUiHold=false;globalThis.__locusUiHeld?.splice(0).forEach(release=>release());});await page.setViewportSize({width:1440,height:1000});await open(fixtures[0]);
  await page.evaluate(()=>{globalThis.__locusUiDelivery=null;globalThis.__locusUiFault='clear';});await page.getByRole('button',{name:'Clear result',exact:true}).click();await page.getByRole('button',{name:'Confirm clear',exact:true}).click();await page.getByRole('alertdialog').getByText('Could not clear capture',{exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByText(fixtures[0].text,{exact:true}).isVisible(),true);
  await page.evaluate(()=>{globalThis.__locusUiFault='read';});await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByText('Result read failed',{exact:true}).waitFor();assert.equal(await page.getByText(fixtures[0].text,{exact:true}).isVisible(),true);await page.screenshot({path:path.join(work,'library-read-error.png')});await page.evaluate(()=>{globalThis.__locusUiFault=null;});await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByText('Result read failed',{exact:true}).waitFor({state:'hidden'});
  await page.evaluate(()=>{globalThis.__locusUiFault='collection';});await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByText('Collection access problem',{exact:true}).waitFor();await page.evaluate(()=>{globalThis.__locusUiFault=null;});await page.getByRole('button',{name:'Retry reads',exact:true}).first().click();await page.getByText('Collection access problem',{exact:true}).waitFor({state:'hidden'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(work,'library-preview-mobile.png')});assert.equal(await page.getByRole('textbox',{name:/Search captures/}).isVisible(),false);await page.getByRole('button',{name:'Back to captures',exact:true}).click();await search.waitFor();await page.screenshot({path:path.join(work,'library-list-mobile.png')});
  await page.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();await page.getByRole('button',{name:'In progress',exact:true}).click();await page.getByText('No matching captures',{exact:true}).waitFor();await page.getByRole('button',{name:'Toggle Sidebar',exact:true}).click();await page.getByRole('button',{name:'All captures',exact:true}).click();await page.getByRole('button',{name:`Open capture ${fixtures[0].label}`,exact:true}).click();await page.getByRole('button',{name:'Back to captures',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.close();return 'Filled library: summary-only search, state views, sort, content/metadata/activity tabs, read-error retry, desktop sidebar collapse, and mobile list/detail navigation';
}
