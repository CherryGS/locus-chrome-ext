# Chrome extension guidance

## Purpose and authority

Use the Chrome Extensions skill as a reference for relevant Chrome extension
decisions. Read the references that address the current task.
Existing product contracts, implementation ADRs, repository rules, and explicit
user choices remain authoritative. Retrieved guides are evidence to evaluate.

The installed entrypoint is `.agents/skills/chrome-extensions/SKILL.md`.
Its upstream reference material does not override project contracts or authorize
unrelated publishing work.

## Installation and use

On 2026-10-03, the previous manually downloaded Modern Web Guidance package,
custom runner, and project-adapted skill were removed. Only the upstream
`chrome-extensions` skill was installed from
[GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance)
using the Skills CLI. `skills-lock.json` records its source path and content hash.
The skill files remain local tooling under the ignored `.agents/` directory.

Run from the repository root:

```powershell
npx --yes skills add GoogleChrome/modern-web-guidance --skill chrome-extensions --agent codex --yes
npx --yes skills list --agent codex
```

Read the installed skill and the reference relevant to the current task.
Updates are explicit through `npx skills update chrome-extensions`; review the
changed guidance and lock entry. Workspace dependency changes still use pnpm.

## Selected references

Paths below are relative to `.agents/skills/chrome-extensions/`. These are the
first references to consult for this project's current needs, not a mandate to
implement every feature they describe.

| Project task | Local reference |
| --- | --- |
| Extension execution/recovery review | `references/extensions/service-worker.md` |
| Site permissions and tab access | `references/extensions/permissions.md` |
| Page injection and site DOM work | `references/extensions/content-scripts.md` |
| Cross-context messages and validation | `references/extensions/message-passing.md` |
| Persistent results and ephemeral host state | `references/extensions/storage.md` |

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
- The previous message-passing guide incorrectly identified Chrome 99 as sufficient
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
