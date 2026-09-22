import { useLayoutEffect, useRef } from 'react';
import type { CaptureState } from './capture-status';
import { captureGlyphPaths, captureGlyphProgress } from './capture-glyph';
import { createProgressRing, renderProgressRing } from './progress-ring';

/** React adapter for the same glyphs/ring used by Twitter's native DOM control. */
export function CaptureActionGlyph({ state, percent }: { state: CaptureState; percent?: number | null }) {
  const target = useRef<SVGGElement>(null);
  const ring = useRef<ReturnType<typeof createProgressRing> | null>(null);
  const progress = captureGlyphProgress(state, percent);
  useLayoutEffect(() => {
    ring.current ??= createProgressRing(target.current!);
    renderProgressRing(ring.current, progress.percent, progress.visible);
  }, [progress.percent, progress.visible]);
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="inline-start" style={{ overflow: progress.visible ? 'visible' : undefined }}>
    <path d={captureGlyphPaths[state]} style={{ display: progress.visible ? 'none' : undefined }} />
    <g ref={target} />
  </svg>;
}
