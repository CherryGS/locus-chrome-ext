import { describe, expect, it } from "vitest";
import type { Collection, ResultSummary } from "@/host/chrome/protocol";
import { resultHint, resultView } from "./presentation";
import { createFeedbackObserver } from "./feedback";

const base: ResultSummary = {
  id: "one",
  label: "One",
  sourceUrl: "https://x.com/test/status/1",
  createdAt: "2026-01-01",
  revision: 1,
  acquisition: "complete",
  retention: { state: "retained", revision: 1 },
};
const saved = {
  ...base,
  locus: { state: "complete", message: "Confirmed" },
} satisfies ResultSummary;
describe("derived Inbox membership", () => {
  it("keeps confirmed Locus saving distinct from a failed local copy in compact summaries", () => {
    expect(resultHint({...saved, retention: {state: 'failed', revision: 1}}))
      .toBe('Saved to Locus · local copy not saved');
    expect(resultHint({...base, retention: {state: 'failed', revision: 1}}))
      .toBe('Local copy not saved · inspect available content');
  });
  it.each([
    [base, "inbox"],
    [saved, "saved"],
    [{ ...saved, unresolvedReason: "Cannot read result" }, "inbox"],
    [{ ...saved, retention: { state: "failed", revision: 1 } }, "inbox"],
    [{ ...saved, retention: { state: "retained", revision: 0 } }, "inbox"],
    [{ ...saved, acquisition: "partial" }, "inbox"],
    [{ ...base, acquisition: "unavailable" }, "inbox"],
    [{ ...base, acquisition: "pending" }, "progress"],
    [{ ...base, queuePosition: 2 }, "progress"],
    [{ ...base, locus: { state: "uploading", message: "" } }, "progress"],
    [{ ...base, locus: { state: "unverified", message: "" } }, "inbox"],
    [{ ...base, locus: { state: "failed", message: "" } }, "inbox"],
    [{ ...base, acquisition: "unknown" }, "inbox"],
  ] as [ResultSummary, string][])("classifies %j as %s", (item, view) =>
    expect(resultView(item)).toBe(view),
  );
});
describe("live feedback", () => {
  const collection = (
    items: ResultSummary[],
    deliveries: Collection["deliveries"] = [],
  ): Collection => ({ items, deliveries });
  it("silences history, notices new transitions once, and retains the target", () => {
    const observe = createFeedbackObserver();
    expect(observe(collection([saved]))).toEqual([]);
    const failed: ResultSummary = {
      ...saved,
      locus: { state: "failed", message: "Unavailable" },
    };
    expect(observe(collection([failed]))).toMatchObject([
      { resultId: "one", title: "Locus save needs attention" },
    ]);
    expect(
      observe(
        collection([
          {
            ...failed,
            locus: { state: "failed", message: "More diagnostics" },
          },
        ]),
      ),
    ).toEqual([]);
    expect(observe(collection([saved]))).toMatchObject([
      { resultId: "one", title: "Saved to Locus" },
    ]);
    expect(observe(collection([saved]))).toEqual([]);
  });
  it("reports incomplete capture and retention independently of Locus", () => {
    const observe = createFeedbackObserver();
    observe(collection([base]));
    expect(
      observe(collection([{ ...base, acquisition: "partial" }]))[0]?.title,
    ).toBe("Capture incomplete");
    expect(
      observe(
        collection([{ ...base, retention: { state: "failed", revision: 0 } }]),
      )[0]?.title,
    ).toBe("Local copy not saved");
  });
  it("announces setup as information without hiding failed retention", () => {
    const observe = createFeedbackObserver();
    observe(collection([base]));
    const staged: ResultSummary = {
      ...base,
      locus: { state: "configuration-required", message: "Setup" },
    };
    expect(observe(collection([staged]))).toMatchObject([
      { title: "Staged locally · configure Locus to continue", type: "info" },
    ]);
    expect(observe(collection([staged]))).toEqual([]);
    const broken = createFeedbackObserver();
    broken(collection([base]));
    expect(
      broken(
        collection([
          { ...staged, retention: { state: "failed", revision: 0 } },
        ]),
      ),
    ).toMatchObject([
      { title: "Locus setup required", type: "info" },
      { title: "Local copy not saved", type: "warning" },
    ]);
  });
  it("does not turn accepted export into confirmed completion or repeat polling notices", () => {
    const observe = createFeedbackObserver();
    observe(collection([base]));
    const delivery = {
      id: "export-1",
      resultId: "one",
      revision: 1,
      createdAt: base.createdAt,
      state: "starting",
      partial: false,
    } as const;
    expect(observe(collection([base], [delivery]))).toEqual([]);
    expect(
      observe(collection([base], [{ ...delivery, state: "complete" }])),
    ).toMatchObject([{ resultId: "one", title: "Download complete" }]);
    expect(
      observe(collection([base], [{ ...delivery, state: "complete" }])),
    ).toEqual([]);
  });
});
