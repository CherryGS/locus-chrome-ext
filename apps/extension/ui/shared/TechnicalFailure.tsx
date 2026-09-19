import { useEffect, useState } from 'react';
import { CopyIcon } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { diagnosticReport } from '@locus/capture-core/diagnostics';

/** Technical errors are expanded by default, including in the nonmodal queue. */
export function TechnicalFailure({ title, message, context }: { title: string; message: string; context?: Record<string, unknown> }) {
  const [copyState, setCopyState] = useState('');
  const report = diagnosticReport(message, context);
  useEffect(() => setCopyState(''), [report]);
  return <Alert variant="destructive" data-capture-diagnostic="true">
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription className="flex min-w-0 flex-col gap-2">
      <pre className="max-h-64 w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed" tabIndex={0} aria-label={`${title} diagnostic`}>{report}</pre>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="xs" onClick={event => {
        if (!event.nativeEvent.isTrusted) return;
        void navigator.clipboard.writeText(report).then(() => setCopyState('Copied')).catch(error => setCopyState(`Copy failed: ${error instanceof Error ? error.message : String(error)}`));
      }}><CopyIcon data-icon="inline-start" />Copy diagnostic</Button><span role="status">{copyState}</span></div>
    </AlertDescription>
  </Alert>;
}
