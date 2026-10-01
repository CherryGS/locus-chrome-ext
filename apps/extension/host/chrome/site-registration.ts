import { BILIBILI_PAGE_ORIGINS } from "@locus/bilibili/urls";
import { documentSite, siteOrigins, type CaptureSite } from "./sites";

interface RegistrationHost {
  hasOwner: () => Promise<boolean>;
  sendOwner: (
    operation: string,
    values: Record<string, unknown>,
  ) => Promise<unknown>;
}

/** Serialize registration changes while leaving permission-withdrawal interruption independent. */
export function createSiteRegistration({
  hasOwner,
  sendOwner,
}: RegistrationHost) {
  const sites: CaptureSite[] = ["twitter", "bilibili"];
  let registrations = Promise.resolve();
  let scriptChanges = Promise.resolve();
  const probeScripts: chrome.scripting.RegisteredContentScript[] = [
    {
      id: "locus-probe-main",
      matches: ["https://x.com/*", "https://twitter.com/*"],
      js: ["content-scripts/twitter-probe-main.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    },
    {
      id: "locus-probe-bridge",
      matches: ["https://x.com/*", "https://twitter.com/*"],
      js: ["content-scripts/twitter-probe-bridge.js"],
      runAt: "document_start",
      world: "ISOLATED",
      persistAcrossSessions: true,
    },
  ];
  function synchronizeScripts(enabled: boolean, site: CaptureSite = "twitter") {
    const next = scriptChanges.then(async () => {
      const matches =
        site === "twitter"
          ? ["https://x.com/*", "https://twitter.com/*"]
          : BILIBILI_PAGE_ORIGINS;
      const sourceMatches = ["https://www.bilibili.com/*"];
      const desired = [
        {
          id: "locus-" + site,
          matches,
          js: ["content-scripts/" + site + ".js"],
          runAt: "document_idle",
          persistAcrossSessions: true,
        } as chrome.scripting.RegisteredContentScript,
        ...(site === "twitter"
          ? probeScripts
          : ([
              {
                id: "locus-bilibili-main",
                matches: sourceMatches,
                js: ["content-scripts/bilibili-probe-main.js"],
                runAt: "document_start",
                world: "MAIN",
                persistAcrossSessions: true,
              },
              {
                id: "locus-bilibili-bridge",
                matches: sourceMatches,
                js: ["content-scripts/bilibili-probe-bridge.js"],
                runAt: "document_start",
                world: "ISOLATED",
                persistAcrossSessions: true,
              },
            ] as chrome.scripting.RegisteredContentScript[])),
      ];
      const existing = await chrome.scripting.getRegisteredContentScripts({
        ids: desired.map((script) => script.id),
      });
      if (enabled) {
        const missing = desired.filter(
          (script) => !existing.some((value) => value.id === script.id),
        );
        if (missing.length)
          await chrome.scripting.registerContentScripts(missing);
        // Persisted registrations must gain new page matches after an upgrade.
        const changed = desired.filter((script) => {
          const previous = existing.find((value) => value.id === script.id);
          return (
            previous &&
            JSON.stringify(previous.matches) !== JSON.stringify(script.matches)
          );
        });
        if (changed.length)
          await chrome.scripting.updateContentScripts(changed);
      } else if (existing.length)
        await chrome.scripting.unregisterContentScripts({
          ids: existing.map((script) => script.id),
        });
    });
    scriptChanges = next.catch(() => {});
    return next;
  }
  async function activateSite(site: CaptureSite) {
    const enabled = await chrome.permissions.contains({
      origins: siteOrigins[site],
    });
    await synchronizeScripts(enabled, site);
    const tabs = await chrome.tabs.query({
      url:
        site === "twitter"
          ? ["https://x.com/*", "https://twitter.com/*"]
          : BILIBILI_PAGE_ORIGINS,
    });
    for (const tab of tabs)
      if (
        tab.id !== undefined &&
        (site === "bilibili" || documentSite(tab.url) === site)
      ) {
        if (enabled)
          await chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ["content-scripts/" + site + ".js"],
            })
            .catch(() => {});
        else
          await chrome.tabs
            .sendMessage(tab.id, { target: "page", op: "revoke" })
            .catch(() => {});
      }
    if (!enabled && (await hasOwner())) await sendOwner("revoke", { site });
    return enabled;
  }
  async function activate() {
    for (const site of sites) await activateSite(site);
  }
  function activation() {
    const next = registrations.then(activate);
    registrations = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  return { synchronize: synchronizeScripts, activate: activation };
}
