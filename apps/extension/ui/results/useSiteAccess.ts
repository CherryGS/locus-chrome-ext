import { useCallback, useEffect, useState } from "react";
import { coordinator } from "@/host/chrome/protocol";
import { siteOrigins, type CaptureSite } from "@/host/chrome/sites";

export type SiteAccess = Record<CaptureSite, boolean | undefined>;

/** Permission changes affect both source controls without coupling to result reads. */
export function useSiteAccess() {
  const [access, setAccess] = useState<SiteAccess>({
    twitter: undefined,
    bilibili: undefined,
  });

  useEffect(() => {
    let alive = true;
    let generation = 0;
    async function refresh() {
      const current = ++generation;
      const values = await Promise.all(
        (Object.keys(siteOrigins) as CaptureSite[]).map(
          async (site) =>
            [
              site,
              await chrome.permissions
                .contains({ origins: siteOrigins[site] })
                .catch(() => undefined),
            ] as const,
        ),
      );
      if (alive && current === generation) {
        const next = Object.fromEntries(values) as SiteAccess;
        setAccess((previous) =>
          previous.twitter === next.twitter &&
          previous.bilibili === next.bilibili
            ? previous
            : next,
        );
      }
    }
    const changed = () => {
      void refresh();
    };
    chrome.permissions.onAdded.addListener(changed);
    chrome.permissions.onRemoved.addListener(changed);
    const timer = setInterval(changed, 4000);
    changed();
    return () => {
      alive = false;
      clearInterval(timer);
      chrome.permissions.onAdded.removeListener(changed);
      chrome.permissions.onRemoved.removeListener(changed);
    };
  }, []);

  const enable = useCallback(async (site: CaptureSite) => {
    const granted = await chrome.permissions.request({
      origins: siteOrigins[site],
    });
    setAccess((previous) => ({ ...previous, [site]: granted }));
    if (granted) await coordinator("activate");
    return granted;
  }, []);

  return { access, enable };
}
