# Locus capture

A Chrome MV3 extension that captures selected Twitter/X posts and Bilibili videos,
saves complete captures to a local Locus instance, and keeps a local copy for
inspection and ZIP export.

## Supported capture

| Site | Entry point | Captured content |
| --- | --- | --- |
| Twitter / X | Capture icon in a post's action row | Post text and directly attached images, videos or animations. Shift-click or Shift+Enter opens media selection, including text-only capture. |
| Bilibili | Ordinary video pages and video cards on the homepage, favorites, search and other supported listings | The selected video part, parent metadata and cover. A card without a part number selects P1. Video and audio are assembled without re-encoding; verified silent videos are supported. |

Capture starts only through an explicit user action. Unsupported source layouts,
missing files and access failures remain visible; partial content can be retained
and exported but is not sent to Locus. Other websites and Bilibili live/programme
content are not supported. Saved status describes this extension's capture
history, not a live search of the Locus library.

## Build and install

Use **Node.js 24.18.0**, **pnpm 11.21.0**, and **Chrome 116 or newer**.

```sh
pnpm check:deps
pnpm prepare:types
pnpm build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select `apps/extension/.output/chrome-mv3`.
3. Click the extension action to open the results page.
4. Choose **Enable Twitter** or **Enable Bilibili** and grant that site's access.

After updating the build, reload the extension and refresh source pages. If an
update adds a site origin, choose **Enable Bilibili** again to grant it. Search
cards require access to `search.bilibili.com`.

## Connect to Locus

Open **Locus settings** in the extension. Enter the active
`http://127.0.0.1:port` address and Token from Locus Settings, then choose
**Connect and save**. Connection setup requests optional loopback access and
verifies the credential. The Token stays in extension storage and is not exposed
to source pages.

New complete Twitter and Bilibili captures automatically continue to Locus.
**Saved to Locus** means the receiver confirmed the complete import; local
retention or a successful file upload alone does not mean the save succeeded.

Without connection settings, complete captures remain **Staged locally**. Open
their Inbox entry, configure Locus and choose **Continue save**. Changing settings
does not automatically send old content. Captures created without a delivery
attempt retain their local inspection and export behavior.

For interrupted or uncertain delivery, **Check original save** or **Check and
continue save** inspects the existing attempt without repeating confirmed
uploads. An unresolved attempt from an earlier Locus server run cannot silently
resume against a new run.

## Queue and local library

- The draggable floating task button shows counts and opens a modal queue.
  Newest tasks appear first, and progress changes do not reorder them. Closing
  the modal or source page does not cancel accepted captures.
- The results page opens in **Inbox** for staged captures and items needing
  attention. **In progress**, **Saved**, and **All captures** provide the other
  views. Search filters summary fields, not file contents.
- **Preview**, **Metadata**, and **Activity** separate captured content from
  acquisition, retention and delivery outcomes. Technical diagnostics can be
  expanded and copied.
- **Export ZIP** / **Export available content** writes `metadata.json`,
  `records.jsonl` and acquired files. Chrome reports the actual download outcome.
- **Clear result** requires confirmation and removes the extension's retained
  copy. It does not delete exported files or data already saved to Locus.

Retained results survive browser restarts until explicitly cleared. Restarting
does not resume downloads automatically. Removing site access interrupts that
site's work; granting it again does not replay interrupted tasks. Storage and
source limits are reported as failures, not hidden by automatic deletion.

## Development

```sh
pnpm dev        # WXT development workflow
pnpm build      # Production unpacked extension
pnpm zip        # Package the extension
```

```text
apps/extension/        WXT entrypoints, Chrome host, Locus transport and React UI
packages/capture-core/ Site-independent result model, diagnostics and serialization
packages/twitter/      Twitter source interpretation, selection and Locus mapping
packages/bilibili/      Bilibili part binding, source interpretation and Locus mapping
rules/                 Repository implementation and web-platform guidance
```

The app consumes private TypeScript workspace packages through explicit export
subpaths. Site packages depend on capture-core; they do not import Chrome APIs,
React or application code. WXT bundles the packages directly.

The UI uses shadcn/Base UI, Tailwind CSS and Lucide icons. Theme variables live in
`apps/extension/assets/tailwind.css`. Run `pnpm shadcn:info` to inspect the member's
manual WXT setup before generating components. The checked-in UI modules retain
only the primitives used by this app; regenerate additional components when needed.

`project-doc/` is an ignored, independent local Git repository for intent, design
and implementation decisions. It is not required to build a checkout.

## Verification

```sh
pnpm check:deps
pnpm prepare:types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These checks cover all workspace members, including source parsing, storage,
queue/clear races, delivery state and archive bytes. Browser tests use disposable
profiles and exercise the production extension. See the
[extension testing guide](apps/extension/README.md) for prerequisites, commands,
coverage and optional media probes.

## Permissions and licenses

Source access is optional and scoped to the supported Twitter/Bilibili pages and
media hosts. The extension also uses Chrome facilities for scripting, offscreen
execution, downloads, storage, alarms and scoped Bilibili request headers. The
[WXT manifest configuration](apps/extension/wxt.config.ts) lists the exact grants.
No site content scripts are installed until the corresponding access is enabled.

Mediabunny runs only in the offscreen Bilibili assembly path. Its MPL-2.0 license
and notices ship in the extension's
[licenses directory](apps/extension/public/licenses/NOTICE.txt).
