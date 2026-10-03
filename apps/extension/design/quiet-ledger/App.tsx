import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArchiveIcon, ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, CircleAlertIcon, ClockIcon, DownloadIcon, FileIcon, InboxIcon, LayersIcon, SearchIcon, SettingsIcon, Trash2Icon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from '@/components/ui/toast';
import { samples, belongs, readSamplePreset, type Kind, type View, type Outcome, type Sample } from '../shared/sample-data';
import './styles.css';

const viewIcons = { Inbox: InboxIcon, 'In progress': ClockIcon, Saved: CheckIcon, 'All captures': ArchiveIcon };
function Status({ value }: { value: Outcome }) {
  const Icon = value.tone === 'success' ? CheckIcon : value.tone === 'destructive' ? CircleAlertIcon : value.tone === 'warning' ? TriangleAlertIcon : value.tone === 'info' ? ClockIcon : InboxIcon;
  return <Badge variant={value.tone}><Icon aria-hidden="true" data-icon="inline-start" />{value.text}</Badge>;
}
function Outcomes({ sample }: { sample: Sample }) {
  const values: [string, Outcome][] = [['Capture', sample.capture], ['Local copy', sample.local], ['Locus save', sample.locus]];
  return <dl className="ledger-outcomes" aria-label="Independent capture outcomes">{values.map(([name, value]) => <div key={name}><dt>{name}</dt><dd><Status value={value} /></dd></div>)}</dl>;
}
function NoContent({ title, description }: { title: string; description: string }) {
  return <Empty><EmptyHeader><EmptyMedia variant="icon"><InboxIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>;
}
function App() {
  const [preset] = useState(readSamplePreset);
  const [view, setView] = useState<View>(preset.view);
  const [selected, setSelected] = useState<Kind | null>(preset.selected);
  const [tab, setTab] = useState<string>('preview');
  const [scenario, setScenario] = useState(preset.scenario);
  const [query, setQuery] = useState('');
  const [removed, setRemoved] = useState<Kind[]>([]);
  const [dialog, setDialog] = useState<'settings' | 'clear' | 'queue' | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const activityTab = useRef<HTMLButtonElement>(null);
  const revealActivity = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<Kind, HTMLButtonElement>());
  const origin = useRef<Kind | null>(null);
  const intent = useRef<'detail' | 'list' | null>(null);
  useEffect(() => {
    if (intent.current === 'detail') backRef.current?.focus();
    if (intent.current === 'list') (rowRefs.current.get(origin.current!) ?? searchRef.current)?.focus();
    intent.current = null;
  }, [selected]);
  useEffect(() => {
    if (revealActivity.current) {
      activityTab.current?.focus();
      activityTab.current?.scrollIntoView({ block: 'nearest' });
      revealActivity.current = false;
    }
  }, [tab]);
  function openDialog(next: 'settings' | 'clear' | 'queue', trigger: HTMLElement) {
    dialogReturnFocus.current = trigger;
    setDialog(next);
  }
  const records = scenario === 'empty' ? [] : samples.filter(item => !removed.includes(item.id));
  const rows = records.filter(item => belongs(item, view) && `${item.label} ${item.url}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sample = records.find(item => item.id === selected);
  function choose(id: Kind) {
    revealActivity.current = false;
    origin.current = id;
    intent.current = matchMedia('(max-width: 767px)').matches ? 'detail' : null;
    setSelected(id);
    setTab('preview');
  }
  function back() { revealActivity.current = false; intent.current = 'list'; setSelected(null); }
  function changeView(value: string) { revealActivity.current = false; setView(value as View); setQuery(''); setSelected(null); }
  function feedback(message: string) { toast.add({ title: 'Design sample', description: message, timeout: 0 }); }
  function nextStep(event: React.MouseEvent<HTMLButtonElement>) { if (sample?.id === 'setup') openDialog('settings', event.currentTarget); else if (tab === 'activity') { activityTab.current?.focus(); activityTab.current?.scrollIntoView({ block: 'nearest' }); } else { revealActivity.current = true; setTab('activity'); } }
  return <Toaster><div className="ledger-demo-bar"><span><strong>Quiet ledger</strong> · ui-ux-pro-max / synthetic sample</span><Field orientation="horizontal"><FieldLabel htmlFor="ledger-scenario">Example</FieldLabel><select id="ledger-scenario" value={scenario} onChange={event => { setScenario(event.target.value); setSelected(null); setRemoved([]); setQuery(''); }}><option value="normal">All sample states</option><option value="empty">Empty library</option><option value="loading">Loading library</option></select></Field></div>
    <Tabs value={view} onValueChange={value => changeView(String(value))} className="ledger-shell">
      <header className="ledger-header"><div className="ledger-identity"><span className="ledger-mark" aria-hidden="true"><LayersIcon /></span><div><h1>Locus</h1><p>Capture library</p></div></div><TabsList variant="line" aria-label="Capture views">{(Object.keys(viewIcons) as View[]).map(name => { const Icon = viewIcons[name]; return <TabsTrigger key={name} value={name}><Icon aria-hidden="true" data-icon="inline-start" />{name}<span className="ledger-count">{records.filter(item => belongs(item, name)).length}</span></TabsTrigger>; })}</TabsList><div className="ledger-header-actions"><Button variant="ghost" size="icon-lg" aria-label="Task queue" onClick={event => openDialog('queue', event.currentTarget)}><LayersIcon /></Button><Button variant="outline" onClick={event => openDialog('settings', event.currentTarget)}><SettingsIcon aria-hidden="true" data-icon="inline-start" />Settings</Button></div></header>
      <TabsContent value={view} className="ledger-main" data-selected={!!sample}>
        <section className="ledger-list" aria-label="Capture list"><header className="ledger-list-header"><div><span className="ledger-eyebrow">Your collection</span><h2>{view}</h2><p>{scenario === 'loading' ? 'Reading local capture summaries…' : `${rows.length} ${rows.length === 1 ? 'capture' : 'captures'}`}</p></div><Field><FieldLabel className="sr-only" htmlFor="ledger-search">Search capture label or source URL</FieldLabel><InputGroup><InputGroupInput id="ledger-search" ref={searchRef} placeholder="Search label or source URL" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} /><InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>{query && <InputGroupAddon align="inline-end"><InputGroupButton aria-label="Clear search" size="icon-sm" onClick={() => setQuery('')}><XIcon /></InputGroupButton></InputGroupAddon>}</InputGroup></Field></header>
          {scenario === 'loading' ? <div className="ledger-loading" role="status" aria-label="Loading captures">{[1, 2, 3, 4].map(number => <div key={number}><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-full" /><Skeleton className="h-4 w-40" /></div>)}</div> : rows.length ? <ul className="ledger-rows">{rows.map((item, index) => <li key={item.id}><button className="ledger-row" aria-label={`Open capture ${item.label}`} aria-pressed={selected === item.id} ref={node => { if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id); }} onClick={() => choose(item.id)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))); rowRefs.current.get(rows[next]!.id)?.focus(); } }}><span className="ledger-row-meta"><span>{item.site}</span><span>{item.age}</span></span><strong>{item.label}</strong><Status value={item.id === 'partial' ? item.capture : item.id === 'retention' ? item.local : item.locus} /><span className="ledger-row-hint">{item.hint}</span></button></li>)}</ul> : <NoContent title={query ? 'No matching captures' : !records.length ? 'No captures yet' : view === 'Inbox' ? 'Your Inbox is clear' : view === 'Saved' ? 'No saved captures yet' : 'Nothing in progress'} description={query ? 'Search matches the capture label and source URL. Try an ID or a label fragment.' : 'Enable a source in Settings, then explicitly capture content on its webpage.'} />}
          <footer className="ledger-list-footer"><span className="ledger-dot" aria-hidden="true" />Local retention and Locus saving are separate.</footer>
        </section>
        <section className="ledger-inspector" aria-label="Capture inspection">{sample ? <><header className="ledger-record-header"><div className="ledger-record-source"><span>{sample.site} · Captured {sample.age}</span><a href={sample.url} target="_blank" rel="noreferrer">Open source<ArrowUpRightIcon aria-hidden="true" /></a></div><div className="ledger-record-title"><h2>{sample.label}</h2><div><Button className="ledger-back" ref={backRef} variant="outline" onClick={back}><ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />Back</Button><Button variant="outline" disabled={sample.id === 'active'} onClick={() => feedback('Export is illustrated here; no file was downloaded.')}><DownloadIcon aria-hidden="true" data-icon="inline-start" />{sample.id === 'partial' ? 'Export available' : 'Export ZIP'}</Button><Button variant="ghost" size="icon-lg" aria-label="Clear result" onClick={event => openDialog('clear', event.currentTarget)}><Trash2Icon /></Button></div></div><Outcomes sample={sample} /></header>
          <div className="ledger-content-grid"><div className="ledger-reader"><Tabs value={tab} onValueChange={value => setTab(String(value))}><TabsList variant="line" aria-label="Capture details"><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="metadata">Metadata</TabsTrigger><TabsTrigger ref={activityTab} value="activity">Activity</TabsTrigger></TabsList>
            <TabsContent value="preview"><div className="ledger-author"><span className="ledger-avatar" aria-hidden="true">{sample.author.split(' ').map(word => word[0]).join('').slice(0, 2)}</span><div><strong>{sample.author}</strong><p>{sample.handle} · Source content</p></div></div><article className="ledger-prose">{sample.text}</article><section className="ledger-files"><div><h3>Selected files</h3><span>{sample.id === 'partial' ? 'One selected file unavailable' : sample.site === 'Bilibili' ? 'Video sample' : 'Text-only capture'}</span></div><div className="ledger-file"><FileIcon aria-hidden="true" /><div><strong>{sample.id === 'partial' ? 'Selected image unavailable' : sample.site === 'Bilibili' ? 'Selected video part' : 'Message and metadata'}</strong><p>{sample.id === 'partial' ? 'Source request failed. Available message content remains inspectable and exportable.' : sample.site === 'Bilibili' ? 'The design sample illustrates file state without loading or acquiring real media.' : 'No media files were selected; no files are missing.'}</p></div></div></section></TabsContent>
            <TabsContent value="metadata"><dl className="ledger-metadata"><dt>Source</dt><dd>{sample.site}</dd><dt>Label</dt><dd>{sample.label}</dd><dt>Source URL</dt><dd>{sample.url}</dd><dt>Selection</dt><dd>{sample.id === 'partial' ? 'Message and one image' : sample.site === 'Bilibili' ? 'Selected video part' : 'Message only'}</dd><dt>Local copy</dt><dd>{sample.local.text}</dd><dt>Locus save</dt><dd>{sample.locus.text}</dd></dl></TabsContent>
            <TabsContent value="activity"><div className="ledger-activity"><h3>What happens next</h3><Alert variant={sample.id === 'failed' || sample.id === 'retention' ? 'destructive' : 'default'}><AlertTitle>{sample.headline}</AlertTitle><AlertDescription>{sample.reason}</AlertDescription></Alert>{['failed', 'unverified'].includes(sample.id) && <Button onClick={() => feedback('The original-save control is illustrated; no request was sent.')}>Check and continue original save</Button>}{sample.id === 'setup' && <Button onClick={event => openDialog('settings', event.currentTarget)}>Connection settings</Button>}<details><summary>Technical details</summary><pre>Example result: {sample.id}{'\n'}Capture: {sample.capture.text}{'\n'}Local retention: {sample.local.text}{'\n'}Locus delivery: {sample.locus.text}{'\n'}Synthetic evidence only. No network operation occurred.</pre></details></div></TabsContent>
          </Tabs></div><aside className="ledger-next"><span className="ledger-eyebrow">Next step</span><Alert variant={sample.id === 'failed' || sample.id === 'retention' ? 'destructive' : 'default'}><AlertTitle>{sample.headline}</AlertTitle><AlertDescription>{sample.reason}</AlertDescription></Alert>{sample.action && <Button onClick={nextStep}>{sample.action}<ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" /></Button>}<p className="ledger-next-note">Capture, local retention and Locus saving are independent outcomes.</p></aside></div>
        </> : <NoContent title="Select a capture" description="Read the original content, see each outcome, and choose what happens next." />}</section>
      </TabsContent>
    </Tabs>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent className="max-h-[85svh] overflow-y-auto" initialFocus={dialog === 'clear' ? cancelRef : undefined} finalFocus={() => dialogReturnFocus.current?.isConnected ? dialogReturnFocus.current : searchRef.current}><DialogHeader><DialogTitle>{dialog === 'clear' ? 'Clear this local result?' : dialog === 'queue' ? 'Task queue' : 'Connection settings'}</DialogTitle><DialogDescription>{dialog === 'clear' ? `${sample?.label}. Only the extension’s local copy is removed. Exports and accepted Locus content remain.` : 'Synthetic design sample. No settings, permissions or network requests are changed.'}</DialogDescription></DialogHeader>{dialog === 'settings' && <FieldGroup><Field><FieldLabel htmlFor="ledger-address">Locus address</FieldLabel><Input id="ledger-address" readOnly value="http://127.0.0.1:46321" /><FieldDescription>Example address only. Set up the real connection in the production extension.</FieldDescription></Field><Field><FieldLabel htmlFor="ledger-token">Token</FieldLabel><Input id="ledger-token" readOnly value="No real credentials in this sample" /></Field></FieldGroup>}{dialog === 'queue' && <div className="ledger-queue"><strong>BV1sampleB · P2 · Notes from a quiet workshop</strong><progress value="60" max="100" aria-label="Synthetic capture progress" /><Status value={{ text: 'Acquiring', tone: 'info' }} /><p>Closing this view does not cancel accepted work. This queue is illustrated only.</p></div>}<DialogFooter><Button ref={cancelRef} variant="outline" onClick={() => setDialog(null)}>{dialog === 'clear' ? 'Cancel' : 'Close'}</Button>{dialog === 'settings' && <Button disabled>Connect and save</Button>}{dialog === 'clear' && <Button variant="destructive" onClick={() => { if (selected) setRemoved(previous => [...previous, selected]); setDialog(null); setSelected(null); feedback('Only this synthetic row was removed. Reset the example to restore it.'); }}>Clear sample result</Button>}</DialogFooter></DialogContent></Dialog>
    <a className="ledger-comparison-link" href="/comparison.html">Compare with Signal shelf</a>
  </Toaster>;
}
createRoot(document.getElementById('root')!).render(<App />);
