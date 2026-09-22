import { postUrl } from '@locus/twitter/urls';
import { captureStates, type CaptureState } from '@/ui/shared/capture-status';

export interface TwitterActionRow { article: HTMLElement; row: HTMLElement; anchorSlot: HTMLElement; share: HTMLElement; icon: SVGElement; presentation: HTMLElement[]; shape: 'public' | 'logged-in'; url: string }

// Observed on X's logged-in Share control, which has no test ID. Using the
// glyph avoids depending on translated labels or guessing the last menu button.
const sharePath = 'M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z';

function isShare(button: HTMLElement) {
  return button.dataset.testid === 'share' || !!button.querySelector('svg[data-icon="icon-share-stroke"]') ||
    (button.getAttribute('aria-haspopup') === 'menu' && [...button.querySelectorAll('svg path')].some(path => path.getAttribute('d') === sharePath));
}

function presentationPath(reply: HTMLElement, icon: SVGElement): HTMLElement[] | null {
  const path: HTMLElement[] = [];
  for (let parent = icon.parentElement; parent && parent !== reply; parent = parent.parentElement) {
    if (!['SPAN', 'DIV'].includes(parent.tagName) || path.length >= 4) return null;
    path.unshift(parent);
  }
  return reply.contains(icon) ? path : null;
}

function sourceLink(link: HTMLAnchorElement, analytics = false) {
  try { const source = new URL(link.href);source.search = '';source.hash = '';if (analytics) { if (!source.pathname.endsWith('/analytics')) return null;source.pathname = source.pathname.slice(0, -10); }return postUrl(source.href); } catch { return null; }
}

function insideQuotedLink(element: Element, article: HTMLElement): boolean {
  for (let parent = element.parentElement; parent && parent !== article; parent = parent.parentElement) if (parent.getAttribute('role') === 'link') return true;
  return false;
}

/** Share owns placement and presentation; the article owns source identity. */
export function findActionRow(article: HTMLElement): TwitterActionRow | null {
  const shares = [...article.querySelectorAll<HTMLElement>('button,[role="button"]')].filter(button => !button.closest('[data-locus-action]') && button.closest('article') === article && !insideQuotedLink(button, article) && isShare(button));
  if (shares.length !== 1) return null;
  const share = shares[0]!;const icon = share.querySelector<SVGElement>('svg');
  if (!icon) return null;
  // Climb Share-only wrappers, including X's animated grid wrapper, stopping
  // where other native actions become siblings. Ignore our own inserted slot.
  let anchorSlot: HTMLElement = share;
  while (anchorSlot.parentElement && anchorSlot.parentElement !== article && anchorSlot.parentElement.getAttribute('role') !== 'group' &&
    [...anchorSlot.parentElement.querySelectorAll('button,[role="button"],a[href]')].every(control => control === share || control.closest('[data-locus-action]'))) anchorSlot = anchorSlot.parentElement;
  const row = anchorSlot.parentElement;
  if (!row || row === article) return null;
  const ownLinks = [...article.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(link => link.closest('article') === article && !insideQuotedLink(link, article));
  const permalinks = ownLinks.filter(link => !!link.querySelector('time,svg[data-icon="icon-reply-stroke"]')).map(link => sourceLink(link)).filter((value): value is NonNullable<typeof value> => !!value);
  const analytics = ownLinks.map(link => sourceLink(link, true)).filter((value): value is NonNullable<typeof value> => !!value);
  // Analytics is optional, but contradictory own links still make binding unsafe.
  if (!permalinks.length || new Set([...permalinks, ...analytics].map(value => value.id)).size !== 1) return null;
  const presentation = presentationPath(share, icon);if (!presentation) return null;
  return { article, row, anchorSlot, share, icon, presentation, shape: icon.hasAttribute('data-icon') ? 'public' : 'logged-in', url: permalinks[0]!.url };
}

export function createCaptureAction() {
  const slot = document.createElement('div'); slot.dataset.locusAction = 'true';
  const button = document.createElement('button'); button.type = 'button';
  const inner = document.createElement('span');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '1em'); svg.setAttribute('height', '1em');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.75'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M12 7v10m-4-4 4 4 4-4'); svg.append(path);inner.append(svg);button.append(inner);slot.append(button);
  const status = document.createElement('span');status.setAttribute('role', 'status');status.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';slot.append(status);
  const style = document.createElement('style');
  style.textContent = '[data-locus-action] button[data-locus-layout="logged-in"] [data-locus-glyph]{position:relative}[data-locus-action] button[data-locus-layout="logged-in"] [data-locus-glyph]::before{content:"";position:absolute;inset:-8px;border-radius:50%;background:currentColor;opacity:0;pointer-events:none;transition:opacity 140ms}[data-locus-action] button[data-locus-layout="logged-in"]:is(:hover,:focus-visible) [data-locus-glyph]::before{opacity:.14}@media(prefers-reduced-motion:reduce){[data-locus-action] [data-locus-glyph]::before{transition:none}}';slot.append(style);
  button.addEventListener('focus', () => { if (button.matches(':focus-visible')) { button.style.outline = '2px solid currentColor';button.style.outlineOffset = '2px'; } });
  button.addEventListener('blur', () => { button.style.removeProperty('outline');button.style.removeProperty('outline-offset'); });
  return { slot, button, inner, svg, status, presentationKey: '', neutralColor: '', stateColor: '' };
}

export function setActionStatus(action: ReturnType<typeof createCaptureAction>, state: CaptureState, theme: HTMLElement) {
  const paths: Record<CaptureState,string> = {
    uncaptured:'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
    queued:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
    checking:'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6', importing:'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6', saving:'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6',
    saved:'M20 6 9 17l-5-5',partial:'M12 3 2 21h20L12 3zm0 6v5m0 3v.1',failed:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 6 6 6m0-6-6 6',unknown:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 5a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v.1',
  };
  const tone=captureStates[state].tone;
  const color=tone==='neutral'?'':getComputedStyle(theme).getPropertyValue(`--${tone}`).trim();
  if(action.button.dataset.locusState===state&&action.stateColor===color)return;
  action.svg.querySelector('path')!.setAttribute('d',paths[state]);action.button.dataset.locusState=state;
  action.stateColor=color;
  action.button.style.color=action.stateColor||action.neutralColor;action.inner.style.color=action.stateColor||action.neutralColor;
}

export function matchActionPresentation(action: ReturnType<typeof createCaptureAction>, source: TwitterActionRow) {
  // Rebuild only the safe presentation ancestor path to the icon, never siblings
  // containing counts/overlays or native IDs, test IDs, listeners and menu state.
  const slotClasses = ['BUTTON', 'A'].includes(source.anchorSlot.tagName) ? '' : source.anchorSlot.className;
  if (action.slot.className !== slotClasses) action.slot.className = slotClasses;
  if (action.button.className !== source.share.className) action.button.className = source.share.className;
  // RNW base classes can impose a column on the copied grid wrapper. Own both
  // flex axes so a stretched detail row centers the glyph just like Share.
  const slotStyle = `display:inline-flex;flex-direction:row;align-items:center;justify-content:center;flex:0 0 auto;margin-inline-end:${source.shape === 'logged-in' ? '8px' : '0'};`;
  if (action.slot.getAttribute('style') !== slotStyle) action.slot.setAttribute('style', slotStyle);
  const path = source.presentation.map(element => ({ tag: element.tagName.toLowerCase(), classes: element.className }));
  const rect = source.icon.getBoundingClientRect();
  const iconClasses = source.icon.getAttribute('class') ?? '';
  // RNW may recolor Share through JavaScript while it is hovered. Prefer an
  // unhovered neutral action, then our last neutral observation, never Like's
  // pressed color. The extension supplies its own scoped hover/focus treatment.
  const neutral = [source.share, ...source.article.querySelectorAll<HTMLElement>('button[data-testid="reply"],button[data-testid="retweet"]')].find(button => !insideQuotedLink(button, source.article) && button.closest('article') === source.article && !button.matches(':hover,:focus-visible'))?.querySelector('svg');
  const color = source.shape === 'logged-in' ? neutral ? getComputedStyle(neutral).color : action.neutralColor || getComputedStyle(source.icon).color : '';
  action.neutralColor = color;
  const geometry = source.shape === 'logged-in' && rect.width > 0 && rect.height > 0 ? { width: `${rect.width}px`, height: `${rect.height}px` } : null;
  const key = JSON.stringify({ path, iconClasses, color, geometry });if (key === action.presentationKey) return;
  action.presentationKey = key;
  action.button.dataset.locusLayout = source.shape;
  action.button.style.color = action.stateColor || color;
  const ancestors = (path.length ? path : [{ tag: 'span', classes: '' }]).map(item => { const element = document.createElement(item.tag);element.className = item.classes;return element; });
  for (let index = 1; index < ancestors.length; index++) ancestors[index - 1]!.append(ancestors[index]!);
  action.inner = ancestors[0]!;action.inner.style.color = action.stateColor || color;
  action.svg.setAttribute('class', iconClasses);action.svg.style.fill = 'none';
  action.svg.style.width = geometry?.width ?? '';action.svg.style.height = geometry?.height ?? '';
  ancestors.at(-1)!.dataset.locusGlyph = 'true';ancestors.at(-1)!.append(action.svg);action.button.replaceChildren(action.inner);
}
