import { afterEach, expect, it, vi } from "vitest";
import type { SourceStatus } from "@/host/chrome/protocol";
import { createSourceStatusLookup } from "./source-status-lookup";

afterEach(() => {
  vi.useRealTimers();
});

it("deduplicates source URLs and keeps each browser request within fifty selections", async () => {
  const urls = Array.from(
    { length: 103 },
    (_, id) => `https://x.com/fixture/status/${id}`,
  );
  const request = vi.fn(async (_urls: string[]) => [] as SourceStatus[]);
  const receive = vi.fn();
  const lookup = createSourceStatusLookup({
    urls: () => [...urls, ...urls],
    enabled: () => true,
    request,
    receive,
  });
  await lookup.refresh();
  expect(request.mock.calls.map(([batch]) => batch.length)).toEqual([
    50, 50, 3,
  ]);
  expect(receive.mock.calls.flatMap(([batch]) => batch)).toEqual(urls);
  lookup.stop();
});

it("coalesces scans and overlapping refreshes into one subsequent request for current sources", async () => {
  vi.useFakeTimers();
  let urls = ["old"];
  let release!: (value: SourceStatus[]) => void;
  const request = vi.fn(
    (_urls: string[]) =>
      new Promise<SourceStatus[]>((resolve) => {
        release = resolve;
      }),
  );
  const lookup = createSourceStatusLookup({
    urls: () => urls,
    enabled: () => true,
    request,
    receive: vi.fn(),
  });
  lookup.schedule();
  lookup.schedule();
  await vi.advanceTimersByTimeAsync(200);
  expect(request).toHaveBeenCalledTimes(1);
  urls = ["current"];
  await lookup.refresh();
  await lookup.refresh();
  release([]);
  await vi.advanceTimersByTimeAsync(200);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith(["current"]);
  release([]);
  lookup.stop();
});

it("discards an old response across access suspension and reauthorization", async () => {
  let enabled = true;
  let release!: (value: SourceStatus[]) => void;
  const request = vi.fn(
    (_urls: string[]) =>
      new Promise<SourceStatus[]>((resolve) => {
        release = resolve;
      }),
  );
  const receive = vi.fn();
  const lookup = createSourceStatusLookup({
    urls: () => ["one"],
    enabled: () => enabled,
    request,
    receive,
  });
  const pending = lookup.refresh();
  enabled = false;
  lookup.cancel();
  enabled = true;
  release([{ sourceId: "one", summary: null }]);
  await pending;
  expect(receive).not.toHaveBeenCalled();
  const current = lookup.refresh();
  release([]);
  await current;
  expect(receive).toHaveBeenCalledWith(["one"], []);
  lookup.stop();
});

it("reports a failed batch independently and ignores a request completing after teardown", async () => {
  const urls = Array.from({ length: 51 }, (_, id) => String(id));
  const request = vi
    .fn(async (_urls: string[]) => [] as SourceStatus[])
    .mockRejectedValueOnce(new Error("Status transport unavailable"));
  const receive = vi.fn();
  const lookup = createSourceStatusLookup({
    urls: () => urls,
    enabled: () => true,
    request,
    receive,
  });
  await lookup.refresh();
  expect(receive).toHaveBeenNthCalledWith(
    1,
    urls.slice(0, 50),
    undefined,
    "Status transport unavailable",
  );
  expect(receive).toHaveBeenNthCalledWith(2, ["50"], []);
  let release!: (value: SourceStatus[]) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = lookup.refresh();
  lookup.stop();
  release([]);
  await pending;
  expect(receive).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledTimes(3);
});
