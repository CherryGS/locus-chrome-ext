import { selectTwitter, type TwitterCandidate } from "@locus/twitter/source";
import { normalizeAuthenticatedTwitter } from "@locus/twitter/authenticated-source";
import {
  normalizeBilibili,
  selectBilibili,
  type BilibiliCandidate,
} from "@locus/bilibili/source";
import { acquireBilibili, LIMITS } from "./bilibili-media";
import { acquireMedia, loadTwitter } from "./network";
import { coordinator } from "./protocol";
import type { AcquisitionProgress } from "./capture-progress";
import type { CaptureSite } from "./sites";

export type CaptureCandidate = TwitterCandidate | BilibiliCandidate;
export type MediaLease = Parameters<typeof acquireBilibili>[2];

/** Known Bilibili output caps let admission wait for retained upload bytes to
 * leave memory, rather than acquiring a video that cannot fit beside them. */
export function bilibiliOutputBudget(candidate: CaptureCandidate, pending: string[]) {
  if (!("site" in candidate)) return 0;
  return candidate.media
    .filter(media => pending.includes(media.id))
    .reduce((sum, media) => sum + (media.kind === "cover" ? 16 * 1048576 : LIMITS.outputBytes), 0);
}

/** Offscreen-only site dispatch: normalization stays in packages, byte execution stays here. */
export async function loadCaptureCandidate(
  site: CaptureSite,
  url: string,
  deadline: number,
): Promise<CaptureCandidate> {
  if (site === "bilibili")
    return normalizeBilibili(
      await coordinator("bilibili-source", { url, deadline }),
      url,
    );
  return loadTwitter(url, AbortSignal.timeout(40_000), async () =>
    normalizeAuthenticatedTwitter(
      await coordinator("authenticated-source", { url, deadline }),
      url,
    ),
  );
}

export function selectCaptureCandidate(
  candidate: CaptureCandidate,
  selected: string[],
  id: string,
) {
  return "site" in candidate
    ? selectBilibili(candidate, selected, id)
    : selectTwitter(candidate, selected, id);
}

export async function acquireCaptureAsset(
  candidate: CaptureCandidate,
  assetId: string,
  signal: AbortSignal,
  lease: MediaLease,
  progress: (value: AcquisitionProgress) => void,
) {
  if ("site" in candidate) {
    const media = candidate.media.find((item) => item.id === assetId);
    if (!media)
      throw new Error(
        "Selected Bilibili asset is missing from its accepted scope",
      );
    return acquireBilibili(media, signal, lease, progress);
  }
  const media = candidate.media.find((item) => item.id === assetId);
  if (!media)
    throw new Error(
      "Selected Twitter asset is missing from its accepted scope",
    );
  return acquireMedia(media, signal, progress);
}
