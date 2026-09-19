import { bilibiliPage, partUrl } from '@locus/bilibili/urls';

export interface BilibiliCandidate {
  owner: HTMLElement;
  target: HTMLElement;
  kind: 'toolbar' | 'cover';
  source: ReturnType<typeof partUrl>;
  title: string;
  reference?: HTMLElement;
}

export function readBilibiliCandidate(owner: HTMLElement): BilibiliCandidate | undefined {
  if (!owner.isConnected) return;
  const page = bilibiliPage(location.href);
  if (page === 'video' && owner.matches('#arc_toolbar_report .video-toolbar-left-main')) {
    return { owner, target: owner, kind: 'toolbar', source: partUrl(location.href), title: document.querySelector('h1')?.textContent?.trim() ?? '', reference: owner.querySelector<HTMLElement>('.video-fav') ?? undefined };
  }
  if (page !== 'home' && page !== 'favorites') return;
  if (!owner.matches('.bili-video-card') || owner.querySelector('.bili-card-checkbox--visible')) return;
  const link = owner.querySelector<HTMLAnchorElement>(page === 'home' ? 'a.bili-video-card__image--link' : 'a.bili-cover-card');
  if (!link || link.closest('.bili-video-card') !== owner || !link.parentElement) return;
  try {
    const source = partUrl(link.href);
    const title = owner.querySelector<HTMLElement>('.bili-video-card__info--tit,.bili-video-card__title')?.textContent?.trim() || link.querySelector('img')?.alt || source.bvid;
    const reference = [...owner.querySelectorAll<HTMLElement>('.bili-watch-later,.bili-card-watch-later__btn')].find(element => !element.closest('[data-locus-bilibili]'));
    return { owner, target: link.parentElement, kind: 'cover', source, title, reference };
  } catch { return; }
}

export function findBilibiliCandidates() {
  const page = bilibiliPage(location.href);
  const owners = page === 'video' ? document.querySelectorAll<HTMLElement>('#arc_toolbar_report .video-toolbar-left-main') : page === 'home' || page === 'favorites' ? document.querySelectorAll<HTMLElement>('.bili-video-card') : [];
  return [...owners].map(readBilibiliCandidate).filter((value): value is BilibiliCandidate => !!value);
}

/** Copy only scoped presentation markers, never native IDs, handlers or state. */
export function presentationAttributes(element?: Element | null) {
  return Object.fromEntries([...element?.attributes ?? []].filter(attribute => /^data-v-[a-f\d]+$/.test(attribute.name)).map(attribute => [attribute.name, attribute.value]));
}
