import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SourceLink } from "./SourceLink";
import { exactTime } from "./presentation";
import type { RecordPresentation } from "./record-presentation";

/** All supported sites share these slots. Styling changes belong here, not in adapters. */
export function RecordPreview({
  presentation,
}: {
  presentation: RecordPresentation;
}) {
  const { author, publishedAt, title, body, emptyBody, context } = presentation;
  return (
    <div
      data-slot="capture-record-preview"
      className="flex min-w-0 flex-col gap-5"
    >
      <header
        data-slot="capture-record-author"
        className="flex min-w-0 items-center gap-3"
      >
        <Avatar size="lg" aria-hidden="true">
          <AvatarFallback>
            {author.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium">
            <SourceLink href={author.href} label={author.linkLabel}>
              {author.name}
            </SourceLink>
          </p>
          <p className="break-words text-sm text-muted-foreground">
            {author.secondary} ·{" "}
            {publishedAt ? exactTime(publishedAt) : "Publication time unknown"}
          </p>
        </div>
      </header>
      {title && (
        <h3
          data-slot="capture-record-title"
          className="break-words text-lg font-medium"
        >
          {title}
        </h3>
      )}
      <div
        data-slot="capture-record-body"
        className="max-w-[68ch] whitespace-pre-wrap [overflow-wrap:anywhere] text-base leading-7"
      >
        {body || <span className="text-muted-foreground">{emptyBody}</span>}
      </div>
      {context.length > 0 && (
        <dl
          data-slot="capture-record-context"
          className="flex min-w-0 flex-col gap-3 border-t pt-4"
        >
          {context.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
