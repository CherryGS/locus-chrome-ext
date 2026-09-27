import type { CaptureState } from './capture-status';

export const captureGlyphPaths: Record<CaptureState, string> = {
  'locus-saved': 'M20 6 9 17l-5-5',
  uncaptured: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  queued: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
  checking: 'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6', importing: 'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6', saving: 'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6',
  saved: 'M4 4h16l2 10v6H2v-6L4 4zm-2 10h6l2 3h4l2-3h6', partial: 'M12 3 2 21h20L12 3zm0 6v5m0 3v.1', failed: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 6 6 6m0-6-6 6', unknown: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 5a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v.1',
};

export function captureGlyphProgress(state: CaptureState, percent: number | null = null) {
  return { visible: state === 'importing' || state === 'saving', percent: percent === null || !Number.isFinite(percent) ? null : Math.max(0, Math.min(99, Math.floor(percent))) };
}
