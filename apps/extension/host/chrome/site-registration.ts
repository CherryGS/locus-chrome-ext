import { BILIBILI_PAGE_ORIGINS } from "@locus/bilibili/urls";
import { documentSite, siteOrigins, type CaptureSite } from "./sites";

interface RegistrationHost {
  hasOwner: () => Promise<boolean>;
  sendOwner: (
    operation: string,
    values: Record<string, unknown>,
  ) => Promise<unknown>;
}

const pageMatches: Record<CaptureSite, string[]> = {
  twitter: ["https://x.com/*", "https://twitter.com/*"],
  bilibili: BILIBILI_PAGE_ORIGINS,
};

function siteScripts(site: CaptureSite): chrome.scripting.RegisteredContentScript[] {
  const probePrefix = site === "twitter" ? "locus-probe" : "locus-bilibili";
  const probeMatches = site === "twitter" ? pageMatches.twitter : ["https://www.bilibili.com/*"];
  return [
    {
      id: `locus-${site}`,
      matches: pageMatches[site],
      js: [`content-scripts/${site}.js`],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
    ...([
      ["main", "MAIN"],
      ["bridge", "ISOLATED"],
    ] as const).map(([name, world]) => ({
      id: `${probePrefix}-${name}`,
      matches: probeMatches,
      js: [`content-scripts/${site}-probe-${name}.js`],
      runAt: "document_start" as const,
      world,
      persistAcrossSessions: true,
    })),
  ];
}

/** Serialize registration changes while leaving permission-withdrawal interruption independent. */
export function createSiteRegistration({
  hasOwner,
  sendOwner,
}: RegistrationHost) {
  const sites: CaptureSite[] = ["twitter", "bilibili"];
  let registrations = Promise.resolve();
  let scriptChanges = Promise.resolve();
  function synchronizeScripts(enabled: boolean, site: CaptureSite = "twitter") {
    const next = scriptChanges.then(async () => {
      const desired = siteScripts(site);
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
      url: pageMatches[site],
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
