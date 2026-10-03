import { useEffect, useState, type RefObject } from "react";
import { Globe2Icon, ShieldCheckIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { CaptureSite } from "@/host/chrome/sites";
import type { SiteAccess } from "./useSiteAccess";
import { LocusConnection } from "./LocusConnection";

const sources = [
  { id: "twitter", label: "Twitter" },
  { id: "bilibili", label: "Bilibili" },
] as const;

export function WorkspaceSettings({
  open,
  onOpenChange,
  returnFocus,
  trigger,
  access,
  busy,
  onEnable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: RefObject<HTMLElement | null>;
  trigger: RefObject<HTMLButtonElement | null>;
  access: SiteAccess;
  busy: string;
  onEnable: (site: CaptureSite) => void;
}) {
  const [tab, setTab] = useState("connection");
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    if (open) setTab("connection");
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!connecting) onOpenChange(value);
      }}
    >
      <DialogContent
        // Responsive sidebars replace their trigger; restore its current instance.
        finalFocus={() =>
          returnFocus.current?.isConnected
            ? returnFocus.current
            : trigger.current
        }
        showCloseButton={!connecting}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your Locus connection and website access.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="min-h-0 gap-4"
        >
          <TabsList aria-label="Settings sections">
            <TabsTrigger value="connection" disabled={connecting}>
              Connection
            </TabsTrigger>
            <TabsTrigger value="general" disabled={connecting}>
              General
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="connection"
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            <LocusConnection
              onConnected={() => onOpenChange(false)}
              onBusyChange={setConnecting}
            />
          </TabsContent>
          <TabsContent
            value="general"
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Website access</FieldLegend>
                <FieldDescription>
                  Enable capture controls on the websites you use.
                </FieldDescription>
                <FieldGroup>
                  {sources.map(({ id, label }) => {
                    const checking = access[id] === undefined,
                      granted = access[id] === true;
                    const enabling =
                      busy ===
                      (id === "twitter" ? "enable" : "enable-bilibili");
                    const Icon = granted ? ShieldCheckIcon : Globe2Icon;
                    return (
                      <Field key={id} orientation="horizontal">
                        <div className="min-w-0 flex-1">
                          <FieldLabel htmlFor={`access-${id}`}>
                            {label}
                          </FieldLabel>
                          {checking && (
                            <FieldDescription>
                              Checking access…
                            </FieldDescription>
                          )}
                        </div>
                        <Button
                          id={`access-${id}`}
                          size="sm"
                          variant="outline"
                          aria-label={
                            granted
                              ? `${label} enabled`
                              : enabling
                                ? "Enabling…"
                                : `Enable ${label}`
                          }
                          disabled={!!busy || checking || granted}
                          onClick={() => onEnable(id)}
                        >
                          <Icon data-icon="inline-start" />
                          {granted
                            ? "Enabled"
                            : enabling
                              ? "Enabling…"
                              : "Enable"}
                        </Button>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
