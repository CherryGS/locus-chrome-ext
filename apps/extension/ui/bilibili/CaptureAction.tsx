import type { MouseEvent } from 'react';
import { CaptureStatusIcon } from '@/ui/shared/CaptureStatusBadge';
import { captureStates, type CaptureState } from '@/ui/shared/capture-status';
import { presentationAttributes, type BilibiliCandidate } from './candidates';
import { ToolbarIcon } from './ToolbarIcon';

const labels: Record<CaptureState, string> = { uncaptured: '导入', checking: '导入', queued: '排队中', importing: '导入中', saving: '保存中', saved: '已导入', partial: '部分导入', failed: '需处理', unknown: '状态未知' };

export function CaptureAction({ candidate, state, message, queueId, expanded, activate }: {
  candidate: BilibiliCandidate; state: CaptureState; message: string; queueId: string; expanded: boolean;
  activate: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { source, kind, title, reference } = candidate;
  const label = labels[state];
  const description = `${captureStates[state].label}. ${message} Capture only P${source.p}: metadata, cover and AVC/AAC video; up to 600 seconds and 64 MiB per track.`;
  // Native controls reuse Bilibili's scoped presentation. Compact cover controls
  // share queue icons; the toolbar uses a filled icon with the same state meaning.
  return <button type="button" {...presentationAttributes(reference)}
    className={kind === 'toolbar' ? 'video-toolbar-left-item' : reference?.className}
    data-locus-bilibili-action={kind} data-state={state} data-tone={captureStates[state].tone}
    aria-label={kind === 'toolbar' ? `Locus capture P${source.p}` : `Locus capture P${source.p}: ${title}`}
    aria-description={description} aria-controls={queueId} aria-expanded={expanded}
    title={`${label} P${source.p} · Locus · ${title}\n${description}`} onClick={activate}
    onKeyDown={event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); event.stopPropagation(); }}>
    {kind === 'toolbar' ? <ToolbarIcon state={state} /> : <CaptureStatusIcon state={state} />}
    {kind === 'toolbar' && <span {...presentationAttributes(reference?.querySelector('.video-toolbar-item-text'))} className="video-toolbar-item-text">导入</span>}
  </button>;
}
