# Locus capture

<!-- impeccable:product-schema 1 -->

## Platform

web

## Context and Authority

This is Impeccable's product context for the Chrome extension in
`apps/extension`, including its results workspace and webpage capture controls.
It summarizes existing project evidence and the user's confirmed product
positioning. It does not establish new capabilities or replace project authority.

The authoritative intent is [project-doc/INTENT.md](../../project-doc/INTENT.md).
Logical contracts live in [project-doc/design](../../project-doc/design/), and
settled implementation decisions live in
[project-doc/implementation](../../project-doc/implementation/). Production code,
tests and generated artifacts establish realized behavior. `project-doc/` is an
independent, local-only repository and may be absent from other checkouts; use the
[root README](../../README.md) for the checked-in description of current behavior.
Treat conflicts or undocumented capability changes as unresolved rather than
silently rewriting these contracts.

## Users

The primary user is the project owner, using the extension personally with their
local Locus instance. The user confirmed this positioning during initialization.
The immediate job is to save selected webpage media and accompanying content,
inspect retained captures, and handle staging or failed saves while browsing.
Broader distribution and onboarding for other users are not established goals.

## Product Purpose

Connect webpage browsing with Locus, a general-purpose personal CMS, to reduce
manual downloading, moving files and entering source information. A user starts
one explicit capture, complete content continues to Locus when configured, and
the extension provides a retained local result for inspection and export.

Success means preserving the intended content and its source associations,
truthfully reporting capture and save outcomes, and giving the user a supported
next action when the workflow cannot complete.

## Operating Context

- Capture starts from supported Twitter/X posts or Bilibili video surfaces while
  the user browses those sites. Site access is explicitly enabled by the user.
- The trusted extension results page provides Inbox, In progress, Saved and All
  captures, plus content inspection, metadata, activity, export and manual clear.
- Inbox is the default staging and attention view of existing result state; it
  is not a separate copy, upload target or Locus-side queue.
- Locus connection setup is explicitly opened within the extension. Credentials
  remain in extension storage and are not exposed to source pages.
- A webpage task launcher opens the queue only on explicit activation. Background
  updates preserve browsing context and do not open tabs or modals or steal focus.

## Capabilities and Constraints

### Current implementation

- Twitter/X capture preserves post text and all directly attached media through
  one explicit activation, without a separate media-picking step. A post with no
  attachments still captures text and metadata.
- Bilibili capture preserves the selected video part, parent metadata and cover
  on supported ordinary-video pages and listings. It assembles available video
  and audio without re-encoding; unsupported source types remain unsupported.
- Complete new captures can continue automatically to the configured local Locus
  instance as part of the explicitly initiated capture workflow.
- Acquisition, durable local retention and Locus delivery are independent
  outcomes. A preview or local copy is not proof of successful Locus saving;
  saving requires receiver confirmation of the complete import.
- Partial captures identify missing portions and support inspection/export of
  available content. Partial content is not sent to Locus.
- Missing initial connection configuration is an informational staging
  prerequisite, distinct from capture, storage or transport failure.
- Supported continuation checks the original delivery attempt and its request
  identities. Opening Inbox or changing configuration does not automatically
  replay old work. Legacy captures without a delivery attempt gain no implied
  retroactive-send capability.
- Successfully retained results survive browser restarts until explicit manual
  clear. Pending or failed retention must not promise recovery. Restart does not
  automatically resume downloads.
- Clear requires confirmation for its named target and removes the extension's
  local copy, without deleting exported files or accepted Locus content.
- Current saved-status feedback reflects extension capture history; it is not
  a live lookup of the Locus library.

### Product direction and open scope

The intent also identifies Pixiv and Civitai as website contexts, Civitai model
file capture, and contextual Locus information such as saved Twitter messages
and locally available models. These directions are not claims of current
implementation. Their remaining site formats, integration and identification
questions stay with the relevant project contracts. A future Twitter
modification-state distinction is deferred and has no settled meaning here.

## Brand Commitments

Use the existing product name, **Locus capture**, and established terminology
for Locus, Inbox, staging, capture, retention, saving and export. Product copy
must distinguish these outcomes without inventing capabilities or guarantees.
No new brand positioning, visual identity or marketing claims were established
by this initialization.

## Evidence on Hand

- [Root README](../../README.md): current capture scope, installation, connection,
  result handling and limitations.
- [Extension development guide](README.md): runnable workflows and browser suites,
  including Inbox, inspector and queue coverage with retained screenshot evidence.
- [Interaction architecture](../../project-doc/design/webui/architecture/summary.md)
  and [Inbox refinement](../../project-doc/design/webui/architecture/topics/inbox-experience.md):
  confirmed tasks, state distinctions and interaction constraints.
- [Locus delivery contract](../../project-doc/design/standard/locus-integration/summary.md)
  and [result contract](../../project-doc/design/standard/extraction-result/summary.md):
  delivery, retention, recovery and clear semantics.
- [App manifest](package.json), [WXT configuration](wxt.config.ts), existing UI and
  tests: implementation evidence. The development entry point is `pnpm dev` from
  the repository root; runtime UI inspection uses the extension workflow.
- User confirmation: personal use is the primary audience. No customer research,
  testimonials or performance claims were supplied for this initialization.

## Product Principles

1. Preserve explicit user control over capture, site access and destructive clear.
2. Report acquisition, retention and Locus delivery truth separately.
3. Keep persistent problems and supported next actions discoverable on the
   affected result after transient notifications disappear.
4. Preserve selected content, inspected-result identity and browsing context
   across supported state changes.
5. Reduce manual saving work without inventing retries, synchronization or other
   capabilities beyond the confirmed contracts.

## Accessibility and Inclusion

Existing interaction contracts require usable keyboard operation, appropriate
focus return and narrow-screen navigation. Background updates must not hijack
text input, media controls or modal interaction. Queue opening must remain
available through keyboard activation as well as pointer interaction.
