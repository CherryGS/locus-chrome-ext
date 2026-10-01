# Extension development and testing

For installation, capture behavior and Locus setup, start with the
[root README](../../README.md). Run the commands below from the repository root.

## Build and checks

Use the pinned Node/pnpm versions from the root README.

```sh
pnpm check:deps
pnpm prepare:types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The unpacked build is `apps/extension/.output/chrome-mv3`. The manifest retains
optional site origins, runtime content-script registration and an action that
opens the results tab. Capture-core serialization is covered by the extension's
archive tests; the site packages have their own standalone Vitest suites.

## Browser prerequisites

Set `LOCUS_CHROME_PATH` to an installed **Chrome for Testing or Chromium** binary.
The runners create disposable profiles; do not use a personal profile. Bilibili
media checks and the Locus integration suite also require `ffmpeg` and `ffprobe`
on PATH. The Locus suite additionally needs a compatible built server binary.

```powershell
$env:LOCUS_CHROME_PATH = 'C:/path/to/chrome-for-testing/chrome.exe'
pnpm build
```

The runners print their temporary evidence directory and retain screenshots,
logs, profiles and fixture files there for inspection. Test-only host grants,
transport overrides and fault injection stay in disposable copies or test pages;
they do not change production permissions or add production test hooks.

## Suites

| Command | Coverage |
| --- | --- |
| `pnpm --dir apps/extension test:browser` | Twitter source controls, optional selection, queue dispatch, retained bytes, native ZIP downloads, clear/restart races, result-page layout and Inbox interaction. |
| `pnpm --dir apps/extension test:browser:bilibili` | Video pages and homepage/favorites/search/listing cards; current-part binding, native player coexistence, offscreen assembly, packet/timing preservation, playback, ZIP bytes, partial failures and cleanup. |
| `pnpm --dir apps/extension exec node testing/inbox-ui-run.mjs` | Focused Inbox views, settings, notifications, diagnostics, keyboard/mobile interaction, clear races and historical missing-configuration staging. |
| `pnpm --dir apps/extension exec node testing/inspector-ui-run.mjs` | Preview author/original links, grouped metadata, exact JSON copying, unavailable fields/files and desktop/mobile layouts. |
| `pnpm --dir apps/extension exec node testing/queue-ui-run.mjs` | Floating button geometry, mouse/touch dragging, modal focus/scroll behavior, resize/teardown and stable newest-first task order on both sites. |
| `pnpm --dir apps/extension test:browser:locus` | Real extension-to-Locus delivery for Twitter and Bilibili, original-request continuation and failure-to-Inbox handling using a disposable server library. |

For the real Locus integration suite:

```powershell
$env:LOCUS_SERVER_PATH = 'C:/path/to/locus/server.exe'
pnpm --dir apps/extension test:browser:locus
```

The harness copies the binary and supplies a temporary library and generated
credential. It does not target the user's running server or existing library.

## Optional probes

- `LOCUS_LIVE_ACTION_PROBE=1` enables a read-only Twitter control-layout check
  during `test:browser`. It does not capture or interact with the live post;
  blocked-page outcomes are reported separately from deterministic fixtures.
- `LOCUS_BILI_REAL_VIDEO`, `LOCUS_BILI_REAL_AUDIO` and
  `LOCUS_BILI_REAL_DURATION` add local reference tracks to
  `test:browser:bilibili`. `LOCUS_BILI_SILENT_VIDEO` supplies a local silent-video
  sample. These inputs use synthetic source metadata and do not prove live
  source selection or entitlement.
- `pnpm --dir apps/extension probe:bilibili-media` runs the separate
  [encoded-track diagnostic probe](testing/bilibili-media-probe/README.md).
  It preserves codec/container comparison evidence beyond the production suite.

Never commit personal media, credentials, signed URLs, browser profiles or
runtime evidence. The checked-in [media fixtures](testing/fixtures/README.md)
are synthetic.

## What still needs manual verification

Automated suites exercise real Chrome execution, storage and downloads against
controlled source fixtures. Pre-granted test manifests and simulated removal
events do not establish native permission-prompt acceptance, denial or removal.
Verify those flows, current live-site layouts and actual Locus setup in a separate
manual session. Source/API layout changes can require new observed fixtures.

## Implementation map

- `entrypoints/`: WXT composition and runtime entry declarations.
- `host/chrome/`: browser coordination, source probes, network access, IndexedDB,
  offscreen ownership, Bilibili assembly and native ZIP delivery.
  `site-registration` handles registration and activation, `native-delivery`
  correlates browser downloads, and the offscreen-only `site-capture` adapter
  selects the concrete site producer without loading assembly into page/UI bundles.
- `host/locus/`: connection validation, external API transport and durable save
  attempt continuation.
- `ui/`: source-page controls, shared capture feedback and the results application.
  `ui/capture/` owns the common task store, queue, launcher position and batched
  passive status lookup. Site modules own native page mounting and selection UI.
  Result navigation, permissions, preview, metadata, activity and clear confirmation
  have separate modules; every surface shares capture and local-storage badges.
  `RecordPreview` owns shared author/title/body/context slots for Twitter and
  Bilibili. `record-presentation` maps their existing package projections into
  these slots and metadata fields; adapters supply data rather than markup or
  styles. Add site-specific display data there so both consumers keep one layout.
  The inspector toolbar groups capture status beneath the title; status links
  open Activity, which owns explanations, continuation actions and diagnostics.
  Settings at the sidebar's bottom opens one modal for the Locus connection,
  website access and appearance; no global workspace header is needed.
- `components/ui/`: app-used shadcn/Base UI primitives.
- `testing/`: browser runners and synthetic fixtures; unit tests live beside code.

Repository-wide constraints and maintained command entrypoints live in
[`rules/implementation.md`](../../rules/implementation.md). Browser-platform
references and project-specific corrections live in
[`rules/web-guidance.md`](../../rules/web-guidance.md).
