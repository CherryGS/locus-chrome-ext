# Locus capture extension

Run root workspace commands with Node.js 24 and pnpm 11.21.0. `pnpm build`
produces `apps/extension/.output/chrome-mv3`. Load that directory with **Load unpacked** in
`chrome://extensions` using a disposable Chrome profile (Chrome 116 or newer).
For automated sideloading, use Chromium or Chrome for Testing; normal current
Chrome does not support the same command-line sideload flags. Never point a test
runner at a personal browser profile.

## Use

1. Click the extension action to open **Locus results**.
2. Choose **Enable Twitter** and grant the four declared site/media origins.
3. Open a supported post on x.com. Choose the **Locus capture** icon in its
   bottom action row, between Bookmark and Share. A normal click or Enter starts
   a fresh source inspection and queues its message and all directly attached
   media automatically. No second confirmation is required. Preparation and
   progress stay in the compact queue bar, leaving the webpage available for
   browsing. Repeated clicks during preparation or known active work show progress
   without submitting another task. Source failures remain visible in the queue.
4. For optional file selection, **Shift-click** the icon or press **Shift+Enter**.
   Select desired files, or clear every checkbox for a text-only capture, then
   choose **Add to queue · N media**. **Expand capture queue** shows each task's
   exact state and **Open result**
   action. Up to two captures run while twenty wait in FIFO order; an accepted
   selection no longer depends on its inspection token or source document.
   The panel and results library use a dark theme. Long messages and media
   choices scroll internally, with header and footer actions kept reachable.
   **Minimize capture queue** hides the details. This ordinary region has no
   backdrop, focus trap, automatic focus movement, page-scroll lock or global
   Escape handling. Separate source drafts preserve manual choices across panel
   switching and article rerenders. Closing either visible page does not cancel
   accepted work; reopening a page discovers currently running and queued tasks.
   Recent completed rows are a page view; durable history stays in the library.
5. Use the library's **All captures**, **In progress**, **Ready**, and **Needs
   attention** views, then search labels, handles, post IDs or source URLs and
   sort by capture time. Search uses available summaries, not message bodies or
   file contents. **Preview** shows readable captured messages and actual Blob
   media; **Metadata** preserves full payloads and read outcomes; **Activity**
   separates acquisition, retention and exports. Current export outcomes and
   read/storage problems remain visible outside the tabs. On narrow screens,
   **Back to captures** returns to the list and the sidebar button opens views.
   **Export ZIP** / **Export available content** grants a
   snapshot containing `metadata.json`, `records.jsonl`, and acquired files under
   generated `files/asset-NNN.ext` paths. Chrome's save dialog and download state
   determine delivery; an initiated download is not reported as complete.
6. **Clear result** identifies the target and requires confirmation. Exported
   filesystem files remain; an already granted export may finish. Clear cannot
   be undone by late producer writes.

Removing Twitter host permissions interrupts active and waiting work; regranting
does not restart those tasks. Confirmed clear prevents a waiting task from starting.
Retained local results remain readable and exportable after permissions are removed.
Reopening after restart reads committed data
without resuming network work. A failed retention state is usable only while its
live owner survives; the UI identifies the last recoverable committed revision.

Capture state uses color, icon shape and text together: a neutral download means
not captured, a blue clock means queued, blue progress means checking/importing/saving, a green check means
the selected scope is complete and saved at its current revision, amber warning
means partial, and red error means acquisition or retention needs attention.
Unknown lookup/execution state uses a question icon and never claims absence or
success. Exact-source local summaries restore the indicator after reload, including
username changes with the same numeric post ID; clearing the last matching result
resets it on the next check. A new explicit attempt keeps its own status instead of
falling back to an older successful capture. Passive checks read summaries only,
do not acquire source content, and do not create or keep a Blob helper alive.

## Current bounds

The public parser recognizes the initial hydration Relay records observed on
2026-09-19. It reads a restricted data grammar through bundled Acorn, never runs
site scripts, and binds the requested numeric post ID before using source data.
Later streamed replies are outside that initial selection. Current article
controls recognize the public Reply/Like icon row and reply-action permalink,
and the logged-in React Native Web row with locale-independent reply/like/unlike
test IDs. Logged-in rows require the post's own timestamp and analytics links to
agree on its source identity. Focal detail metadata can place both links above
the action row; timeline analytics remains within the row. Quoted and nested
article links are excluded.
The extension-owned icon copies only safe live presentation ancestors/classes,
plus measured neutral icon color and dimensions where required. It supplies its
own hover/focus feedback for the logged-in layout. Native
site nodes, listeners, counts and action semantics remain unchanged. Unrecognized
action-row structures receive no guessed control. The expanded shadow panel
uses the extension's dark theme tokens inside its own shadow root.
Public HTML requests omit credentials. A bound public tombstone or missing initial
public format can use the current X session through a short-lived inactive tab for
the exact selected post. X loads that tab normally; packaged document-start
scripts observe its own matching TweetDetail XHR/Fetch response and project only
the selected top-level Tweet. Ordinary tabs are not observed. No headers,
credentials, API keys or request replay are used. The extension validates the
projected source again before accepting a candidate. Unsupported formats and
login/challenge/session failures remain explicit; visible text is never a fallback.

The signed-in source recognizes the verified direct TweetDetail entry with matching
numeric identities, ordinary complete legacy text, and owned direct media. Text
completeness also requires the observed request to ask for note/article fields;
missing context keeps text unavailable while independently verified media can
remain usable. Temporary tabs are bound to an unpredictable token, exact URL,
owned tab and current document. Success, failure, timeout and permission removal
close attempt-owned tabs. Minimal ownership lives in extension session storage
so worker revival can clean orphan probes without resuming extraction or closing
ordinary source tabs. Durable results continue to use IndexedDB.

Ordinary `TBirdData.full_text` is supported when note/article bindings are known
absent. Known long-form/article/unknown text bindings remain unavailable rather
than using excerpts. Quote/reply targets are references, not recursive captures.
Pure reposts resolve only through explicit source target bindings.

Complete source-provided JPEG, PNG, WebP, GIF and MP4 files are accepted under the
verified `pbs.twimg.com/media` and `video.twimg.com` path families. Motion previews,
playlists, redirects, partial HTTP, HTML responses and malformed/truncated
containers fail explicitly. No transcoding or stream assembly occurs. MP4
variants use comparable source bitrate when available; attachment order and
representation dimensions remain unknown when unverified. `sourceDimensions`
does not claim the acquired representation's dimensions.

Capability limits: 20 MiB HTML, 8 million source-script characters, 80 nested data
levels, 250,000 data-expression nodes, 10,000 expanded entity nodes, 16 attachments, 256 MiB per file, 512 MiB
per capture, 512 MiB of live acquired content across the owner, two running plus
twenty waiting captures, and two pending exports. Public source loading has a
30-second deadline; the complete inspection including signed-in fallback is
bounded by 40 seconds. Signed-in probes allow two active plus four waiting,
including at most 25 seconds of probe/wait time, 8 MiB observed response text,
32 KiB request URLs and 256 KiB projected messages. Each media request times out
after three minutes. Candidate tokens
expire after five minutes unless consumed by queue acceptance. Inspection remains
available while acquisition slots are occupied. Limit failures stay attached to
the selected scope. If unsaved content fills the live-byte limit and no running
job can release it, remaining waiting acquisitions finish with an explicit capacity
failure instead of waiting indefinitely. Export needed content and clear those
results before explicitly trying again.
Disk, storage and browser failures remain reportable; no automatic eviction or
age-based deletion is implemented. Pending unverified native delivery may keep
its Blob owner alive until actual terminal browser state is known.

## Ownership and verification

`core/results` owns site-opaque state and serialization; `sites/twitter` owns
source meaning; `host/chrome` owns IndexedDB, network, execution and native APIs;
`ui` consumes those capabilities. WXT entrypoints contain only wiring. Runtime
content registration is intentionally declared without WXT `matches` because
WXT otherwise adds required host permissions; the coordinator registers matches
only after checking actual optional grants.

Run `pnpm check:deps`, `pnpm prepare:types`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and `pnpm build` from the workspace root. Test fixtures are explicitly
synthetic and disposable. The built manifest must have optional site origins,
no required site host access, no static content scripts, an action without a
popup, and the offscreen/download/storage permissions. The two runtime probe
scripts run at document start in MAIN and isolated worlds only on granted X
origins, and immediately return in ordinary unmarked documents.

In an isolated real browser, exercise enabling/denial/removal, a text-only post,
a reply with an image, MP4 capture, partial failure, result-view closure during
acquisition, worker recreation, browser restart and retained Blob recovery.
Export a partial and a complete result; unzip and compare bytes and both metadata
representations. Confirm actual Chrome completion, interruption/action-needed,
clear cancellation, clear during capture/export, and no late resurrection.
Check keyboard operation and narrow/wide result layouts. Public source probes
and mock tests alone do not establish these host outcomes.

## Disposable Chrome smoke test

After building, set `LOCUS_CHROME_PATH` to an installed Chrome for Testing or
Chromium executable, then run from the workspace root:

```powershell
$env:LOCUS_CHROME_PATH = 'C:\path\to\chrome.exe'
pnpm --dir apps/extension test:browser
```

The harness creates its own temporary build copy, browser profiles, synthetic
site/media routes, downloads and screenshots. It never uses a personal profile.
First it verifies the unchanged production manifest's ungranted/empty UI. For
automated fixture flows only, it then adds pre-granted hosts to that temporary
manifest copy; it does not modify the production build or add production test
hooks. Native optional-host permission prompt acceptance/denial/removal and
browser intervention dialogs still require manual verification.

The actual browser tests cover trusted pointer/keyboard selection, rejection of
webpage-script clicks/toggles, current-source inspection, text-only/media capture,
view closure, worker recreation, extension-origin Blob bytes, confirmed native
ZIP completion and archive contents, partial HTTP failure/export, clear
cancellation/confirmation, full restart, and a read slower than the polling
interval. It reports the temporary evidence directory and saves responsive
screenshots. Temporary evidence is deliberately left available for review; remove
only the specific reported test directory after inspection.

The filled-library UI checks use fictional authors, synthetic retained records,
and a generated image in the disposable database. They cover summary-only search,
state views, sorting, Preview/Metadata/Activity navigation, desktop sidebar
collapse, mobile list/detail navigation, long source labels, visible export
warnings, selection-scoped delivery feedback, read retries, and clear failure
feedback. Fault injection is confined to the test page and does not alter the
production extension's capabilities or persisted native-download outcomes.

Set `LOCUS_LIVE_ACTION_PROBE=1` to additionally attempt a read-only cosmetic check
of the collapsed entry on `https://x.com/jack/status/20`. This does not inspect,
capture, like or repost the live post. The optional probe reports access failures
separately from the deterministic fixture checks and saves a live article or
blocked-page screenshot. Fixture screenshots cover the collapsed and expanded
capture controls at narrow and wide widths.

Non-modal panel checks cover long text and twelve choices, bounded viewport
geometry, an independently scrolling body, unchanged article height, outside
typing/link/scroll/Escape behavior, no focus movement or page lock, preserved
draft choices, source status after reload/clear, and unknown versus verified
absence. Two actual media requests are blocked while a third task waits; releasing
one verifies FIFO dispatch. Task identity survives article detachment, page reload
and worker recreation. Test-only delayed responses verify that feedback for an old
task remains scoped to that task and cannot overwrite a newer capture, and that
observer refreshes do not overlap.

Authenticated-probe browser fixtures use a bound public tombstone followed by
synthetic X-owned TweetDetail XHR. They check inactive loading, ordinary-tab
inertness, exact selected text and actual MP4 bytes, unrelated failed response
exclusion, failed sessions, tab closure, real timeout and worker-revival cleanup.
A native permission-removal listener is captured only in the disposable worker
copy to test interruption ordering while grants remain present, modeling rapid
regrant; this is event simulation, not automated native permission-prompt coverage.
All temporary tabs and session ownership must be gone at test completion.

Default-action checks also verify one trusted activation captures all direct
media without a selection confirmation, keeps the compact panel and page focus,
deduplicates rapid/active repeat clicks, and exposes source HTTP failure without
creating a capture. Script-generated default clicks remain rejected; selection
and intentional text-only tests use Shift-click or Shift+Enter.
