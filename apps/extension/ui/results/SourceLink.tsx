import type { ReactNode } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { safeSource } from './presentation';

/** Retained sources are navigation targets only; reading a capture never fetches them. */
export function SourceLink({ href, children, label }: { href?: string | null; children: ReactNode; label?: string }) {
  const url = href ? safeSource(href) : undefined;
  if (!url) return <>{children}</>;
  return <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="inline-flex max-w-full items-baseline gap-1 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
    <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span><ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0 self-center" />
  </a>;
}
