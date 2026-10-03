import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Snapshot, Delivery } from "@locus/capture-core/model";
import { CapturePreview } from "./CapturePreview";
import { CaptureActivity } from "./CaptureActivity";
import { CaptureMetadata } from "./CaptureMetadata";

export function CaptureDetails({
  snapshot,
  activityContext,
  deliveries,
  onNotice,
  tab,
  onTab,
}: {
  snapshot: Snapshot;
  activityContext?: ReactNode;
  deliveries: Delivery[];
  onNotice: (message: string) => void;
  tab: string;
  onTab: (value: string) => void;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTab(String(value))}
      className="capture-details gap-0"
    >
      <div className="capture-detail-tabs px-5 sm:px-8">
        <TabsList variant="line" aria-label="Capture details">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="activity">
            Activity
            {deliveries.length > 0 && (
              <span className="text-xs">({deliveries.length})</span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="preview" className="min-w-0">
          <CapturePreview snapshot={snapshot} />
      </TabsContent>
      <TabsContent value="metadata" className="min-w-0">
          <CaptureMetadata snapshot={snapshot} onNotice={onNotice} />
      </TabsContent>
      <TabsContent value="activity" className="min-w-0">
          <CaptureActivity snapshot={snapshot} deliveries={deliveries}>
            {activityContext}
          </CaptureActivity>
      </TabsContent>
    </Tabs>
  );
}
