import {
  InboxIcon,
  CheckCheckIcon,
  CircleDashedIcon,
  LibraryIcon,
  ScanLineIcon,
  Settings2Icon,
} from "lucide-react";
import type { RefObject } from "react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ResultSummary } from "@/host/chrome/protocol";
import { resultView, viewLabels, type LibraryView } from "./presentation";

const views = [
  { id: "inbox", icon: InboxIcon },
  { id: "progress", icon: CircleDashedIcon },
  { id: "saved", icon: CheckCheckIcon },
  { id: "all", icon: LibraryIcon },
] as const;
export function LibrarySidebar({
  view,
  onView,
  items,
  onSettings,
  settingsTrigger,
}: {
  view: LibraryView;
  onView: (view: LibraryView) => void;
  items?: ResultSummary[];
  onSettings: () => void;
  settingsTrigger: RefObject<HTMLButtonElement | null>;
}) {
  const { setOpenMobile } = useSidebar();
  const counts = { inbox: 0, progress: 0, saved: 0, all: items?.length ?? 0 };
  for (const item of items ?? []) ++counts[resultView(item)];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-5">
        <div className="flex items-center gap-3 px-1">
          <ScanLineIcon
            className="size-6 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="group-data-[collapsible=icon]:hidden">
            <h1 className="text-base font-semibold tracking-tight">Locus</h1>
            <p className="text-xs text-muted-foreground">Web captures</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {views.map(({ id, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    tooltip={viewLabels[id]}
                    isActive={view === id}
                    onClick={() => {
                      onView(id);
                      setOpenMobile(false);
                    }}
                  >
                    <Icon />
                    <span>{viewLabels[id]}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>
                    {items ? counts[id] : "—"}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              aria-label="Settings"
              onClick={onSettings}
              ref={settingsTrigger}
            >
              <Settings2Icon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
