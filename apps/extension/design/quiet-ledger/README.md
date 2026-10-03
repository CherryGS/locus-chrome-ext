# Quiet ledger comparison sample

An independent mock UI designed using the installed ui-ux-pro-max search workflow.
It is an alternative for comparison, not the adopted production design. Signal
shelf and the extension's DESIGN.md remain the existing baseline.

## Run

From the repository root, run both loopback servers in separate terminals:

```sh
pnpm --dir apps/extension exec vite --config design/signal-shelf/vite.config.ts
pnpm --dir apps/extension exec vite --config design/quiet-ledger/vite.config.ts
```

Open http://127.0.0.1:5180/ for Quiet ledger, or
http://127.0.0.1:5180/comparison.html for two interactive panes. Compare state
loads the same record/scenario into both. Each iframe uses its real viewport
width; Open separately allows full-width inspection. On small screens the
comparison panes stack vertically.

Both designs import the exact eight records and their view membership from
`../shared/sample-data.ts`. Shared primitives and content are held constant;
layout, density, palette and hierarchy differ. Selection is synchronous with
no decorative loading wait. Native networking, media acquisition, credentials,
receiver saves and file exports are outside this sample. Clear only removes an
in-memory synthetic record; changing Example resets it. Settings is read-only.

## Design reasoning

The verified parts of the local search recommendation were Flat Design,
productivity-tool teal plus orange, a sans-serif type system and dense spacing.
The generator also returned a marketing/demo page structure and light color
surfaces despite the dark-only requirement. Those recommendations were rejected
as inappropriate for an installed-extension Inbox. The first broad search had
also returned a news palette; a single narrower retry improved product relevance.
There was no verified full-system match to adopt verbatim or persist as authority.

The implemented adaptation uses charcoal surfaces, a light warm-orange primary
action and a light teal location/selection cue. Independent capture/local/Locus
facts retain the same labels, icons and meaning. Reading text is 17px/1.85;
tool labels are 13–14px and secondary metadata 11px. Inter is the recommended
family, with Segoe UI/system fallbacks and no remote font dependency.

Top navigation replaces the rail. A 330px list leaves more width for reading;
at wide widths the next-step guidance sits beside content. Below 1240px it moves
above the reader. Below 768px, explicit list/detail Back navigation restores
focus. Clear initially focuses Cancel. Search matches label/source URL, and
Preview/Metadata/Activity remain discoverable through the existing tab primitive.
Closing overlays restores the initiating control or the remaining list's search
after a sample clear. Review save options explicitly focuses and reveals Activity.

This is a comparison of skill-assisted workflows with human judgment and shared
project constraints, not a controlled blind experiment or an automatic design
output. Screenshot review and measured contrast establish only their tested scope.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm --dir apps/extension exec vite build --config design/signal-shelf/vite.config.ts
pnpm --dir apps/extension exec vite build --config design/quiet-ledger/vite.config.ts
```

Generated output is ignored under `.impeccable/design-build/`. Servers deny
Markdown, environment, Git and Impeccable evidence files. No new dependency,
manifest change or production entrypoint is required.
