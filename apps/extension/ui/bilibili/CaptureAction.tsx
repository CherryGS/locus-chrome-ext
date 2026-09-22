import type { MouseEvent } from 'react';
import { CaptureActionGlyph } from '@/ui/shared/CaptureActionGlyph';
import { captureGlyphProgress } from '@/ui/shared/capture-glyph';
import type { CaptureProgress } from '@/host/chrome/capture-progress';
import { captureStates, type CaptureState } from '@/ui/shared/capture-status';
import { presentationAttributes, type BilibiliCandidate } from './candidates';

const labels: Record<CaptureState, string> = { uncaptured: '导入', checking: '导入', queued: '排队中', importing: '导入中', saving: '保存中', saved: '已导入', partial: '部分导入', failed: '需处理', unknown: '状态未知' };

export function CaptureAction({ candidate, state, message, progress, queueId, expanded, activate }: {
  candidate: BilibiliCandidate; state: CaptureState; message: string; queueId: string; expanded: boolean;
  progress?: CaptureProgress;
  activate: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { source, kind, title, reference } = candidate;
  const label = labels[state];
  const glyph = captureGlyphProgress(state, progress?.percent);
  const progressLabel = glyph.visible ? glyph.percent === null ? '正在获取或处理文件，进度暂不可计算。' : `进度 ${glyph.percent}%。` : '';
  const description = `${captureStates[state].label}. ${progressLabel} ${message} Capture only P${source.p}: metadata, cover and AVC/AAC video; up to 600 seconds and 64 MiB per track.`;
  // Keep native placement/typography while sharing Twitter's status glyphs.
  return <button type="button" {...presentationAttributes(reference)}
    className={kind === 'toolbar' ? 'video-toolbar-right-item' : undefined}
    data-locus-bilibili-action={kind} data-state={state} data-tone={captureStates[state].tone}
    data-locus-percent={glyph.visible ? glyph.percent === null ? 'indeterminate' : glyph.percent : undefined}
    aria-label={kind === 'toolbar' ? `Locus capture P${source.p}` : `Locus capture P${source.p}: ${title}`}
    aria-description={description} aria-controls={queueId} aria-expanded={expanded}
    title={`${label} P${source.p} · Locus · ${title}\n${description}`} onClick={activate}
    onKeyDown={event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); event.stopPropagation(); }}>
    <CaptureActionGlyph state={state} percent={progress?.percent} />
    {kind === 'toolbar' && <span {...presentationAttributes(reference?.querySelector('.video-toolbar-item-text'))} className="video-toolbar-item-text">导入</span>}
  </button>;
}
