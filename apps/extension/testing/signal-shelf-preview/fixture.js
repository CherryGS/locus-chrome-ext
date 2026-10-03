// Disposable, in-memory host responses only; never imported by production entrypoints.
globalThis.chrome = {
  permissions: { onAdded: {addListener(){},removeListener(){}}, onRemoved: {addListener(){},removeListener(){}} },
  runtime: {}
};
    const kinds = ['setup', 'failed', 'unverified', 'legacy', 'saved', 'partial', 'active', 'retention'];
    const rows = kinds.map((kind, index) => ({ id: `inbox-${kind}`, label: `Inbox fixture ${kind}`, sourceUrl: `https://x.com/fixture/status/${1000 + index}`, createdAt: new Date(Date.now() - index * 60_000).toISOString(), revision: 1, acquisition: kind === 'active' ? 'pending' : kind === 'partial' ? 'partial' : 'complete', retention: { state: kind === 'retention' ? 'failed' : 'retained', revision: 1 }, locus: kind === 'legacy' ? undefined : { state: kind === 'active' ? 'uploading' : kind === 'saved' || kind === 'retention' ? 'complete' : kind === 'setup' ? 'configuration-required' : kind === 'unverified' ? 'unverified' : 'failed', message: kind === 'unverified' ? 'Response lost. Inspect the original request before continuing.' : kind === 'failed' ? 'Connection unavailable. Open connection settings.\nstage: upload\nrequest-id: fixture-original' : 'Synthetic delivery evidence' } }));
    // Opt-in geometry fixture; all bytes are generated in memory, with no source request.
    const media = {};
    const typography = {
      label: 'Collecting web references: 网页内容采集与整理 — a longer title with context and a final detail',
      recordId: 'post_0a33a68e5d3041138ab470851544cc09_1000000000000000000',
      assetId: 'photo_0a33a68e5d3041138ab470851544cc09_original_2048x1365',
      message: 'Could not read the retained original image. Request 0a33a68e-5d30-4113-8ab4-70851544cc09 returned HTTP 503; inspect available content and check the complete diagnostic before retrying.',
    };
    // The Chinese title clause means "capturing and organizing web content";
    // mixed-language captured content is the purpose of this opt-in fixture.
    if (new URLSearchParams(location.search).has('typography')) {
      rows.push({id: 'inbox-typography', label: typography.label, sourceUrl: `https://x.com/fixture/status/3000?trace=${'0123456789abcdef'.repeat(12)}`, createdAt: new Date().toISOString(), revision: 1, acquisition: 'partial', retention: {state: 'retained', revision: 1}});
    }
    if (new URLSearchParams(location.search).has('media')) {
      for (const [id, background, foreground] of [['dark-image', '#132b3e', '#d9e785'], ['light-image', '#eff3f7', '#173044']]) {
        media[id] = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360" viewBox="0 0 960 360"><rect width="960" height="360" fill="${background}"/><circle cx="160" cy="180" r="60" fill="${foreground}"/><path d="M280 150h520m-520 60h360" stroke="${foreground}" stroke-width="8"/></svg>`], {type: 'image/svg+xml'});
      }
      rows.push({id: 'inbox-media', label: 'Synthetic dark and light media', sourceUrl: 'https://x.com/fixture/status/2000', createdAt: new Date().toISOString(), revision: 1, acquisition: 'complete', retention: {state: 'retained', revision: 1}});
    }
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
            else value = { snapshot: row ? { result: { ...row, site: 'twitter', records: [{ id: 'post', assetIds: [], acquisition: { state: 'acquired' }, payload: { schema:'twitter-post/1', sourceId:row.id, fullText:'A little room to slow down.\n\nThis is synthetic retained content rendered by the production UI. Capture, local retention and Locus saving remain independent facts.', author:{displayName:'Avery Park',username:'fieldnotes'} } }], assets: row.acquisition === 'partial' ? [{ id: 'missing', recordId: 'post', acquisition: { state: 'unavailable', reason: 'HTTP 503\nstage: source-read' } }] : [] }, blobs: {}, readErrors: fixture.blobFailure ? { missing: 'Synthetic stored file unavailable' } : {} } : null, deliveries: fixture.deliveries, locus: row?.locus ? { ...row.locus, resultId: row.id, revision: 1, uploads: [] } : undefined };
          }
          if (request.operation === 'clear') {
            if (fixture.clearFailure) error = 'Synthetic clear rejected';
            else fixture.rows = fixture.rows.filter(item => item.id !== request.id);
          }
          if (request.operation === 'read' && row?.id === 'inbox-media' && value?.snapshot) {
            value.snapshot.result.records[0].assetIds = Object.keys(media);
            value.snapshot.result.assets = Object.entries(media).map(([id, blob]) => ({id, recordId: 'post', mime: blob.type, size: blob.size, acquisition: {state: 'acquired'}}));
            value.snapshot.blobs = media;
          }
          if (request.operation === 'read' && row?.id === 'inbox-typography' && value?.snapshot) {
            const record = value.snapshot.result.records[0];
            record.id = typography.recordId;
            record.assetIds = [typography.assetId];
            record.payload.author.displayName = 'Field notes / 网页内容';
            record.payload.fullText = 'A collected reference with English and 中文内容. This paragraph remains selectable, and its original line breaks stay intact.\n\nThe source URL and file identifiers are deliberately long so the production view can be checked at narrow widths.';
            value.snapshot.result.assets = [{id: typography.assetId, recordId: record.id, acquisition: {state: 'unavailable', reason: `${typography.message}\nstage: source-read\nrequest-id: 0a33a68e-5d30-4113-8ab4-70851544cc09`}}];
          }
          this.onmessage?.(new MessageEvent('message', { data: structuredClone({ requestId, ok: !error, error, value }) }));
        };
        if (fixture.hold && request.operation !== 'list') fixture.held.push(answer);
        else setTimeout(answer, 0);
      }
    };
