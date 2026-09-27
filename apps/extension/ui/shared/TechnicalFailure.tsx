import { useEffect, useState } from 'react';
import { CopyIcon } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { diagnosticReport } from '@locus/capture-core/diagnostics';

/** Persistent diagnostics remain copyable when their technical details are collapsed. */
export function TechnicalFailure({ title, message, context, collapsed = false, onNotice }: { title: string; message: string; context?: Record<string, unknown>; collapsed?: boolean; onNotice?: (message: string) => void }) {
  const [copyState, setCopyState] = useState('');
  const report = diagnosticReport(message, context);
  useEffect(() => setCopyState(''), [report]);
  return <Alert variant="destructive" data-capture-diagnostic="true">
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription className="flex min-w-0 flex-col gap-2">
      {collapsed && <p className="line-clamp-2 break-words">{message.split('\n')[0]}</p>}
      <details open={collapsed ? undefined : true}><summary className="cursor-pointer text-xs">Technical details</summary><pre className="mt-2 max-h-64 w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed" tabIndex={0} aria-label={`${title} diagnostic`}>{report}</pre></details>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="xs" onClick={event => {
        if (!event.nativeEvent.isTrusted) return;
        void navigator.clipboard.writeText(report).then(() => { setCopyState('Copied'); onNotice?.('Diagnostic copied.'); }).catch(error => { const message = `Copy failed: ${error instanceof Error ? error.message : String(error)}`; setCopyState(message); onNotice?.(message); });
      }}><CopyIcon data-icon="inline-start" />Copy diagnostic</Button><span role="status">{copyState}</span></div>
    </AlertDescription>
  </Alert>;
}
