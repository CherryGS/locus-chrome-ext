import { CheckIcon, ClockIcon, CircleAlertIcon, InboxIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { availability, type CaptureResult } from "@locus/capture-core/model";
import { transferActive, type LocusTransfer } from "@/host/locus/model";

type Fact = { text: string; tone: "outline" | "success" | "warning" | "info" | "destructive" };
const icons = { outline: InboxIcon, success: CheckIcon, warning: TriangleAlertIcon, info: ClockIcon, destructive: CircleAlertIcon };

/** Present independent owner facts without turning them into a sequential workflow. */
export function CaptureOutcomeStrip({ result, locus, queued }: { result: CaptureResult; locus?: LocusTransfer; queued: boolean }) {
  const acquired = availability(result);
  const capture: Fact = queued ? { text: "Queued", tone: "info" }
    : acquired.complete ? { text: "Complete", tone: "success" }
    : acquired.pending ? { text: "Capturing", tone: "info" }
    : acquired.acquired ? { text: "Partial", tone: "warning" }
    : { text: "Unavailable", tone: "destructive" };
  const local: Fact = result.retention.state === "failed" ? { text: "Not saved locally", tone: "destructive" }
    : result.retention.state === "pending" ? { text: "Saving locally", tone: "info" }
    : result.retention.revision === result.revision ? { text: "Saved locally", tone: "outline" }
    : { text: `Revision ${result.retention.revision}`, tone: "warning" };
  const save: Fact = !locus ? { text: "No attempt", tone: "outline" }
    : locus.state === "complete" ? { text: "Saved", tone: "success" }
    : locus.state === "configuration-required" ? { text: "Setup required", tone: "info" }
    : locus.state === "failed" ? { text: "Save failed", tone: "destructive" }
    : locus.state === "unverified" ? { text: "Unverified", tone: "warning" }
    : transferActive(locus) ? { text: "Saving", tone: "info" }
    : { text: "Not verified", tone: "warning" };
  const facts: [string, Fact][] = [["Capture", capture], ["Local copy", local], ["Locus save", save]];
  return <dl className="capture-outcome-strip" aria-label="Independent capture outcomes">
    {facts.map(([label, fact]) => { const Icon = icons[fact.tone]; return <div key={label}><dt>{label}</dt><dd><Badge variant={fact.tone}><Icon aria-hidden="true" data-icon="inline-start" />{fact.text}</Badge></dd></div>; })}
  </dl>;
}
