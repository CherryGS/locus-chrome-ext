// Disposable, in-memory host responses only; never imported by production entrypoints.
globalThis.chrome = {
  permissions: { onAdded: {addListener(){},removeListener(){}}, onRemoved: {addListener(){},removeListener(){}} },
  runtime: {}
};
    const kinds = ['setup', 'failed', 'unverified', 'legacy', 'saved', 'partial', 'active', 'retention'];
    const rows = kinds.map((kind, index) => ({ id: `inbox-${kind}`, label: `Inbox fixture ${kind}`, sourceUrl: `https://x.com/fixture/status/${1000 + index}`, createdAt: new Date(Date.now() - index * 60_000).toISOString(), revision: 1, acquisition: kind === 'active' ? 'pending' : kind === 'partial' ? 'partial' : 'complete', retention: { state: kind === 'retention' ? 'failed' : 'retained', revision: 1 }, locus: kind === 'legacy' ? undefined : { state: kind === 'active' ? 'uploading' : kind === 'saved' || kind === 'retention' ? 'complete' : kind === 'setup' ? 'configuration-required' : kind === 'unverified' ? 'unverified' : 'failed', message: kind === 'unverified' ? 'Response lost. Inspect the original request before continuing.' : kind === 'failed' ? 'Connection unavailable. Open connection settings.\nstage: upload\nrequest-id: fixture-original' : 'Synthetic delivery evidence' } }));
    // Opt-in geometry fixture; all bytes are generated in memory, with no source request.
    const media = {};
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
          this.onmessage?.(new MessageEvent('message', { data: structuredClone({ requestId, ok: !error, error, value }) }));
        };
        if (fixture.hold && request.operation !== 'list') fixture.held.push(answer);
        else setTimeout(answer, 0);
      }
    };
