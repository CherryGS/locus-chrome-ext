import { ArrowDownWideNarrowIcon, FileTextIcon, InboxIcon, RefreshCwIcon, SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Item, ItemGroup, ItemContent, ItemTitle } from '@/components/ui/item';
import { CaptureStatusBadge } from '@/ui/shared/CaptureStatusBadge';
import { getCaptureStatus } from '@/ui/shared/capture-status';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { ResultSummary } from '@/host/chrome/protocol';
import { recentTime, exactTime, retentionLabel, sourceName, viewLabels, type LibraryView } from './presentation';

export function CaptureList({ items, allCount, selected, view, query, setQuery, oldest, setOldest, failed, onRetry }: { items?: ResultSummary[]; allCount?: number; selected: string; view: LibraryView; query: string; setQuery: (value: string) => void; oldest: boolean; setOldest: (value:boolean) => void; failed: boolean; onRetry: () => void }) {
  return <section aria-label="Capture list" className="flex h-full min-h-0 min-w-0 flex-col border-r bg-background">
    <header className="flex shrink-0 flex-col gap-4 border-b px-4 pb-4 pt-5"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><SidebarTrigger /><h2 className="truncate text-sm font-semibold">{viewLabels[view]}</h2></div><div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label="Retry reads" title="Retry reads" onClick={onRetry}><RefreshCwIcon /></Button><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Sort captures" title="Sort captures" />}><ArrowDownWideNarrowIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuLabel>Capture time</DropdownMenuLabel><DropdownMenuRadioGroup value={oldest ? 'oldest' : 'newest'} onValueChange={value => setOldest(value === 'oldest')}><DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem><DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div></div>
      <FieldGroup><Field><FieldLabel htmlFor="capture-search" className="sr-only">Search captures by label, author, post ID or URL</FieldLabel><InputGroup><InputGroupInput id="capture-search" placeholder="Search author, ID or URL" value={query} onChange={event => setQuery(event.target.value)} /><InputGroupAddon><SearchIcon /></InputGroupAddon>{query && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery('')}><XIcon /></InputGroupButton></InputGroupAddon>}</InputGroup></Field></FieldGroup>
    </header>
    <ScrollArea className="min-h-0 flex-1"><div className="p-2">
      {!items && !failed && <div aria-label="Loading captures" className="flex flex-col gap-3 p-2">{[1,2,3].map(key => <Skeleton key={key} className="h-20 w-full" />)}</div>}
      {items && items.length > 0 && <ItemGroup aria-label="Captures">{items.map(item => {
        const status = getCaptureStatus(item);
        return <div role="listitem" key={item.id}>
          <Item render={<button type="button" aria-label={`Open capture ${item.label}`} aria-pressed={selected === item.id} onClick={() => { location.hash = item.id; }} />} variant={selected === item.id ? 'muted' : 'default'} size="sm" className="text-left">
            <ItemContent className="min-w-0">
              <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{sourceName(item.sourceUrl)}</span><time className="shrink-0 text-xs text-muted-foreground" dateTime={item.createdAt} title={exactTime(item.createdAt)}>{recentTime(item.createdAt)}</time></div>
              <ItemTitle>{item.label}</ItemTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2"><CaptureStatusBadge state={status} />{status !== 'saved' && status !== 'saving' && <span className="text-xs text-muted-foreground">{item.retention.state === 'retained' && item.retention.revision !== item.revision ? `Saved revision ${item.retention.revision}` : retentionLabel(item.retention.state)}</span>}</div>
            </ItemContent>
          </Item>
        </div>;
      })}</ItemGroup>}
      {items?.length === 0 && !failed && <Empty className="px-3 py-14"><EmptyHeader><EmptyMedia variant="icon">{allCount === 0 ? <InboxIcon /> : <SearchIcon />}</EmptyMedia><EmptyTitle>{allCount === 0 ? 'No captures yet' : 'No matching captures'}</EmptyTitle><EmptyDescription>{allCount === 0 ? 'Enable Twitter, then capture a post from its action row.' : 'Try another search or library view.'}</EmptyDescription></EmptyHeader>{query && <EmptyContent><Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear search</Button></EmptyContent>}</Empty>}
      {failed && !items?.length && <Empty><EmptyHeader><EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia><EmptyTitle>Library could not be read</EmptyTitle><EmptyDescription>Try reading again. This does not mean your captures were removed.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={onRetry}>Retry reads</Button></EmptyContent></Empty>}
    </div></ScrollArea>
    <footer className="shrink-0 border-t px-4 py-3 text-xs text-muted-foreground">{items ? `${items.length} ${items.length === 1 ? 'capture' : 'captures'}${query ? ' matching your search' : ''}` : failed ? 'Library access unavailable' : 'Reading your library…'}</footer>
  </section>;
}
