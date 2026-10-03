import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResultsState } from "./useResultsState";
import { useLibraryNavigation } from "./useLibraryNavigation";
import { LibrarySidebar } from "./LibrarySidebar";
import { CaptureList } from "./CaptureList";
import { CaptureInspector } from "./CaptureInspector";
import { ClearCaptureDialog } from "./ClearCaptureDialog";
import { Failure } from "./ResultNotice";
import { viewLabels } from "./presentation";
import { WorkspaceSettings } from "./WorkspaceSettings";
import type { ResultFeedback } from "./feedback";

export function ResultsApp() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);
  const settingsTrigger = useRef<HTMLButtonElement | null>(null);
  function changeSettings(open: boolean) {
    if (open)
      settingsReturnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    setSettingsOpen(open);
  }
  const reveal = useRef<(id: string) => void>(() => {});
  const onFeedback = useCallback((feedback: ResultFeedback) => {
    const resultId = feedback.resultId;
    const id = toast.add({
      ...feedback,
      timeout: resultId || feedback.type === "error" ? 0 : undefined,
      actionProps: resultId
        ? {
            children: "View capture",
            onClick: () => {
              reveal.current(resultId);
              toast.close(id);
            },
          }
        : undefined,
    });
  }, []);
  const state = useResultsState(onFeedback);
  const navigation = useLibraryNavigation(
    state.collection?.items,
    state.selected,
  );
  reveal.current = navigation.revealCapture;
  const [sidebarOpen, setSidebarOpen] = useState(
    () => matchMedia("(min-width: 960px)").matches,
  );

  useEffect(() => {
    const media = matchMedia("(min-width: 960px)");
    const changed = () => setSidebarOpen(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);


  const focusIntent = useRef<"detail" | "list" | null>(null);
  const originRow = useRef("");
  useEffect(() => {
    if (focusIntent.current === "detail") {
      document.querySelector<HTMLButtonElement>('[aria-label="Back to captures"]')?.focus();
    } else if (focusIntent.current === "list") {
      const rows = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-capture-id]"));
      (rows.find(row => row.dataset.captureId === originRow.current) ??
        document.querySelector<HTMLInputElement>("#capture-search"))?.focus();
    }
    focusIntent.current = null;
  }, [state.selected]);
  function selectCapture(id: string) {
    originRow.current = id;
    if (matchMedia("(max-width: 767px)").matches) focusIntent.current = "detail";
    navigation.selectCapture(id);
  }
  function backToCaptures() {
    focusIntent.current = "list";
    location.hash = "";
  }
  const retry = () => {
    void state.refresh(true);
  };
  return (
    <Toaster>
      <TooltipProvider delay={300}>
        <SidebarProvider
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          style={{ "--sidebar-width": "var(--workspace-sidebar-width)" } as CSSProperties}
          className="results-workspace h-svh min-h-0 overflow-hidden"
        >
          <LibrarySidebar
            view={navigation.view}
            onView={navigation.changeView}
            items={state.collection?.items}
            onSettings={() => changeSettings(true)}
            settingsTrigger={settingsTrigger}
          />
          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            {state.collectionError && (
              <div className="shrink-0 border-b p-3">
                <Failure
                  title="Collection access problem"
                  message={`${state.collectionError}. Independently readable captures remain available. Use Retry reads.`}
                />
              </div>
            )}
            <div className="flex min-h-0 min-w-0 flex-1">
              <div
                className={cn(
                  "capture-list-pane h-full w-full shrink-0",
                  state.selected ? "hidden md:block" : "block",
                )}
              >
                <CaptureList
                  items={navigation.filtered}
                  allCount={state.collection?.items.length}
                  selected={state.selected}
                  view={navigation.view}
                  query={navigation.query}
                  setQuery={navigation.setQuery}
                  oldest={navigation.oldest}
                  setOldest={navigation.setOldest}
                  failed={!!state.collectionError}
                  onSelect={selectCapture}
                  onRetry={retry}
                />
              </div>
              <div
                className={cn(
                  "h-full min-w-0 flex-1 flex-col",
                  state.selected ? "flex" : "hidden md:flex",
                )}
              >
                {navigation.movedTo && (
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-5 py-2 text-xs">
                    <span>
                      This capture is now in {viewLabels[navigation.movedTo]}.
                      Your preview stays open.
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={navigation.showMoved}
                    >
                      Show in {viewLabels[navigation.movedTo]}
                    </Button>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <CaptureInspector
                    onBack={backToCaptures}
                    queuePosition={navigation.selectedRow?.queuePosition}
                    unresolvedReason={navigation.selectedRow?.unresolvedReason}
                    selected={state.selected}
                    snapshot={state.snapshot}
                    readError={state.readError}
                    collectionError={state.collectionError}
                    actionError={state.actionError}
                    delivery={state.delivery}
                    locus={state.locus}
                    onContinueLocus={() => {
                      void state.continueLocus();
                    }}
                    onSettings={() => changeSettings(true)}
                    busy={state.busy}
                    onExport={() => {
                      void state.exportResult();
                    }}
                    onClear={state.requestClear}
                    onRetry={retry}
                    onNotice={state.setNotice}
                  />
                </div>
              </div>
            </div>
          </SidebarInset>
          <WorkspaceSettings
            open={settingsOpen}
            onOpenChange={changeSettings}
            returnFocus={settingsReturnFocus}
            trigger={settingsTrigger}
            access={state.access}
            busy={state.busy}
            onEnable={(site) => {
              void state.enable(site);
            }}
          />
          <ClearCaptureDialog
            target={state.clearTarget}
            pending={state.busy === "clear"}
            error={state.clearError}
            onCancel={state.cancelClear}
            onConfirm={() => {
              void state.clear();
            }}
          />
        </SidebarProvider>
      </TooltipProvider>
    </Toaster>
  );
}
