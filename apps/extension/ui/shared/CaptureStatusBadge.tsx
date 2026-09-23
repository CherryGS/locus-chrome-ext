import { CheckCircle2Icon, CircleHelpIcon, Clock3Icon, DownloadIcon, LoaderCircleIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { captureStates, type CaptureState } from './capture-status';

const icons = {
  'locus-saved': CheckCircle2Icon,
  uncaptured: DownloadIcon, checking: LoaderCircleIcon, importing: LoaderCircleIcon,
  queued: Clock3Icon,
  saving: LoaderCircleIcon, saved: CheckCircle2Icon, partial: TriangleAlertIcon,
  failed: XCircleIcon, unknown: CircleHelpIcon,
};

export function CaptureStatusIcon({ state }: { state: CaptureState }) {
  const Icon = icons[state];
  const pending = state === 'checking' || state === 'importing' || state === 'saving';
  return <Icon aria-hidden="true" data-icon="inline-start" className={cn(pending && 'motion-safe:animate-spin')} />;
}

export function CaptureStatusBadge({ state }: { state: CaptureState }) {
  const { label, description, tone } = captureStates[state];
  return <Badge variant={tone === 'neutral' ? 'outline' : tone} title={description} data-capture-state={state}>
    <CaptureStatusIcon state={state} />
    {label}
  </Badge>;
}
