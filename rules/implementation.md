# Implementation rules

## Commands

Run these validated entry points from the repository root. Their underlying
arguments live in the root and extension `package.json` files.

| Command | Purpose |
| --- | --- |
| `pnpm check:deps` | Validate the frozen workspace lockfile and strict peer dependencies |
| `pnpm prepare:types` | Generate WXT TypeScript declarations |
| `pnpm lint` | Run Oxlint in check-only mode |
| `pnpm typecheck` | Run TypeScript without emitting output |
| `pnpm test` | Run Vitest with the WXT plugin; allow the bootstrap's empty suite |
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
- Keep Oxlint in check-only mode. Add executable product tests as implementation
  begins; the bootstrap's empty-suite result is not product test coverage.

## User preferences

- Use `uv run python` for Python usage.
- Prefer CodeGraph for structural and cross-file exploration, following the
  indexed-repository condition in `AGENTS.md`.
- When subagents are in use, use a 10-minute waiting timeout. This preference
  does not itself request delegation.
- Use React to work with shadcn and its related ecosystem.
