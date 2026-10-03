import { createSourceStatusLookup } from "@/ui/capture/source-status-lookup";
import { createRoot } from "react-dom/client";
import { CaptureQueuePanel } from "@/ui/capture/CaptureQueuePanel";
import { CaptureStore } from "@/ui/capture/capture-store";
import {
  createCaptureAction,
  findActionRow,
  matchActionPresentation,
  setActionStatus,
  type TwitterActionRow,
} from "./action-row";
import { coordinator } from "@/host/chrome/protocol";
import { postUrl } from "@locus/twitter/urls";
import { captureStates } from "@/ui/shared/capture-status";
import styles from "@/assets/tailwind.css?inline";

interface MountedAction {
  article: HTMLElement;
  url: string;
  activationSource?: string;
  action: ReturnType<typeof createCaptureAction>;
}

export function mountTwitterControls() {
  const scope = globalThis as typeof globalThis & {
    __locusCaptureMounted?: boolean;
  };
  if (scope.__locusCaptureMounted) return;
  scope.__locusCaptureMounted = true;
  const store = new CaptureStore();
  const mounts = new Set<MountedAction>();
  const host = document.createElement("div");
  host.dataset.locusCapture = "true";
  host.id = `locus-queue-${crypto.randomUUID()}`;
  // Keep the modal portal in the styled shadow surface, independent of the
  // fixed launcher position. Only visible controls and the open backdrop hit-test.
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles.replaceAll(":root", ":host");
  shadow.append(style);
  const container = document.createElement("div");
  container.className = "dark";
  container.style.pointerEvents = "auto";
  container.style.colorScheme = "dark";
  shadow.append(container);
  document.documentElement.append(host);
  const root = createRoot(container);
  root.render(
    <CaptureQueuePanel
      store={store}
      portalContainer={container}
    />,
  );
  let enabled = true;
  let authorized = false;
  let accessInFlight = false;
  let retryDelay = 500;
  let accessTimer: ReturnType<typeof setTimeout> | undefined;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  const lookup = createSourceStatusLookup({
    urls: () => [...mounts].map((mounted) => mounted.url),
    enabled: () => enabled && authorized,
    receive: (urls, values, error) => store.sourceResults(urls, values, error),
  });
  host.hidden = true;
  async function checkAccess() {
    if (!enabled || accessInFlight) return;
    accessInFlight = true;
    clearTimeout(accessTimer);
    try {
      await coordinator("access");
      if (!enabled) return;
      authorized = true;
      retryDelay = 500;
      host.hidden = false;
      scan();
      store.start();
      lookup.schedule();
    } catch {
      if (!enabled) return;
      // A worker/message startup failure is not a revocation. Suspend controls
      // until authorization succeeds again; only an explicit revoke tears down.
      authorized = false;
      lookup.cancel();
      host.hidden = true;
      store.pause();
      for (const mounted of mounts) mounted.action.slot.remove();
      mounts.clear();
      accessTimer = setTimeout(() => void checkAccess(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    } finally {
      accessInFlight = false;
    }
  }
  function feedback(mounted: MountedAction) {
    const { state, message, progress } = store.sourceStatus(
      postUrl(mounted.url).id,
    );
    const progressMessage =
      (state === "importing" || state === "saving") && progress
        ? progress.percent === null
          ? `File size unknown; ${progress.completedFiles} of ${progress.totalFiles} files processed.`
          : `${progress.percent}% of selected files acquired. Locus saving follows complete acquisition.`
        : "";
    const label = `Locus capture. ${captureStates[state].label}. ${progressMessage} ${message} Click to capture this post and all direct media, or view an active task.`;
    mounted.action.button.setAttribute("aria-label", label);
    mounted.action.button.title = label;
    mounted.action.button.setAttribute(
      "aria-expanded",
      String(
        store.snapshot().expanded,
      ),
    );
    if (mounted.action.status.textContent !== message)
      mounted.action.status.textContent = message;
    setActionStatus(
      mounted.action,
      state,
      container,
      progress?.percent ?? null,
    );
  }
  const unsubscribe = store.subscribe(() => {
    for (const mounted of mounts) feedback(mounted);
  });
  function attach(mounted: MountedAction, source: TwitterActionRow) {
    matchActionPresentation(mounted.action, source);
    if (
      mounted.action.slot.nextElementSibling !== source.anchorSlot ||
      mounted.action.slot.parentElement !== source.anchorSlot.parentElement
    )
      source.anchorSlot.before(mounted.action.slot);
    feedback(mounted);
  }
  function create(source: TwitterActionRow) {
    const action = createCaptureAction();
    const mounted: MountedAction = {
      article: source.article,
      url: source.url,
      action,
    };
    action.button.setAttribute("aria-controls", host.id);
    action.button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.isTrusted || !authorized) return;
      // X may recycle a post between observer scans. A direct start must use
      // the source actually bound to the visible action at activation time.
      const current =
        mounted.article.isConnected && findActionRow(mounted.article);
      if (!current || !current.row.contains(action.slot)) {
        scan();
        return;
      }
      const id = postUrl(current.url).id;
      if (event.detail > 1 && mounted.activationSource === id) return;
      mounted.activationSource = id;
      const changed = mounted.url !== current.url;
      mounted.url = current.url;
      attach(mounted, current);
      if (changed) lookup.schedule();
      void store.quickCapture(current.url);
    });
    action.button.addEventListener("keydown", (event) => {
      if (event.repeat && (event.key === "Enter" || event.key === " "))
        event.preventDefault();
    });
    for (const type of ["click", "dblclick", "pointerdown", "keydown", "keyup"])
      action.slot.addEventListener(type, (event) => event.stopPropagation());
    mounts.add(mounted);
    attach(mounted, source);
    lookup.schedule();
  }
  function scan() {
    if (!enabled || !authorized) return;
    if (!host.isConnected) document.documentElement.append(host);
    const rows = [...document.querySelectorAll<HTMLElement>("article")]
      .map(findActionRow)
      .filter((row): row is TwitterActionRow => !!row);
    for (const mounted of mounts) {
      const source = rows.find(
        (row) => row.article === mounted.article && row.url === mounted.url,
      );
      if (source) attach(mounted, source);
      else {
        mounted.action.slot.remove();
        mounts.delete(mounted);
      }
    }
    for (const source of rows)
      if (![...mounts].some((mounted) => mounted.article === source.article))
        create(source);
    store.retainSources(rows.map((row) => postUrl(row.url).id));
  }
  // Isolate extension controls from X's shortcuts. The explicitly opened dialog
  // owns modal focus and scrolling; the launcher and selection draft do not.
  for (const type of ["click", "dblclick", "pointerdown", "keydown", "keyup"])
    host.addEventListener(type, (event) => event.stopPropagation());
  function revoke(message: { target?: string; op?: string }) {
    if (message?.target === "page" && message.op === "revoke") stop();
  }
  function stop() {
    if (!enabled) return;
    enabled = false;
    observer.disconnect();
    clearInterval(timer);
    lookup.stop();
    clearTimeout(accessTimer);
    clearTimeout(scanTimer);
    unsubscribe();
    store.stop();
    root.unmount();
    host.remove();
    chrome.runtime.onMessage.removeListener(revoke);
    for (const mounted of mounts) mounted.action.slot.remove();
    mounts.clear();
    scope.__locusCaptureMounted = false;
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    scanTimer = setTimeout(() => {
      scheduled = false;
      scan();
    }, 100);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "href",
      "class",
      "style",
      "data-icon",
      "data-testid",
      "role",
      "aria-haspopup",
      "d",
    ],
  });
  const timer = setInterval(() => {
    scan();
    void checkAccess();
    void lookup.refresh();
  }, 15_000);
  chrome.runtime.onMessage.addListener(revoke);
  void checkAccess();
}
