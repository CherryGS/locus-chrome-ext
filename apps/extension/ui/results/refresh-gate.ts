/** Deduplicate reads for the same selection without blocking a newer selection. */
export function createRefreshGate() {
  let active: { selection: string; ticket: symbol; retry: boolean } | undefined;
  return {
    start(selection: string, force: boolean): symbol | undefined {
      if (active?.selection === selection) {
        if (force) active.retry = true;
        return;
      }
      active = { selection, ticket: Symbol(), retry: false };
      return active.ticket;
    },
    finish(ticket: symbol): boolean {
      // An abandoned read can finish after the newer selection's read started.
      if (active?.ticket !== ticket) return false;
      const retry = active.retry;
      active = undefined;
      return retry;
    },
  };
}
