import { useEffect, useMemo, useRef, useState } from "react";
import type { ResultSummary } from "@/host/chrome/protocol";
import { resultView, type LibraryView } from "./presentation";

/** Explicit navigation reveals a target; background transitions preserve inspection. */
export function useLibraryNavigation(
  items: ResultSummary[] | undefined,
  selected: string,
) {
  const [view, setView] = useState<LibraryView>("inbox");
  const [query, setQuery] = useState("");
  const [oldest, setOldest] = useState(false);
  const [revealId, setRevealId] = useState(location.hash.slice(1));
  const previousSelection = useRef(selected);
  const selectedRow = items?.find((item) => item.id === selected);
  const selectedView = selectedRow && resultView(selectedRow);
  const movedTo =
    view !== "all" && selectedView !== view ? selectedView : undefined;

  useEffect(() => {
    if (previousSelection.current !== selected) {
      previousSelection.current = selected;
      setRevealId(selected);
    }
  }, [selected]);

  useEffect(() => {
    if (!revealId) return;
    const item = items?.find((item) => item.id === revealId);
    if (item) {
      setView(resultView(item));
      setQuery("");
      setRevealId("");
    }
  }, [revealId, items]);

  function changeView(next: LibraryView) {
    setRevealId("");
    setView(next);
    if (selected && next !== "all" && selectedView !== next) location.hash = "";
  }

  function selectCapture(id: string) {
    previousSelection.current = id;
    setRevealId("");
    location.hash = id;
  }

  function revealCapture(id: string) {
    setRevealId(id);
    setQuery("");
    location.hash = id;
  }

  function showMoved() {
    if (!movedTo) return;
    setView(movedTo);
    setQuery("");
  }

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items
      ?.filter(
        (item) =>
          (view === "all" || resultView(item) === view) &&
          `${item.label} ${item.sourceUrl}`
            .toLocaleLowerCase()
            .includes(search),
      )
      .sort(
        (a, b) =>
          (oldest
            ? a.createdAt.localeCompare(b.createdAt)
            : b.createdAt.localeCompare(a.createdAt)) ||
          a.id.localeCompare(b.id),
      );
  }, [items, view, query, oldest]);

  return {
    view,
    changeView,
    query,
    setQuery,
    oldest,
    setOldest,
    filtered,
    selectedRow,
    movedTo,
    showMoved,
    selectCapture,
    revealCapture,
  };
}
