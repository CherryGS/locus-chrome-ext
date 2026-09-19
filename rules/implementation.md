# Implementation rules

## Commands

Run these validated entry points from the repository root. Their underlying
arguments live in the root and workspace members' `package.json` files.

| Command | Purpose |
| --- | --- |
| `pnpm check:deps` | Validate the frozen workspace lockfile and strict peer dependencies |
| `pnpm prepare:types` | Generate WXT TypeScript declarations |
| `pnpm lint` | Run Oxlint in check-only mode across all members |
| `pnpm typecheck` | Strictly check all members without emitting output |
| `pnpm test` | Run Twitter's standalone Vitest suite and the app's WXT-backed suite |
| `pnpm build` | Build the Chrome MV3 extension |
| `pnpm deps:list` | Inspect resolved workspace dependencies |
| `pnpm shadcn:info` | Inspect the extension's shadcn configuration and resolved paths |

The baseline was verified with Node.js 24.18.0 and pnpm 11.21.0. The root manifest
pins pnpm and reports a mismatch instead of downloading another version.

## General rules

- Keep files that serve as module indexes or aggregation roots limited to module
  declarations, API re-exports, and dependency or composition wiring. Put product
  and domain behavior in the modules they expose.

## Domain rules

- Configure extension entrypoints through WXT and Vite plugins through
  `apps/extension/wxt.config.ts`. Treat the generated starter as a provisional
  delivery shell; product responsibilities come from the design contracts.
- Keep site-opaque result semantics and serialization in `packages/capture-core`,
  and Twitter source interpretation, selection, and presentation in
  `packages/twitter`. Chrome host execution, storage, byte access, and UI remain
  in `apps/extension`.
- Use declared package export subpaths across workspace members. The app depends
  on both packages; Twitter depends on capture-core. Packages must not depend on
  application source, aliases, generated WXT configuration, React, or Chrome APIs.
  Keep authenticated projection usable without loading the Relay parser.
- Private packages expose TypeScript source for WXT to bundle. Their `lint` and
  `typecheck` scripts run independently from each package directory. Twitter's
  `test` script runs without WXT; capture-core serialization is covered by the
  app's archive tests. Do not add empty test scripts as coverage evidence.
- Keep shadcn aliases in `components.json` aligned with the explicit paths in
  the extension's `tsconfig.json`. Verify that all CLI output paths stay inside
  the extension member before generating files.
- WXT requires shadcn's manual project setup. Run component operations with the
  pnpm runner and an explicit member working directory; do not create a second
  application just to satisfy framework detection.
- Read the installed shadcn skill, inspect project context, and retrieve component
  documentation before adding or using components. Generate source through the
  CLI, inspect added files, and prefer existing components and built-in variants.
- Keep theme variables in the CSS file identified by shadcn project context.
  Use semantic tokens and the `cn` helper; keep component layout separate from
  theme customization, following the installed skill's composition rules.
- Keep Oxlint in check-only mode and retain meaningful executable coverage across
  package and application consumers.

## User preferences

- Use `uv run python` for Python usage.
- Prefer CodeGraph for structural and cross-file exploration, following the
  indexed-repository condition in `AGENTS.md`.
- When subagents are in use, use a 10-minute waiting timeout. This preference
  does not itself request delegation.
- Use React to work with shadcn and its related ecosystem.
