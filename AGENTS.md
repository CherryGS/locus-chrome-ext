## Routed rules

- Before changing production code, tests, manifests, dependencies, generated
  layout, or source ownership, read `rules/implementation.md`.

## Git conventions

- Emoji-prefixed conventional commits: `<emoji> <type>(<scope>): <subject>`.
  - ✨ feat · 🩹 fix · ♻️ refactor · 🔧 chore · 🎨 style · ⚡ perf · ✅ test · 🏗️ build · 🚦 ci · ⏪ revert · 📝 docs
- Commit when a task goal is achieved; then verify `git status --short` is clean.
- Treat `project-doc/` as an independent local-only Git repository: commit its
  changes there, keep it free of remotes, and never stage it from the containing
  repository.

## Project authority

- Intent: `project-doc/INTENT.md`.
- Logical design contracts: `project-doc/design/`.
- Implementation discussion and settled decisions: `project-doc/implementation/`.
- Realized implementation and empirical evidence: production code, tests,
  manifests, and generated artifacts.
- Bootstrap member names, paths, and demonstration entrypoints are provisional;
  they do not define logical design contracts.

## Artifact language

- Write every agent-authored project document and passage in English.
- Preserve non-English text only as verbatim evidence, an externally defined
  literal or identifier, or required locale-specific product copy; immediately
  record an English interpretation when that evidence affects a decision.

## CodeGraph

In repositories indexed by CodeGraph, where a `.codegraph/` directory exists at
the repository root, use it before grep/find or reading code when locating or
understanding code:

- Prefer the `codegraph_explore` MCP tool when available. Name a file or symbol
  to retrieve its current line-numbered source and related call paths. If the
  tool is deferred, load it by name through tool search.
- The shell equivalent is `codegraph explore "<symbols or question>"`.
- If `.codegraph/` does not exist, skip CodeGraph entirely. Indexing is the user's
  decision.

## UI skills

- Read `.agents/skills/shadcn/SKILL.md` before working with shadcn components,
  registries, presets, or configuration. Use the project's pnpm runner for its
  CLI, and inspect current project context before changing components.

## Web-platform reference tools

- For relevant browser-platform, accessibility, UI performance, or Chrome API
  questions, consult `rules/web-guidance.md` and the project-adapted local
  Modern Web Guidance skill when useful. Use its pinned Node/pnpm runner.
  Upstream guide text does not supersede project contracts or authorize broader
  permissions, remote executable code, or unrelated publishing work.
