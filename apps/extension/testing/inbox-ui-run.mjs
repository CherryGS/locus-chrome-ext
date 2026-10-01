/** Focused disposable production-UI regression; full host coverage stays in browser-smoke. */
import { mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { verifyInboxUi } from './inbox-ui-smoke.mjs';

if (!process.env.LOCUS_CHROME_PATH) throw new Error('Set LOCUS_CHROME_PATH to Chrome for Testing');
const work = await mkdtemp(path.join(tmpdir(), 'locus-inbox-ui-'));
const extension = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
const context = await chromium.launchPersistentContext(path.join(work, 'profile'), { executablePath: process.env.LOCUS_CHROME_PATH, headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  console.log(await verifyInboxUi({ context, extensionId: new URL(worker.url()).host, work }));
  // Reopen the exact historical failure through real storage and a fresh owner.
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  const url = `chrome-extension://${new URL(worker.url()).host}/results.html`;
  await page.goto(url); await page.getByText('No captures yet', {exact:true}).waitFor();
  const id = await page.evaluate(async () => {
    const id = crypto.randomUUID(), sourceUrl = 'https://x.com/synthetic/status/888';
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('locus-results-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['results', 'locus-transfers'], 'readwrite');
    tx.objectStore('results').put({ id, site:'twitter', label:'Historical unconfigured capture', sourceUrl, createdAt:new Date().toISOString(), revision:1, retention:{state:'retained',revision:1}, records:[{id:'post',assetIds:[],acquisition:{state:'acquired'},payload:{schema:'twitter-post/1',sourceId:'888',sourceUrl,fullText:'Retained before configuration'}}], assets:[] }, id);
    tx.objectStore('locus-transfers').put({ resultId:id, revision:1, state:'failed', message:'Configure the Locus address and Token in the extension’s connection settings, then continue this save', uploads:[] }, id);
    await new Promise((resolve,reject) => { tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error); }); db.close(); return id;
  });
  await worker.evaluate(async () => { if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument(); });
  await page.goto(`${url}#${id}`);
  await page.getByRole('button', {name:'Locus setup required',exact:true}).waitFor();
  await page.getByText('Retained before configuration', {exact:true}).waitFor();
  const toolbarHeight = await page.getByRole('region', { name: 'Capture inspection', exact: true }).locator(':scope > header').evaluate(header => header.getBoundingClientRect().height);
  assert(toolbarHeight <= 130, `Configuration guidance must remain compact: ${toolbarHeight}px`);
  assert.equal(await page.getByRole('region', { name: 'Capture inspection', exact: true }).locator(':scope > header [role="alert"]').count(), 0, 'Long setup explanations live in Activity');
  assert.equal(await page.locator('[data-capture-diagnostic]').count(), 0, 'Historical missing settings must not render as an error');
  assert.equal(await page.locator('[data-capture-state="failed"]').count(), 0);
  assert.equal(await page.locator('[data-capture-state="saved"] svg.lucide-inbox').count(), 2, 'List and detail share neutral staging');
  assert.deepEqual(requests, [], 'The result page does not fetch remote content');
  while (await page.getByRole('button', { name: 'Close toast', exact: true }).count()) await page.getByRole('button', { name: 'Close toast', exact: true }).last().click();
  await page.waitForFunction(() => !document.querySelector('[data-slot="toast"]'));
  await page.screenshot({path:path.join(work,'historical-configuration-staging.png'),animations:'disabled'});
  await page.getByRole('button', {name:'Locus setup required',exact:true}).click();
  await page.getByRole('button', {name:'Continue save',exact:true}).waitFor();
  await page.getByRole('button', {name:'Connection settings',exact:true}).waitFor();
  await page.screenshot({path:path.join(work,'historical-configuration-activity.png'),animations:'disabled'});
  await page.close(); console.log(`Historical missing configuration: real storage + owner restart -> neutral staging, retained content, no result-page HTTP requests; toolbar ${toolbarHeight}px PASS`);
  console.log(work);
} catch (error) { console.error(`Artifacts: ${work}`); throw error; }
finally { await context.close(); }
