import type { CaptureState } from '@/ui/shared/capture-status';

// Keep the fifth action recognizable in every state. A small corner marker
// carries status without replacing the native-sized action with a warning sign.
const download = 'M15 5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 21 5v10h4a1.2 1.2 0 0 1 .85 2.05l-6.8 6.8a1.5 1.5 0 0 1-2.1 0l-6.8-6.8A1.2 1.2 0 0 1 11 15h4V5ZM7 23a2 2 0 0 1 2 2v3h18v-3a2 2 0 0 1 4 0v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4a2 2 0 0 1 2-2Z';
const markers: Partial<Record<CaptureState, string>> = {
  queued: 'M29 3.5V7l2 1', importing: 'M29 3.5V7l2 1', saving: 'M29 3.5V7l2 1',
  saved: 'm26 7 2 2 4-4', partial: 'M29 3.5v4m0 2.5v.1',
  failed: 'm26.5 4.5 5 5m0-5-5 5',
  unknown: 'M27.5 5a1.5 1.5 0 1 1 2.5 1.1c-1 .6-1 1-1 1.9m0 2v.1',
};

export function ToolbarIcon({ state }: { state: CaptureState }) {
  return <svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true" data-icon="inline-start">
    <path d={download} />
    {markers[state] && <g data-locus-status-marker="true"><circle cx="29" cy="7" r="6" /><path d={markers[state]} fill="none" stroke="var(--locus-marker-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></g>}
  </svg>;
}
