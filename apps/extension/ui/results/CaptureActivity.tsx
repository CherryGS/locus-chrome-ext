import type { ReactNode } from "react";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
  DownloadIcon,
} from "lucide-react";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import {
  availability,
  type Snapshot,
  type Delivery,
} from "@locus/capture-core/model";
import { deliveryLabels, exactTime, retentionLabel } from "./presentation";

export function CaptureActivity({
  snapshot,
  deliveries,
  children,
}: {
  snapshot: Snapshot;
  deliveries: Delivery[];
  children?: ReactNode;
}) {
  const { result } = snapshot;
  const state = availability(result);
  const AcquisitionIcon = state.complete
    ? CheckCircle2Icon
    : state.pending
      ? LoaderCircleIcon
      : CircleAlertIcon;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 p-5 sm:p-8">
      {children}
      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Capture & storage</h3>
        <ItemGroup>
          <Item variant="outline">
            <ItemMedia variant="icon">
              <AcquisitionIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Capture ·{" "}
                {state.complete
                  ? "Complete"
                  : state.pending
                    ? "In progress"
                    : state.acquired
                      ? "Partial capture"
                      : "Unavailable"}
              </ItemTitle>
              <ItemDescription>
                {state.acquired} of{" "}
                {result.records.length + result.assets.length} selected
                message/file portions acquired. Captured{" "}
                {exactTime(result.createdAt)}.
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>
                Local copy · {retentionLabel(result.retention.state)}
              </ItemTitle>
              <ItemDescription>
                {result.retention.state === "retained"
                  ? `Revision ${result.retention.revision} is saved on this device.`
                  : "Only previously saved content can be recovered after restarting Chrome."}
                {result.retention.reason && ` ${result.retention.reason}`}
              </ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Exports</h3>
        {!deliveries.length && (
          <p className="text-sm text-muted-foreground">
            No export requested for this capture.
          </p>
        )}
        <ItemGroup>
          {deliveries.map((delivery) => (
            <Item key={delivery.id} variant="outline">
              <ItemMedia variant="icon">
                <DownloadIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{deliveryLabels[delivery.state]}</ItemTitle>
                <ItemDescription className="line-clamp-none break-words">
                  {exactTime(delivery.createdAt)} · revision {delivery.revision}
                  <br />
                  {delivery.partial
                    ? "Snapshot includes available content and identifies missing portions."
                    : "Complete capture snapshot."}
                  {delivery.reason && (
                    <>
                      <br />
                      {delivery.reason}
                    </>
                  )}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A download is complete only when Chrome confirms it. Later capture
          progress does not change an exported snapshot.
        </p>
      </section>
    </div>
  );
}
