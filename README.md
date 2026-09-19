# Locus browser extension

A Chrome MV3 extension for manually capturing supported Twitter/X posts and
selected complete media files. Results stay in extension-origin IndexedDB until
manual clear and can be exported as a ZIP with separate files, JSON and JSONL.

Confirmed product intent lives in the independent local `project-doc/INTENT.md`.
This implementation covers bounded current Twitter source structures. Other
websites and Locus integration remain outside the current workflow.

## Workspace

- `apps/extension`: the WXT delivery root, Chrome host, and React UI.
- `packages/capture-core`: private result model and receiver serialization.
- `packages/twitter`: private Twitter source interpretation, selection, and presentation.
- `rules/implementation.md`: validated commands and implementation guidance.
- `skills-lock.json`: the preserved lockfile for the installed shadcn skill.
- `project-doc/`: a separate local Git repository, ignored by this repository.

## Development

The baseline was verified with Node.js 24.18.0 and pnpm 11.21.0.

```sh
pnpm check:deps
pnpm prepare:types
pnpm dev
```

The generated development command starts WXT's browser development workflow.
Build an unpacked Chrome MV3 extension with:

```sh
pnpm build
```

Its output is `apps/extension/.output/chrome-mv3`.

## Validation

```sh
pnpm check:deps
pnpm prepare:types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm deps:list
pnpm shadcn:info
```

Root lint and typecheck cover all three members. Tests run the independent Twitter
suite and the extension's WXT-backed suite. The packages expose explicit TypeScript
source subpaths; WXT bundles them without a separate package build or publication.
The app depends on both packages, Twitter depends on capture-core, and neither
package depends on app aliases or generated WXT types.

Standalone package checks can also run from the workspace root:

```sh
pnpm --dir packages/capture-core lint
pnpm --dir packages/capture-core typecheck
pnpm --dir packages/twitter lint
pnpm --dir packages/twitter typecheck
pnpm --dir packages/twitter test
```

Vitest covers source binding and hostile data, transactional Blob storage,
offscreen capture/clear races, native delivery reconciliation, and archive bytes.
Capture-core serialization remains exercised through the app's archive tests;
there is no empty package test suite counted as coverage.
Unit tests do not replace real Chrome lifecycle and download verification. See
`apps/extension/README.md` for loading and exercising the application.

## shadcn

The initial foundation uses Base UI, Nova styling, semantic CSS variables, and
Lucide icons. Tailwind is connected through WXT's Vite configuration and imported
by the results tab and isolated page controls. Theme variables live in
`apps/extension/assets/tailwind.css`.

WXT is reported as a manual framework by the shadcn CLI. Its official manual
configuration is in `apps/extension/components.json`; `pnpm shadcn:info` verifies
the member paths. Theme defaults are provisional, and component generation can
use the CLI without creating another Vite application.

The extension's explicit TypeScript aliases mirror WXT's defaults so both WXT
and shadcn resolve files inside `apps/extension`. Read the installed shadcn skill
before adding components or changing a preset.
