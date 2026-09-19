import { assignment, projectBilibili, BILIBILI_SOURCE_LIMIT, object } from '@locus/bilibili/projection';
import { BILI_CHANNEL, biliIdentity, sameBiliDocument } from './bilibili-protocol';

export function observeBilibiliSource() {
  const identity = biliIdentity(location.href); if (!identity || window !== window.top) return;
  let initial: unknown, play: unknown, stopped = false, authorized = false, started = false, scannedBytes = 0, pendingError = '';
  const seen = new WeakSet<HTMLScriptElement>(); const controller = new AbortController();
  function post(value: object) { window.postMessage({ channel: BILI_CHANNEL, token: identity!.token, ...value }, location.origin); }
  function stop() { if (stopped) return; stopped = true; observer.disconnect(); clearTimeout(timer); controller.abort(); window.removeEventListener('message', message); window.removeEventListener('pagehide', stop); }
  function fail(reason: string) { if (stopped) return; if (!authorized) { pendingError = reason; observer.disconnect(); return; } post({ op: 'source', error: reason }); stop(); }
  async function complete() {
    if (stopped || pendingError || !authorized || started || initial === undefined || play === undefined) return; started = true;
    try {
      if (!sameBiliDocument(location.href, identity!.url, identity!.token)) throw new Error('Bilibili selection changed during inspection');
      // Only this fixed read-only endpoint may use the browser's existing session.
      const response = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include', redirect: 'error', signal: controller.signal });
      if (response.status !== 200 || !response.body) throw new Error('Bilibili session could not be verified');
      const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let length = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 64 * 1024) throw new Error('Bilibili session response exceeds limit'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const login = object(JSON.parse(await new Blob(chunks).text()));
      if (login.code !== 0 || object(login.data).isLogin !== true) throw new Error('Sign in to Bilibili before capturing this part');
      if (!sameBiliDocument(location.href, identity!.url, identity!.token) || stopped) throw new Error('Bilibili source document changed');
      const data = projectBilibili(initial, play, identity!.url, true);
      if (new TextEncoder().encode(JSON.stringify(data)).length > BILIBILI_SOURCE_LIMIT) throw new Error('Bilibili source exceeds message limit');
      post({ op: 'source', data }); stop();
    } catch (error) { fail(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[source URL]') : 'Bilibili source unavailable'); }
  }
  function script(node: HTMLScriptElement) {
    if (stopped || pendingError || seen.has(node) || node.src) return; const content = node.textContent ?? ''; if (!content.includes('__INITIAL_STATE__') && !content.includes('__playinfo__')) return; seen.add(node);
    try {
      scannedBytes += content.length; if (scannedBytes > 8 * 1024 * 1024) throw new Error('Bilibili source collection limit');
      const a = assignment(content, '__INITIAL_STATE__'), b = assignment(content, '__playinfo__');
      if (a !== undefined) { if (initial !== undefined && JSON.stringify(initial) !== JSON.stringify(a)) throw new Error('Conflicting Bilibili initial sources'); initial = a; }
      if (b !== undefined) { if (play !== undefined && JSON.stringify(play) !== JSON.stringify(b)) throw new Error('Conflicting Bilibili media sources'); play = b; }
      void complete();
    } catch (error) { fail(error instanceof Error ? error.message : 'Invalid Bilibili initial source'); }
  }
  function scan(node: Node) { if (node instanceof HTMLScriptElement) script(node); if (node instanceof Element || node instanceof Document) for (const item of node.querySelectorAll('script')) script(item); }
  const observer = new MutationObserver(records => { for (const record of records) { for (const node of record.addedNodes) scan(node); for (const node of record.removedNodes) scan(node); if (record.target instanceof HTMLScriptElement) script(record.target); } });
  function message(event: MessageEvent) { if (event.source !== window || event.origin !== location.origin || event.data?.channel !== BILI_CHANNEL || event.data?.token !== identity!.token) return; if (event.data.op === 'stop') stop(); if (event.data.op === 'authorize' && !stopped) { authorized = true; if (pendingError) { fail(pendingError); return; } scan(document); void complete(); } }
  const timer = setTimeout(() => { if (authorized) fail('Bilibili signed-in initial source unavailable before timeout'); else stop(); }, 25_000);
  observer.observe(document, { subtree: true, childList: true, characterData: true }); window.addEventListener('message', message); window.addEventListener('pagehide', stop); scan(document); post({ op: 'observer-ready' });
}
