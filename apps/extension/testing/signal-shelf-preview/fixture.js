// Disposable, in-memory host responses only; never imported by production entrypoints.
globalThis.chrome = {
  permissions: { onAdded: {addListener(){},removeListener(){}}, onRemoved: {addListener(){},removeListener(){}} },
  runtime: {}
};
    const kinds = ['setup', 'failed', 'unverified', 'legacy', 'saved', 'partial', 'active', 'retention'];
    const rows = kinds.map((kind, index) => ({ id: `inbox-${kind}`, label: `Inbox fixture ${kind}`, sourceUrl: `https://x.com/fixture/status/${1000 + index}`, createdAt: new Date(Date.now() - index * 60_000).toISOString(), revision: 1, acquisition: kind === 'active' ? 'pending' : kind === 'partial' ? 'partial' : 'complete', retention: { state: kind === 'retention' ? 'failed' : 'retained', revision: 1 }, locus: kind === 'legacy' ? undefined : { state: kind === 'active' ? 'uploading' : kind === 'saved' || kind === 'retention' ? 'complete' : kind === 'setup' ? 'configuration-required' : kind === 'unverified' ? 'unverified' : 'failed', message: kind === 'unverified' ? 'Response lost. Inspect the original request before continuing.' : kind === 'failed' ? 'Connection unavailable. Open connection settings.\nstage: upload\nrequest-id: fixture-original' : 'Synthetic delivery evidence' } }));
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
          this.onmessage?.(new MessageEvent('message', { data: structuredClone({ requestId, ok: !error, error, value }) }));
        };
        if (fixture.hold && request.operation !== 'list') fixture.held.push(answer);
        else setTimeout(answer, 0);
      }
    };
