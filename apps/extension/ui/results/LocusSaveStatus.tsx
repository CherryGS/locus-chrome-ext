import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { TechnicalFailure } from '@/ui/shared/TechnicalFailure';
import { toast } from '@/components/ui/toast';
import { transferActive, type LocusTransfer } from '@/host/locus/model';

export function LocusSaveStatus({ transfer, busy, canContinue, onContinue, onSettings }: { transfer?: LocusTransfer; busy: boolean; canContinue: boolean; onContinue: () => void; onSettings: () => void }) {
  if (!transfer) return null;
  if (transfer.state === 'complete') return <p className="text-xs text-muted-foreground">Locus confirmed this save{transfer.entityIds?.length ? ` · ${transfer.entityIds.length} ${transfer.entityIds.length === 1 ? 'entry' : 'entries'}` : ''}. Local content stays until you clear it.</p>;
  if (transferActive(transfer)) return <Alert><AlertTitle>Saving to Locus</AlertTitle><AlertDescription>{transfer.message}</AlertDescription></Alert>;
  return <div className="flex flex-col gap-2">
    {transfer.state === 'configuration-required' ? <Alert><AlertTitle>Locus setup required</AlertTitle><AlertDescription>Configure the Locus connection, then return here to continue this save. Changing settings does not send captured content.</AlertDescription></Alert> : <TechnicalFailure collapsed title={transfer.state === 'unverified' ? 'Locus save not verified' : 'Locus save needs attention'} message={transfer.message} context={{resultId:transfer.resultId,state:transfer.state,revision:transfer.revision}} onNotice={title=>toast.add({title})} />}
    <div className="flex flex-wrap gap-2">{transfer.state === 'configuration-required' && <Button size="sm" onClick={onSettings}>Connection settings</Button>}{canContinue && <Button size="sm" variant={transfer.state === 'configuration-required' ? 'outline' : 'default'} disabled={busy} onClick={onContinue}>{transfer.state === 'configuration-required' ? 'Continue save' : transfer.state === 'unverified' ? 'Check original save' : 'Check and continue save'}</Button>}{transfer.state !== 'configuration-required' && <Button size="sm" variant="outline" onClick={onSettings}>Connection settings</Button>}</div>
    <p className="text-xs text-muted-foreground">{canContinue ? 'Checks the existing attempt. Confirmed uploads are not repeated.' : 'Selected content is incomplete or unreadable. Retry reads, export available content, or return to the source.'}</p>
  </div>;
}
