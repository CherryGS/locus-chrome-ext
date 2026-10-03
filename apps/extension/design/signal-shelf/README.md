# Signal shelf design sample

An interactive specification sample for the selected extension-wide visual
direction. It uses the extension's installed React, shadcn/Base UI and Lucide
components with an isolated proposed theme. Production UI and Chrome/Locus
behavior are not replaced by this sample.

## Run

From the repository root:

```sh
pnpm --dir apps/extension exec vite --config design/signal-shelf/vite.config.ts
```

Open `http://127.0.0.1:5178/`. Stop the foreground process with Ctrl+C. The server
binds only to loopback and blocks Markdown, Impeccable context, environment and
Git files. The HTML entry and its styles contain no direction contract.

## Review

- Use Inbox sample and Component sheet to compare full-context and reusable
  examples. The sample uses the selected dark-only palette with no theme switch.
- Use Example to inspect normal, empty and loading collection states.
- Choose a capture to see independent Capture, Local copy and Locus save facts.
  Preview keeps the content readable; Metadata and Activity expose detail.
- Test narrow list/detail navigation with Arrow keys and Enter, then Back.
- Open connection settings, queue and named clear confirmation to inspect overlays.
  Read-only settings and disabled connection submission keep real credentials out.
- Export and continuation buttons explain their sample-only boundary. Clear changes
  only the in-memory synthetic example; resetting Example restores it.

All records, labels, URLs and progress values are synthetic demonstration data.
Source links are illustrative external navigation, not proof of a valid real post.
No media is acquired, no result is persisted and no receiver request is sent.

## Build and checks

```sh
pnpm typecheck
pnpm lint
pnpm --dir apps/extension exec vite build --config design/signal-shelf/vite.config.ts
```

Build output is generated under the ignored `.impeccable/design-build/` directory.
Local review evidence lives under the ignored `.impeccable/review/signal-shelf/`.
The shared source of the proposed palette and layout is `styles.css`. The reviewed
specification is documented in the app's `DESIGN.md` and `.impeccable/design.json`.

Production integration should translate this reviewed design into existing
components and state owners. Do not copy the synthetic records, mock controls or
design-toolbar scenarios into the production extension.
