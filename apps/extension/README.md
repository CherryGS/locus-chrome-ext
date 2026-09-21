# Locus capture extension

Run root workspace commands with Node.js 24 and pnpm 11.21.0. `pnpm build`
produces `apps/extension/.output/chrome-mv3`. Load that directory with **Load unpacked** in
`chrome://extensions` using a disposable Chrome profile (Chrome 116 or newer).
For automated sideloading, use Chromium or Chrome for Testing; normal current
Chrome does not support the same command-line sideload flags. Never point a test
runner at a personal browser profile.

## Use

1. Click the extension action to open **Locus results**.
2. Choose **Enable Twitter** or **Enable Bilibili** and grant the declared origins for that site.
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

Removing host permissions for a site interrupts its active and waiting work; regranting
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

### Technical diagnostics by default

Queue items and result failures display their technical report without a separate
debug toggle. A partial capture includes the reason for each unavailable record
or asset, even when the remaining portions are retained successfully. Copy
diagnostic copies the visible report with its result/source/portion correlation.
Long reports scroll inside the existing nonmodal panel.

New failures include a code, execution stage, selected parameters, measured values,
capability limits and available cause frames. HTTP reports distinguish declared
and received byte limits, response status and truncated bodies. Bilibili video
reports include selected and observed codecs/dimensions, color/aspect/rotation,
expected and measured track durations, packet counts and output bounds. The report
is stored in the existing unavailable reason and exported in JSON/JSONL; historical
results show their original reason rather than invented retrospective evidence.
Reports are bounded and remove credentials, signed URL queries and sensitive
context keys. No remote logging or additional permission is needed.

### Bilibili current-part capture

Choose **Enable Bilibili** in the library and grant its separate optional origins:
`www.bilibili.com`, `space.bilibili.com`, `api.bilibili.com`, `*.bilivideo.com`, and
`*.hdslb.com` over HTTPS. After upgrading from detail-only capture, choose Enable
Bilibili again to grant the added optional space origin. Ordinary video cards on
the homepage and favorites page expose a 28-pixel capture icon at the cover's
upper left on hover or keyboard focus. Known saved/pending/problem states remain
visible. The card's link selects the part, defaulting to P1 when unspecified;
programme/live cards and ambiguous links do not get controls. Favorites batch
selection temporarily takes precedence in that corner. The native cover link and
Watch later action retain their behavior.

On an ordinary `/video/BV…` page, the native-styled capture action near
Favorite/Share starts the current part immediately. It remains the fifth action
in the native left group, with the same slot spacing, icon box and label font.
Its visible localized label always means Import. A small corner marker indicates
queued, saved, partial or attention states without changing the action's layout.
The selected P and complete status remain in the hover hint and accessible
name/description. Cover controls reuse the queue's smaller state icons.
Both entry surfaces use the same dark, nonmodal queue and explicit
Open result action. Changing parts affects only the next capture. Other parts,
collections, comments, subtitles and programme/live products are not captured.

On detail pages, UI mounting waits for Bilibili's native player container and
removal of the app's `data-server-rendered` marker before touching its toolbar.
Neither `document_idle` nor the player shell alone proves the
asynchronously loaded site application is ready. The observer also defers new
detail controls while the native player is absent during navigation, and site
access withdrawal cancels an outstanding mount. Native playback and P switching
remain page-owned.

The current browser session is required. A nonce-bound inactive source tab observes
the initial JSON assignments at document start, including removed scripts, and
makes one fixed credentialed nav request in that page. Only session success/login
Boolean and selected source facts cross the bridge. Root BV/P/CID must match the
selected pages entry; the parent's first-part CID is not substituted for P2.
Known tracking parameters are discarded from canonical selection identity.
Source script text is parsed as bounded JSON and never evaluated.

Metadata preserves full verified description segments and line breaks, uploader,
parent and selected-part identifiers, publication/observation times and known
quality facts. Unverified precise duration falls back to explicitly coarse part
duration. Video, parent cover and metadata have independent outcomes. A missing
audio track, unsupported source or metadata limitation remains partial; it does
not remove an expected portion. The preview presents video before cover.

The first media route supports complete AVC/AAC MP4 tracks with known BT.709
limited-range color and no rotation, flipping or clean-aperture cropping. Square
and non-square pixels retain the exact MP4 sample-entry aspect ratio, with bounded
integer display-aspect fields. It chooses an actual supplied
AVC representation using agreeing source quality order and dimensions, then
validates the downloaded configuration/dimensions. Advertised-only quality is not
claimed; failed chosen media does not silently fall back. AV1/HEVC/HDR, unverified
source paths, missing audio, unknown color and unqualified transforms remain video
limitations. Unknown-color and AV1 configuration normalization observed in the
isolated feasibility probe are deliberately excluded from production support.

Mediabunny 1.58.1 copies encoded packets only in the offscreen owner. Detached
configuration/color snapshots and a reopened output verify packet hashes/counts,
presentation timestamps, duration and configuration before acquired success.
An independent, bounded MP4 box reader compares the source and output `pasp`
ratios exactly; the library's rounded display dimensions are not used as a
substitute for the original ratio. Encoded AVC configuration remains unchanged.
Measured quantization up to 2 ms and constant reconstructed decode origin are
allowed; no transcoding or deliberately shortened file is produced. Its MPL-2.0
license is shipped under `licenses/Mediabunny-MPL-2.0.txt`.

Limits are 64 MiB per input track, 160 MiB assembled output, 320 MiB cumulative
output writes, 600 seconds and 100,000 packets per track. Each Bilibili asset has a
120-second fetch/assembly deadline. One Bilibili preparation/assembly runs at a time
inside the existing two-running/twenty-waiting queue. Admission reserves 1 GiB for
its bounded working buffers, 256 MiB per active Twitter acquisition, and counts
live result Blobs against a 1.5 GiB owner admission budget. These are conservative
reservations, not measured usage or an unlimited-memory promise. Memory/storage
failures preserve independent usable content and expose the failure.

Only validated CDN URLs receive an exact-URL/host/extension-initiator GET session
rule setting `Referer: https://www.bilibili.com/`. CDN fetches omit credentials and
refuse redirects; cookies/auth headers are never copied. `declarativeNetRequestWithHostAccess`
and `alarms` provide scoped leases and cleanup. A one-minute alarm exists only while
leases remain, with its cadence preserved on traffic/worker wake. Reconciliation
keeps a surviving owner's actual fetch, removes lost/revoked ownership, and bounds
unverified leases. Signed query strings remain private ephemeral operation inputs,
not retained result metadata. Source cover HTTP is upgraded only for verified
hdslb cover paths; no HTTP host grant is added.

Track selection considers source-supplied `backupUrl` / `backup_url` mirrors when
the primary uses an unsupported CDN origin or port. Every supplied location must
bind the same CID and representation path; only an HTTPS `*.bilivideo.com` URL
with the approved path and no custom port can be fetched. MCDN's `/v1/resource/`
prefix is recognized solely for identity comparison. This does not widen host
access, rewrite a signed address, substitute another quality, or retry failed
network downloads through arbitrary mirrors.

Track filenames may carry one opaque suffix containing 1–32 ASCII letters or
digits, such as `CID_t6-1-30080.m4s` or `CID_qe1-1-30080.m4s`.
The directory CID and filename CID must both equal the selected part CID. The
suffix stays in the exact request and retained source path, and mirrors with
different suffixes remain different representations. Unsupported path grammar
and mismatched CIDs have distinct diagnostic codes with the relevant path and IDs.

Withdrawing one site's permission interrupts its old work even after rapid regrant,
without cancelling the other site or waiting behind its source inspection. Regrant
never resumes old downloads. Clear and retained-result semantics stay common.

### Twitter source scope

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

`packages/capture-core` owns site-opaque state, serialization and sanitized
diagnostic formatting, exposed as `@locus/capture-core/model`, `/serialization`
and `/diagnostics`. `packages/twitter` owns source
meaning through explicit `@locus/twitter` subpaths: `/urls`, `/relay-parser`,
`/source`, `/authenticated-projection`, `/authenticated-source`, and `/presentation`.
These private TypeScript source packages use local imports internally and public
exports across members. Twitter depends on capture-core; neither imports the app.
The lightweight authenticated projection does not load the Acorn parser.
`packages/bilibili` exposes `/urls`, `/projection`, `/source` and `/presentation`;
it depends only on capture-core. Host composition uses an explicit two-site union,
without a plugin registry or a storage schema migration.

Within this app, `host/chrome` owns IndexedDB, network, execution and native APIs;
`ui` consumes those capabilities. WXT entrypoints contain only wiring. Runtime
content registration is intentionally declared without WXT `matches` because
WXT otherwise adds required host permissions; the coordinator registers matches
only after checking actual optional grants.

Run `pnpm check:deps`, `pnpm prepare:types`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and `pnpm build` from the workspace root. Lint and strict typechecking
cover all members. Site source tests run independently in their packages;
the extension's tests retain storage, execution, and archive/serialization coverage.
Package lint/typecheck also run from either package directory, and `pnpm test`
inside `packages/twitter` needs no WXT aliases or generated configuration.
Build, development, ZIP packaging, and type generation remain WXT app commands.
Test fixtures are explicitly
synthetic and disposable. The built manifest must have optional site origins,
no required site host access, no static content scripts, an action without a
popup, and the declared host-facility permissions. The two Twitter runtime probe
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

## Bilibili production browser regression

After a normal build, run `pnpm --dir apps/extension test:browser:bilibili` with
the same `LOCUS_CHROME_PATH`. It loads a disposable copy of the actual production
extension and pre-grants hosts only in that test copy. Synthetic ordinary-video
HTML removes its initial-state script, supplies distinct P1/P2 CIDs, and returns a
bounded login response. Actual offscreen AVC/AAC assembly, closed-owner Blob
reopening, playback, native ZIP completion and independent packet/configuration
comparisons use locally generated fixtures. Non-square fixtures include
1920x1070 at SAR 1070:1071 and 320x180 at SAR 1001:1000, which would disappear
through integer-dimension rounding. Their ZIP files undergo independent FFprobe
SAR/DAR, configuration and complete packet/timing comparison, Chrome display-size
and start/middle/end playback checks, and full FFmpeg decoding.
Missing audio, truncation, oversize,
metadata partials, explicit clear, and simulated withdrawal/rapid regrant stay
separate checks. The simulation does not claim native permission-prompt coverage.

Optional real media through the same production byte path:

```powershell
$env:LOCUS_BILI_REAL_VIDEO = 'C:/temporary-inputs/avc-video.m4s'
$env:LOCUS_BILI_REAL_AUDIO = 'C:/temporary-inputs/audio.m4s'
$env:LOCUS_BILI_REAL_DURATION = '182.461'
pnpm --dir apps/extension test:browser:bilibili
```

These local files are associated with synthetic page/source fixtures for execution
verification; they do not prove current signed-in source selection. Real-profile
acceptance remains separate and uses supported browser tools. No private URLs or
real media are committed. Evidence directories are retained for review.
The independent Chrome 116 media probe verified encoded assembly, storage,
archive bytes and full external decode; that old CfT binary lacked AVC/AAC browser
decoders. That observation does not raise the product floor or claim old-CfT
playback support. Current CfT153 validates browser playback as well.

Default-action checks also verify one trusted activation captures all direct
media without a selection confirmation, keeps the compact panel and page focus,
deduplicates rapid/active repeat clicks, and exposes source HTTP failure without
creating a capture. Script-generated default clicks remain rejected; selection
and intentional text-only tests use Shift-click or Shift+Enter.
