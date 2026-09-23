import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { transferActive, type LocusTransfer } from '@/host/locus/model';

export function LocusSaveStatus({transfer,busy,onContinue}:{transfer?:LocusTransfer;busy:boolean;onContinue:()=>void}) {
  if(!transfer)return null;
  return <Alert variant={transfer.state==='failed'?'destructive':'default'}><AlertTitle>{transfer.state==='complete'?'Saved to Locus':transferActive(transfer)?'Saving to Locus':'Locus save needs attention'}</AlertTitle>
    <AlertDescription><p role="status">{transfer.message}</p>
      {transfer.entityIds?.length ? <p>{transfer.entityIds.length} confirmed Locus entries.</p> : null}
      {!transferActive(transfer)&&transfer.state!=='complete'&&<Button size="sm" variant="outline" disabled={busy} onClick={onContinue}>Check and continue save</Button>}
    </AlertDescription>
  </Alert>;
}
