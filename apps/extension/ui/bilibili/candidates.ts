import { bilibiliPage, partUrl } from '@locus/bilibili/urls';

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
  if (bilibiliPage(location.href) !== 'video') return true;
  const app = document.querySelector('#app');
  return !!app && !app.hasAttribute('data-server-rendered') && !!app.querySelector('#bilibili-player .bpx-player-container');
}

export function readBilibiliCandidate(owner: HTMLElement): BilibiliCandidate | undefined {
  if (!owner.isConnected) return;
  const page = bilibiliPage(location.href);
  if (page === 'video' && owner.matches('#arc_toolbar_report .video-complaint')) {
    if (!bilibiliPageReady()) return;
    if (!owner.parentElement) return;
    return { owner, target: owner.parentElement, before: owner, kind: 'toolbar', source: partUrl(location.href), title: document.querySelector('h1')?.textContent?.trim() ?? '', reference: owner };
  }
  if (!page || !owner.matches('a[href]') || !owner.querySelector('img,picture,video,canvas') || owner.closest('[data-locus-bilibili],#bilibili-player')) return;
  const link = owner as HTMLAnchorElement;
  if (!link.parentElement || link.parentElement.closest('a,button,[role="button"]')) return;
  if (link.closest('.bili-video-card')?.querySelector('.bili-card-checkbox--visible')) return;
  try {
    const source = partUrl(link.href);
    const title = link.title || link.querySelector('img')?.alt || link.getAttribute('aria-label') || source.bvid;
    const reference = [...link.parentElement.querySelectorAll<HTMLElement>('.bili-watch-later,.bili-card-watch-later__btn')].find(element => !element.closest('[data-locus-bilibili]'));
    return { owner, target: link.parentElement, kind: 'cover', source, title, reference };
  } catch { return; }
}

export function findBilibiliCandidates() {
  if (!bilibiliPage(location.href) || !bilibiliPageReady()) return [];
  const owners = document.querySelectorAll<HTMLElement>('#arc_toolbar_report .video-complaint,a[href*="/video/"]');
  return [...owners].map(readBilibiliCandidate).filter((value): value is BilibiliCandidate => !!value);
}

/** Copy only scoped presentation markers, never native IDs, handlers or state. */
export function presentationAttributes(element?: Element | null) {
  return Object.fromEntries([...element?.attributes ?? []].filter(attribute => /^data-v-[a-f\d]+$/.test(attribute.name)).map(attribute => [attribute.name, attribute.value]));
}
