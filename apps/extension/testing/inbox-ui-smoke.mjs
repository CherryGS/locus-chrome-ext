/** Production results UI with bounded, in-page synthetic host responses. No network mutations. */
import assert from 'node:assert/strict';
import path from 'node:path';

export async function dismissToasts(page) {
  // Base UI marks its visual dismiss button aria-hidden. Use the actual
  // pointer control and exclude toasts already running their exit transition.
  const active = page.locator('[data-slot="toast"]:not([data-ending-style])');
  while (await active.count()) {
    const front = active.first(), node = await front.elementHandle();
    await front.locator('[data-slot="toast-close"]').click();
    // The exiting front toast still covers older dismiss buttons.
    await page.waitForFunction(node => !node.isConnected, node);
    await node.dispose();
  }
  await page.waitForFunction(() => !document.querySelector('[data-slot="toast"]'));
}

export async function verifyInboxUi({ context, extensionId, work }) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const kinds = ['failed', 'unverified', 'legacy', 'saved', 'partial', 'active', 'retention'];
    const rows = kinds.map((kind, index) => ({ id: `inbox-${kind}`, label: `Inbox fixture ${kind}`, sourceUrl: `https://x.com/fixture/status/${1000 + index}`, createdAt: new Date(Date.now() - index * 60_000).toISOString(), revision: 1, acquisition: kind === 'active' ? 'pending' : kind === 'partial' ? 'partial' : 'complete', retention: { state: kind === 'retention' ? 'failed' : 'retained', revision: 1 }, locus: kind === 'legacy' ? undefined : { state: kind === 'active' ? 'uploading' : kind === 'saved' || kind === 'retention' ? 'complete' : kind === 'unverified' ? 'unverified' : 'failed', message: kind === 'unverified' ? 'Response lost. Inspect the original request before continuing.' : kind === 'failed' ? 'Connection unavailable. Open connection settings.\nstage: upload\nrequest-id: fixture-original' : 'Synthetic delivery evidence' } }));
    globalThis.__inbox = { rows, deliveries: [], grants: {}, calls: [], held: [], hold: false, readFailure: false, clearFailure: false, connectFailure: true };
    const fixture = globalThis.__inbox;
    navigator.clipboard.writeText = async text => { fixture.copied = text; };
    fixture.enabledOrigins = [];
    chrome.permissions.contains = async ({ origins }) => origins.every(origin => fixture.enabledOrigins.includes(origin));
    chrome.permissions.request = async ({ origins }) => { fixture.enabledOrigins = [...new Set([...fixture.enabledOrigins, ...origins])]; return true; };
    chrome.runtime.sendMessage = async message => {
      if (message.op === 'grant') { const id = crypto.randomUUID(); fixture.grants[id] = message; fixture.calls.push(message); return { ok: true, value: id }; }
      if (message.op === 'locus-settings') return { ok: true, value: { configured: false, origin: 'http://127.0.0.1:46321' } };
      if (message.op === 'locus-connect' && fixture.connectFailure) return { ok: false, error: 'Synthetic connection rejected' };
      return { ok: true };
    };
    globalThis.BroadcastChannel = class {
      close() {}
      postMessage({ requestId }) {
        const request = fixture.grants[requestId];
        if (!request) return;
        const answer = () => {
          let value;
          let error;
          const row = fixture.rows.find(item => item.id === request.id);
          if (request.operation === 'list') value = { items: fixture.rows, deliveries: fixture.deliveries };
          if (request.operation === 'read') {
            if (fixture.readFailure) error = 'Synthetic file read interruption';
            else value = { snapshot: row ? { result: { ...row, site: 'twitter', records: [{ id: 'post', assetIds: [], acquisition: { state: 'acquired' }, payload: { fixture: row.id } }], assets: row.acquisition === 'partial' ? [{ id: 'missing', recordId: 'post', acquisition: { state: 'unavailable', reason: 'HTTP 503\nstage: source-read' } }] : [] }, blobs: {}, readErrors: fixture.blobFailure ? { missing: 'Synthetic stored file unavailable' } : {} } : null, deliveries: fixture.deliveries, locus: row?.locus ? { ...row.locus, resultId: row.id, revision: 1, uploads: [] } : undefined };
          }
          if (request.operation === 'clear') {
            if (fixture.clearFailure) error = 'Synthetic clear rejected';
            else fixture.rows = fixture.rows.filter(item => item.id !== request.id);
          }
          this.onmessage?.(new MessageEvent('message', { data: structuredClone({ requestId, ok: !error, error, value }) }));
        };
        if (fixture.hold && request.operation !== 'list') fixture.held.push(answer);
        else setTimeout(answer, 0);
      }
    };
  });
  await page.goto(`chrome-extension://${extensionId}/results.html`);
  const row = kind => page.getByRole('button', { name: `Open capture Inbox fixture ${kind}`, exact: true });
  const retry = () => page.getByRole('button', { name: 'Retry loading', exact: true }).first().click();
  const inspect = async kind => { await row(kind).click(); await page.getByRole('heading', { name: `Inbox fixture ${kind}`, exact: true }).waitFor(); };
  const closeToasts = () => dismissToasts(page);
  await row('failed').waitFor();
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  const routeBeforeSkip = await page.evaluate(() => location.hash);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('main')), true, 'Skip bypasses sidebar navigation');
  assert.equal(await page.evaluate(() => location.hash), routeBeforeSkip, 'Skip never changes the selected capture route');
  assert.equal(await row('failed').evaluate(button => {
    const descriptions = button.getAttribute('aria-describedby')?.split(' ').map(id => document.getElementById(id));
    return descriptions?.length === 2 && descriptions.every(Boolean) && descriptions[1].textContent.includes('Save failed');
  }), true, 'Focusing a summary exposes its source and status description');
  assert.equal(await row('saved').count(), 0);
  assert.equal(await row('legacy').count(), 1);
  assert.equal(await row('retention').count(), 1);
  assert.equal(await page.getByRole('button', {name:'Inbox',exact:true}).locator('svg.lucide-inbox').count(), 1, 'Inbox is a destination, not an error indicator');
  assert.equal(await row('legacy').getByText('Locally staged · available for export', {exact:true}).count(), 1);
  assert.equal(await row('legacy').locator('[data-slot="badge"]').count(), 0, 'List status is expressed once rather than duplicated as badges');
  assert.equal(await row('legacy').locator('svg.lucide-inbox').count(), 1);
  assert.equal(await row('legacy').locator('[data-capture-state="failed"]').count(), 0);
  assert.equal(await row('failed').locator('[data-capture-state="failed"]').count(), 1);
  assert.equal(await row('failed').locator('[data-capture-state]').count(), 1, 'A failed save has one concise status summary');
  assert.equal(await row('retention').locator('[data-capture-retention="staged"]').count(), 0, 'Retention failure must not claim staging succeeded');
  assert.equal(await page.locator('[data-slot="toast"]').count(), 0, 'No historical toast flood');
  assert.equal(await page.evaluate(() => __inbox.calls.filter(call => call.operation === 'read').length), 0, 'List must not read blobs');

  await inspect('failed');
  assert.equal(await page.locator('.capture-inspector [data-capture-retention="staged"] svg.lucide-inbox').count(), 1, 'Detailed local retention remains independently available beside a failed save');
  await page.getByRole('button', { name: 'Check and continue save', exact: true }).waitFor();
  await page.screenshot({ path: path.join(work, 'inbox-staging-and-error.png') });
  assert.equal(await page.locator('.capture-outcome-strip dt').allTextContents().then(labels => labels.join('|')), 'Capture|Local copy|Locus save');
  assert.equal(await page.getByRole('button', { name: 'Check and continue save', exact: true }).isVisible(), true, 'Recovery remains visible before opening Activity');
  assert.equal(await page.locator('[data-slot="sidebar-inset"] > header').count(), 0, 'The library and inspector use the full viewport height');
  assert.equal(await page.getByRole('region', { name: 'Capture inspection', exact: true }).locator('header').getByRole('button', { name: /Connection settings|Check.*save|Status details/ }).count(), 0, 'Secondary save controls live with their explanation');
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
  assert(await settingsButton.evaluate(button => button.closest('[data-slot="sidebar-footer"]') && button.getBoundingClientRect().top > innerHeight / 2), 'Settings is pinned to the sidebar bottom');
  assert.equal(await page.locator('[data-capture-diagnostic] pre').isVisible(), false);
  await page.getByText('Technical details', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy diagnostic', exact: true }).click();
  assert.match(await page.evaluate(() => __inbox.copied), /fixture-original/);
  await page.getByText('Diagnostic copied.', { exact: true }).waitFor();
  await closeToasts();
  await page.getByRole('button', { name: 'Connection settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.getByRole('textbox', { name: 'Locus address' }).fill('http://127.0.0.1:46321');
  await dialog.getByLabel('Token', { exact: true }).fill('fixture-token');
  await dialog.getByRole('button', { name: 'Connect to Locus' }).click();
  await dialog.getByText('Synthetic connection rejected', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-slot="toast"]').count(), 0, 'Connection errors stay in dialog');
  await page.evaluate(() => { __inbox.connectFailure = false; });
  await dialog.getByRole('button', { name: 'Connect to Locus' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('Locus connection verified', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Connection settings', exact: true }).evaluate(button => button === document.activeElement), true, 'Connection setup returns to its initiating recovery action');
  // Check modal focus restoration before a pointer click moves focus to the
  // notification's separate dismiss control.
  await closeToasts();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await dialog.getByLabel('Token', { exact: true }).inputValue(), '');
  await dialog.getByRole('tab', { name: 'General', exact: true }).click();
  await dialog.getByText('Website access', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', {name:/Use (light|dark) theme/}).count(), 0, 'The selected design is dark only');
  await dialog.getByRole('button', { name: 'Enable Twitter', exact: true }).click();
  await dialog.getByRole('button', { name: 'Twitter enabled', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Enable Bilibili', exact: true }).click();
  await dialog.getByRole('button', { name: 'Bilibili enabled', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => __inbox.calls.filter(call => call.operation === 'locus-continue').length), 0, 'Opening settings, configuring and granting websites never continues a capture implicitly');
  assert.equal((await page.locator('[data-slot="sidebar-footer"]').innerText()).trim(), 'Settings', 'The footer has one Settings entry without redundant information');
  await page.screenshot({ path: path.join(work, 'settings-general-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(work, 'settings-general-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).evaluate(button => button === document.activeElement), true);
  await closeToasts();

  await inspect('partial');
  await page.getByRole('tab', { name: /^Activity/ }).click();
  assert.equal(await page.getByRole('tabpanel', { name: 'Activity', exact: true }).getByRole('listitem').count(), 2, 'Capture and storage have list-item semantics');
  assert.equal(await page.getByRole('button', { name: 'Check and continue save', exact: true }).count(), 0);
  await inspect('legacy');
  await page.getByRole('tab', { name: /^Activity/ }).click();
  assert.equal(await page.getByRole('button', { name: /Check.*save/ }).count(), 0);
  await inspect('unverified');
  await page.getByRole('button', { name: 'Check original save', exact: true }).click();
  await page.getByText('Save check requested', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => __inbox.calls.filter(call => call.operation === 'locus-continue').length), 1);
  await closeToasts();

  await row('failed').focus(); await page.keyboard.press('End');
  assert.equal(await row('retention').evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Inbox fixture unverified', exact: true }).waitFor();
  const search = page.getByRole('textbox', { name: /^Search captures/ });
  await search.fill('failed'); await page.keyboard.press('Control+b');
  assert.equal(await search.inputValue(), 'failed');
  assert.equal(await search.evaluate(input => input === document.activeElement), true);
  await inspect('failed');
  await search.focus();
  await page.evaluate(() => { __inbox.rows.find(row => row.id === 'inbox-failed').locus = { state: 'complete', message: 'Confirmed after check' }; });
  await retry();
  await page.getByRole('button', { name: 'Show in Saved', exact: true }).waitFor();
  assert.equal(await search.inputValue(), 'failed');
  await page.getByText('Saved to Locus', { exact: true }).first().waitFor();
  await closeToasts(); await retry();
  assert.equal(await page.locator('[data-slot="toast"]').count(), 0, 'Polling does not repeat transition notices');
  await page.screenshot({ path: path.join(work, 'inbox-transition-desktop.png') });
  await page.getByRole('button', { name: 'Show in Saved', exact: true }).click();
  await row('saved').waitFor();
  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Inbox fixture failed', exact: true }).count(), 0, 'Explicit view change clears unrelated selection');
  await page.evaluate(() => { location.hash = 'inbox-saved'; });
  await row('saved').waitFor();
  await page.getByRole('heading', { name: 'Inbox fixture saved', exact: true }).waitFor();

  await page.evaluate(() => { __inbox.readFailure = true; }); await retry();
  await page.getByText('Could not load capture', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show in Inbox', exact: true }).click();
  await row('saved').waitFor();
  assert.match(await row('saved').innerText(), /Read problem · retry loading/);
  await page.evaluate(() => { __inbox.readFailure = false; }); await retry();
  await page.getByText('Could not load capture', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'All captures', exact: true }).click();
  await inspect('legacy');
  await page.getByRole('button', { name: 'Clear capture', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => __inbox.calls.filter(call => call.operation === 'clear').length), 0);
  await page.evaluate(() => { __inbox.clearFailure = true; });
  await page.getByRole('button', { name: 'Clear capture', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear capture', exact: true }).click();
  await page.getByRole('alertdialog').getByText('Could not clear capture', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => { __inbox.clearFailure = false; __inbox.hold = true; });
  await page.getByRole('button', { name: 'Clear capture', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear capture', exact: true }).click();
  await page.evaluate(() => { location.hash = 'inbox-partial'; __inbox.hold = false; __inbox.held.splice(0).forEach(release => release()); });
  await page.getByRole('heading', { name: 'Inbox fixture partial', exact: true }).waitFor();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(await row('legacy').count(), 0);
  await closeToasts();
  await page.screenshot({ path: path.join(work, 'inbox-partial-desktop.png') });
  // The preceding hash change was programmatic. Establish the explicit row
  // activation whose focus is expected to return after narrow inspection.
  await row('partial').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(work, 'inbox-partial-mobile.png') });
  await page.getByRole('button', { name: 'Back to captures', exact: true }).click();
  await search.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open capture Inbox fixture partial');
  assert.equal(await row('partial').evaluate(button => button === document.activeElement), true, 'Narrow Back returns focus to the row explicitly opened by the user');
  await row('partial').press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Back to captures');
  assert.equal(await page.getByRole('button', { name: 'Back to captures', exact: true }).evaluate(button => button === document.activeElement), true, 'Explicit narrow selection focuses Back');
  await page.getByRole('button', { name: 'Back to captures', exact: true }).click();
  await page.screenshot({ path: path.join(work, 'inbox-list-mobile.png') });
  await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
  await settingsButton.click();
  await dialog.getByRole('tab', { name: 'General', exact: true }).click();
  await dialog.getByRole('button', { name: 'Twitter enabled', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await settingsButton.evaluate(button => button === document.activeElement), true, 'Mobile Settings returns focus to its sidebar entry');
  await page.locator('[data-slot="dialog-content"]').waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Sidebar', exact: true }).waitFor({ state: 'hidden' });
  await search.waitFor();
  await page.close();
  return 'Inbox: derived views, no history flood or blob reads, original-save action, settings dialog, diagnostics copy, transition dedupe, read attention, keyboard/mobile and clear races';
}
