# Local web-platform guidance

## Purpose and authority

Use Modern Web Guidance as a reference for relevant browser-platform, accessible
interaction, rendering-performance, and Chrome extension decisions. Consult it
when it can improve the task; querying it is not a required prelude to every edit.
Existing product contracts, implementation ADRs, repository rules, and explicit
user choices remain authoritative. Retrieved guides are evidence to evaluate.

The project-adapted entrypoint is
`.agents/skills/modern-web-guidance/SKILL.md`. The unmodified upstream skill files
are retained in the downloaded package for attribution and inspection; their
blanket workflow requirements are not adopted as project rules.

## Download and use

On 2026-09-20, npm's `latest` resolved to **0.0.189**. The official archive was
downloaded directly, verified against the registry's SHA-512 integrity value,
and extracted under `.agents/tools/modern-web-guidance/0.0.189/package`.
Its CLI, guides, model assets, Apache-2.0 license, and third-party notices remain
together. The archive and `.agents/tools/modern-web-guidance/source.json` retain
the provenance. These files are local tooling under the already-ignored
`.agents/` directory, not extension runtime dependencies or bundled assets.

- Archive: <https://registry.npmjs.org/modern-web-guidance/-/modern-web-guidance-0.0.189.tgz>
- Integrity: `sha512-5z7eMyacD6An4auSnP74xVR17MHdpbBEmzfWGAedGoKFa9lq8XxN6wrX+Ba+fuqhR8NHThC0eRlbrnnQdpVPEg==`
- Upstream project: <https://github.com/GoogleChrome/modern-web-guidance>

Run from the repository root:

```powershell
pnpm exec node .agents/tools/modern-web-guidance/run.mjs search "accessible status updates"
pnpm exec node .agents/tools/modern-web-guidance/run.mjs retrieve "accessibility,defer-rendering-heavy-content"
pnpm exec node .agents/tools/modern-web-guidance/run.mjs list
```

The runner executes the local CLI through Node, sets `DISABLE_TELEMETRY=1` for
that process, and permits only query/help/version commands. It avoids the npm/npx
installation path and does not change the user's shell profile. Node 20 or newer
is required; the project's Node 24 environment satisfies that requirement.

Updates are explicit: download another identified version, verify its registry
integrity and archive paths, review the adopted references, then update the local
runner and this record. Do not silently replace the pinned copy with `latest`.

## Selected references

Paths below are relative to the downloaded `package/` directory. These are the
first references to consult for this project's current needs, not a mandate to
implement every feature they describe.

| Project task | Local reference |
| --- | --- |
| Keyboard access, focus, and readable status | `skills/modern-web-guidance/guides/accessibility/accessibility.md` |
| Large result lists and heavy previews | `skills/modern-web-guidance/guides/performance/defer-rendering-heavy-content.md` |
| Expensive parsing/rendering and responsive interaction | `skills/modern-web-guidance/guides/performance/break-up-long-tasks.md` |
| Platform feature loading and bundle boundaries | `skills/modern-web-guidance/guides/performance/conditional-async-dependencies.md` |
| Extension execution/recovery review | `skills/chrome-extensions/references/extensions/service-worker.md` |
| Site permissions and tab access | `skills/chrome-extensions/references/extensions/permissions.md` |
| Page injection and site DOM work | `skills/chrome-extensions/references/extensions/content-scripts.md` |
| Cross-context messages and validation | `skills/chrome-extensions/references/extensions/message-passing.md` |
| Persistent results and ephemeral host state | `skills/chrome-extensions/references/extensions/storage.md` |

## Application boundaries and corrections

- Use the actual `minimum_chrome_version` in `apps/extension/wxt.config.ts`
  (currently 116). A guide's Baseline label is not proof of support at that floor.
  Verify API availability and each execution context before adopting it.
- Existing shadcn/Base UI composition, semantic colors, and dark theme remain the
  component conventions. The draggable webpage queue launcher opens a modal only
  through explicit activation. The separate Twitter media-selection draft stays
  nonmodal; background status updates never open a modal or move focus.
- Do not add `tabs` permission merely because code reads `tab.url`. Matching host
  permissions can authorize access to the relevant tab fields. Preserve scoped,
  optional website grants. See the [official Tabs API permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions).
- Do not copy the scheduler guide's remotely loaded CDN polyfill into the
  extension. Any required executable fallback belongs in the local build. See
  [Chrome's remote hosted code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).
- Worker memory can hold reconstructible coordination, locks, and pending
  promises. It must not be the sole authority for durable results or recoverable
  ownership. Use persisted evidence and reconciliation; a blanket ban on all
  variables or all short-lived timers is not the project's lifecycle contract.
- Syntax preferences such as banning all `.then()` chains are not adopted.
  Keep the implementation's sequencing, error handling, and cancellation clear.
- The pinned message-passing guide incorrectly identifies Chrome 99 as sufficient
  for returning a Promise directly from a native `runtime.onMessage` listener.
  The [official response documentation](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#responses),
  checked on 2026-09-20, describes a gradual Chrome 148 rollout. At this project's
  Chrome 116 floor, keep `sendResponse` with a literal `return true` for asynchronous
  native listeners. Sender-side Promise support does not establish listener-side
  Promise support.
- Chrome API claims are checked against official documentation and actual
  browser behavior. Site response formats, source identity, and media ownership
  still require real source evidence and focused regression tests.
- Chrome Web Store metadata and privacy/publishing documents are outside the
  current task. Do not create them merely because the upstream skill discusses
  publishing.
