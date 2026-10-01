import type {
  CaptureResult,
  Json,
  ResultAsset,
} from "@locus/capture-core/model";
import { twitterPresentation } from "@locus/twitter/presentation";
import { bilibiliPresentation } from "@locus/bilibili/presentation";
import { exactTime } from "./presentation";

interface RecordField {
  label: string;
  value: string | null;
  href?: string | null;
}

/** Display slots only: site packages still interpret and validate retained payloads. */
export interface RecordPresentation {
  author: {
    name: string;
    href: string | null;
    linkLabel: string;
    secondary: string;
  };
  publishedAt: string | null;
  title?: string;
  body: string;
  emptyBody: string;
  context: RecordField[];
  metadata: RecordField[];
}

const time = (value: string | null) => (value ? exactTime(value) : null);

/** Preview and Metadata consume the same projection; adapters never supply JSX or styles. */
export function recordPresentation(
  site: string,
  payload?: Json,
): RecordPresentation | null {
  if (site === "twitter") {
    const post = twitterPresentation(payload);
    if (!post) return null;
    const author = post.displayName ?? post.username ?? "Author unknown";
    return {
      author: {
        name: author,
        href: post.authorUrl,
        linkLabel: "Open author profile",
        secondary: post.username ? `@${post.username}` : "Username unknown",
      },
      publishedAt: post.publishedAt,
      body: post.text,
      emptyBody: "Empty authored message",
      context: [],
      metadata: [
        { label: "Author", value: author, href: post.authorUrl },
        {
          label: "Username",
          value: post.username ? `@${post.username}` : null,
        },
        { label: "Post ID", value: post.sourceId },
        { label: "Author ID", value: post.accountId },
        { label: "Published", value: time(post.publishedAt) },
        { label: "Observed", value: time(post.observedAt) },
      ],
    };
  }
  if (site === "bilibili") {
    const part = bilibiliPresentation(payload);
    if (!part) return null;
    const author = part.uploader ?? "Uploader unknown";
    return {
      author: {
        name: author,
        href: part.authorUrl,
        linkLabel: "Open uploader profile",
        secondary: "Uploader",
      },
      publishedAt: part.publishedAt,
      title: part.title,
      body: part.description,
      emptyBody: "Empty authored description",
      context: [
        { label: "Part", value: part.part },
        { label: "Representation", value: part.quality },
      ],
      metadata: [
        { label: "Title", value: part.title },
        { label: "Part", value: part.part },
        { label: "Uploader", value: author, href: part.authorUrl },
        { label: "Uploader ID", value: part.uploaderId },
        { label: "BV ID", value: part.bvid },
        { label: "AV ID", value: part.aid },
        { label: "Part CID", value: part.cid },
        {
          label: "Duration",
          value:
            part.duration === null
              ? null
              : `${part.duration} seconds${part.durationPrecision === "coarse-seconds" ? " (approximate)" : ""}`,
        },
        { label: "Published", value: time(part.publishedAt) },
        { label: "Observed", value: time(part.observedAt) },
        { label: "Source representation", value: part.quality },
        {
          label: "Audio",
          value: part.audioAbsent ? "No audio in source" : part.audioCodec,
        },
      ],
    };
  }
  return null;
}

/** Site-specific file meaning, with one shared file-card renderer. */
export function previewPresentation(result: CaptureResult) {
  const assets =
    result.site === "bilibili"
      ? [...result.assets].sort(
          (a, b) => Number(b.id === "media-2") - Number(a.id === "media-2"),
        )
      : result.assets;
  const fileKind = (asset: ResultAsset) =>
    result.site === "bilibili" && asset.id === "media-1"
      ? "Parent cover"
      : asset.mime?.startsWith("image/")
        ? "Image"
        : asset.mime?.startsWith("video/")
          ? "Video"
          : "File";
  return {
    originalLabel:
      result.site === "bilibili"
        ? "Open original video"
        : result.site === "twitter"
          ? "Open original post"
          : "Open original content",
    assets: assets.map((asset, index) => ({
      asset,
      title: `${fileKind(asset)} ${index + 1}`,
    })),
  };
}
