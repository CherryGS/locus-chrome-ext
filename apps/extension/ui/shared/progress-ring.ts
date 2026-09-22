const namespace = 'http://www.w3.org/2000/svg';

// Own the rotation entirely in CSS. Combining rotate(-90 12 12) in the SVG
// attribute with a CSS transform-origin applies the center translation twice,
// even when reduced motion disables the animation.
export const progressRingStyles = '[data-locus-progress] circle:last-of-type{transform-box:fill-box;transform-origin:center;transform:rotate(-90deg)}[data-locus-progress][data-indeterminate="true"] circle:last-of-type{animation:locus-progress-spin 1.2s linear infinite}@keyframes locus-progress-spin{from{transform:rotate(-90deg)}to{transform:rotate(270deg)}}@media(prefers-reduced-motion:reduce){[data-locus-progress] circle{animation:none!important}}';

export function createProgressRing(svg: SVGElement) {
  const group = document.createElementNS(namespace, 'g');group.dataset.locusProgress = 'true';group.style.display = 'none';
  // Enlarge the numeric glyph around its center, keeping the native layout box
  // and action-row height unchanged (native hover halos overflow similarly).
  group.setAttribute('transform', 'translate(12 12) scale(1.4) translate(-12 -12)');
  const track = document.createElementNS(namespace, 'circle');
  for (const [name, value] of Object.entries({ cx: '12', cy: '12', r: '10.5', fill: 'none', 'stroke-width': '1.5', opacity: '.2' })) track.setAttribute(name, value);
  const arc = track.cloneNode() as SVGCircleElement;arc.removeAttribute('opacity');arc.setAttribute('pathLength', '100');arc.setAttribute('stroke-dasharray', '100');
  const label = document.createElementNS(namespace, 'text');
  for (const [name, value] of Object.entries({ x: '12', y: '12', 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: 'currentColor', stroke: 'none', 'font-size': '8.5', 'font-family': 'Arial, sans-serif', 'font-weight': '600', 'letter-spacing': '-.3' })) label.setAttribute(name, value);
  group.append(track, arc, label);svg.append(group);
  return { group, arc, label };
}

export function renderProgressRing(ring: ReturnType<typeof createProgressRing>, percent: number | null, visible: boolean) {
  ring.group.style.display = visible ? '' : 'none';
  ring.group.dataset.indeterminate = String(percent === null);
  ring.arc.setAttribute('stroke-dasharray', percent === null ? '22 78' : '100');
  ring.arc.setAttribute('stroke-dashoffset', percent === null ? '0' : String(100 - percent));
  ring.label.textContent = percent === null ? '…' : `${percent}%`;
}
