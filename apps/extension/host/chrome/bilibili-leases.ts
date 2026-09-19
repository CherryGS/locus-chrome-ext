import { bilibiliResource } from '@locus/bilibili/urls';
const KEY = 'locus-bilibili-cdn-leases-v1', ALARM = 'locus-bilibili-cdn-cleanup';
interface Lease { token: string; jobId: string; ruleId: number; url: string; expiresAt: number }
/** Session rules are owned independently; worker wakes reconcile rather than reset live fetches. */
export class BilibiliLeases {
  private serial = Promise.resolve();
  private leases = new Map<string, Lease>();
  private ready: Promise<void>;
  constructor(private access: () => Promise<unknown>, private live: (token: string, jobId: string) => Promise<boolean>) {
    this.ready = chrome.storage.session.get(KEY).then(async value => { if (Array.isArray(value[KEY])) for (const lease of value[KEY]) if (typeof lease.token === 'string' && Number.isSafeInteger(lease.ruleId)) this.leases.set(lease.token, lease); if (this.leases.size) await this.ensureAlarm(); });
    chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void this.reconcile().catch(() => {}); });
    void this.reconcile().catch(() => {});
  }
  private run<T>(operation: () => Promise<T>) { const next = this.serial.then(async () => { await this.ready; return operation(); }); this.serial = next.then(() => {}, () => {}); return next; }
  private async ensureAlarm() { if (!await chrome.alarms.get(ALARM)) await chrome.alarms.create(ALARM, { periodInMinutes: 1 }); }
  private async save() { await chrome.storage.session.set({ [KEY]: Array.from(this.leases.values()) }); if (this.leases.size) await this.ensureAlarm(); else await chrome.alarms.clear(ALARM); }
  private async remove(token: string) { const lease = this.leases.get(token); if (!lease) return; await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [lease.ruleId] }); this.leases.delete(token); await this.save(); }
  acquire(token: string, jobId: string, input: string, role: 'cover' | 'track', cid: string) {
    return this.run(async () => {
      await this.access(); if (this.leases.has(token) || this.leases.size >= 8) throw new Error('Bilibili CDN lease capacity unavailable');
      const url = bilibiliResource(input, role, cid), existing = await chrome.declarativeNetRequest.getSessionRules();
      let ruleId: number; do { ruleId = 100000 + crypto.getRandomValues(new Uint32Array(1))[0]! % 1900000000; } while (existing.some(rule => rule.id === ruleId));
      const lease = { token, jobId, url, ruleId, expiresAt: Date.now() + 180_000 }; this.leases.set(token, lease); await this.save();
      try {
        await this.access();
        await chrome.declarativeNetRequest.updateSessionRules({ addRules: [{ id: ruleId, priority: 1, action: { type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType, requestHeaders: [{ header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://www.bilibili.com/' }] }, condition: { regexFilter: '^' + url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', isUrlFilterCaseSensitive: true, requestDomains: [new URL(url).hostname], initiatorDomains: [chrome.runtime.id], requestMethods: ['get' as chrome.declarativeNetRequest.RequestMethod], resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType] } }] });
        await this.access(); return true;
      } catch { await this.remove(token); throw new Error('Bilibili CDN request authorization failed'); }
    });
  }
  release(token: string) { return this.run(() => this.remove(token)); }
  revoke() { return this.run(async () => { for (const token of Array.from(this.leases.keys())) await this.remove(token); }); }
  reconcile() { return this.run(async () => { for (const lease of Array.from(this.leases.values())) {
    try { await this.access(); } catch { await this.remove(lease.token); continue; }
    let timer:ReturnType<typeof setTimeout>|undefined;
    try { const alive=await Promise.race([this.live(lease.token,lease.jobId),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Lease owner query unavailable')),5000);})]);if (!alive) await this.remove(lease.token); else if (lease.expiresAt <= Date.now()) { lease.expiresAt = Date.now() + 180_000; await this.save(); } }
    catch { if (lease.expiresAt <= Date.now()) await this.remove(lease.token); }
    finally {clearTimeout(timer);}
  } }); }
}
