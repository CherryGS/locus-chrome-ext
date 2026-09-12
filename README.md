# Locus browser extension

A design-ready WXT, React, and TypeScript workspace for Locus's browser
extension. The current application is the generated WXT React starter with
Tailwind CSS and shadcn foundations.

Confirmed product intent lives in the independent local `project-doc/INTENT.md`.
Website workflows and Locus integration are the next design handoffs.

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

Vitest is configured with WXT's plugin. No product tests exist in the bootstrap;
the test command currently allows an empty suite.

## shadcn

The initial foundation uses Base UI, Nova styling, semantic CSS variables, and
Lucide icons. Tailwind is connected through WXT's Vite configuration and imported
by the popup. Theme variables live in `apps/extension/assets/tailwind.css`.

WXT is reported as a manual framework by the shadcn CLI. Its official manual
configuration is in `apps/extension/components.json`; `pnpm shadcn:info` verifies
the member paths. Theme defaults are provisional, and component generation can
use the CLI without creating another Vite application.

The extension's explicit TypeScript aliases mirror WXT's defaults so both WXT
and shadcn resolve files inside `apps/extension`. Read the installed shadcn skill
before adding components or changing a preset.
