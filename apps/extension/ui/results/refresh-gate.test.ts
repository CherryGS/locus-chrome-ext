import { describe, expect, it } from "vitest";
import { createRefreshGate } from "./refresh-gate";

describe("selection refresh scheduling", () => {
  it("deduplicates background reads of the same selection", () => {
    const gate = createRefreshGate();
    const first = gate.start("a", false)!;
    expect(gate.start("a", false)).toBeUndefined();
    expect(gate.finish(first)).toBe(false);
    expect(gate.start("a", false)).toBeDefined();
  });

  it("coalesces explicit retries into one follow-up for the current selection", () => {
    const gate = createRefreshGate();
    const first = gate.start("a", false)!;
    expect(gate.start("a", true)).toBeUndefined();
    expect(gate.start("a", true)).toBeUndefined();
    expect(gate.finish(first)).toBe(true);
    const retry = gate.start("a", true)!;
    expect(gate.finish(retry)).toBe(false);
  });

  it("starts a new selection immediately and discards the old queued retry", () => {
    const gate = createRefreshGate();
    const old = gate.start("a", false)!;
    gate.start("a", true);
    const current = gate.start("b", true);
    expect(current).toBeDefined();
    expect(gate.finish(old)).toBe(false);
    expect(gate.start("b", false)).toBeUndefined();
    expect(gate.finish(current!)).toBe(false);
  });

  it("keeps a newer read protected when an abandoned read finishes late", () => {
    const gate = createRefreshGate();
    const abandoned = gate.start("a", false)!;
    const second = gate.start("b", true)!;
    expect(gate.finish(second)).toBe(false);
    const latest = gate.start("a", true)!;
    expect(gate.finish(abandoned)).toBe(false);
    expect(gate.start("a", false)).toBeUndefined();
    expect(gate.finish(latest)).toBe(false);
  });
});
