# Locus browser extension

A Chrome MV3 extension for manually capturing supported Twitter/X posts and
selected complete media files. Results stay in extension-origin IndexedDB until
manual clear and can be exported as a ZIP with separate files, JSON and JSONL.

Confirmed product intent lives in the independent local `project-doc/INTENT.md`.
This implementation covers bounded current Twitter source structures. Other
websites and Locus integration remain outside the current workflow.

## Workspace

- `apps/extension`: the browser extension member.
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

Vitest covers source binding and hostile data, transactional Blob storage,
offscreen capture/clear races, native delivery reconciliation, and archive bytes.
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
