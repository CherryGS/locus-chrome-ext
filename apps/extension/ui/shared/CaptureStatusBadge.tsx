import { CheckCircle2Icon, CircleHelpIcon, Clock3Icon, DownloadIcon, LoaderCircleIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { captureStates, type CaptureState } from './capture-status';

const icons = {
  uncaptured: DownloadIcon, checking: LoaderCircleIcon, importing: LoaderCircleIcon,
  queued: Clock3Icon,
  saving: LoaderCircleIcon, saved: CheckCircle2Icon, partial: TriangleAlertIcon,
  failed: XCircleIcon, unknown: CircleHelpIcon,
};

export function CaptureStatusBadge({ state }: { state: CaptureState }) {
  const { label, description, tone } = captureStates[state];
  const Icon = icons[state];
  const pending = state === 'checking' || state === 'importing' || state === 'saving';
  return <Badge variant={tone === 'neutral' ? 'outline' : tone} title={description} data-capture-state={state}>
    <Icon data-icon="inline-start" className={cn(pending && 'motion-safe:animate-spin')} />
    {label}
  </Badge>;
}
