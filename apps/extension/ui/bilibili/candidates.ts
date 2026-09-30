import { bilibiliPage, partUrl, watchlaterPartUrl } from '@locus/bilibili/urls';

const toolbarOwners = '#arc_toolbar_report .video-complaint,#playlistToolbar .video-complaint';

export interface BilibiliCandidate {
  owner: HTMLElement;
  target: HTMLElement;
  kind: 'toolbar' | 'cover';
  source: ReturnType<typeof partUrl>;
  title: string;
  reference?: HTMLElement;
  before?: HTMLElement;
}

/** The async native app must own/hydrate the SSR toolbar before we add a child. */
export function bilibiliPageReady() {
  const page = bilibiliPage(location.href);
  if (page !== 'video' && page !== 'watchlater') return true;
  const app = document.querySelector('#app');
  return !!app && !app.hasAttribute('data-server-rendered') && !!app.querySelector('#bilibili-player .bpx-player-container');
}

export function readBilibiliCandidate(owner: HTMLElement): BilibiliCandidate | undefined {
  if (!owner.isConnected) return;
  const page = bilibiliPage(location.href);
  if ((page === 'video' || page === 'watchlater') && owner.matches(toolbarOwners)) {
    if (!bilibiliPageReady()) return;
    if (!owner.parentElement) return;
    const source = page === 'watchlater' ? watchlaterPartUrl(location.href) : partUrl(location.href);
    if (page === 'watchlater') {
      // Vue updates the playlist URL and heading separately during navigation.
      // Hide the action until both identify the same ordinary submission.
      const heading = document.querySelector<HTMLAnchorElement>('h1 a[href]');
      try { if (!heading || partUrl(heading.href).bvid !== source.bvid) return; } catch { return; }
    }
    return { owner, target: owner.parentElement, before: owner, kind: 'toolbar', source, title: document.querySelector('h1')?.textContent?.trim() ?? '', reference: owner };
  }
  if (!page || !owner.matches('a[href]') || !owner.querySelector('img,picture,video,canvas') || owner.closest('[data-locus-bilibili],#bilibili-player')) return;
  const link = owner as HTMLAnchorElement;
  if (!link.parentElement || link.parentElement.closest('a,button,[role="button"]')) return;
  if (link.closest('.bili-video-card')?.querySelector('.bili-card-checkbox--visible')) return;
  try {
    const source = /^\/list\/watchlater\/?$/.test(new URL(link.href).pathname) ? watchlaterPartUrl(link.href) : partUrl(link.href);
    const title = link.title || link.querySelector('img')?.alt || link.getAttribute('aria-label') || source.bvid;
    return { owner, target: link.parentElement, kind: 'cover', source, title };
  } catch { return; }
}

export function findBilibiliCandidates() {
  if (!bilibiliPage(location.href) || !bilibiliPageReady()) return [];
  const owners = document.querySelectorAll<HTMLElement>(`${toolbarOwners},a[href*="/video/"],a[href*="/list/watchlater"]`);
  return [...owners].map(readBilibiliCandidate).filter((value): value is BilibiliCandidate => !!value);
}

/** Copy only scoped presentation markers, never native IDs, handlers or state. */
export function presentationAttributes(element?: Element | null) {
  return Object.fromEntries([...element?.attributes ?? []].filter(attribute => /^data-v-[a-f\d]+$/.test(attribute.name)).map(attribute => [attribute.name, attribute.value]));
}
