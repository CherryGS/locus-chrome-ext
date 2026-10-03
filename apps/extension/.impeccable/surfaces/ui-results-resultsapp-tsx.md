---
version: 1
slug: "ui-results-resultsapp-tsx"
primary_target: "ui/results/ResultsApp.tsx"
related_targets: ["ui/capture/CaptureQueuePanel.tsx", "assets/tailwind.css"]
---

# Signal shelf production integration

## Scope

The user accepted the dark-only Signal shelf sample and authorized integration
into the extension's real Inbox, inspector, settings, queue and capture controls.
Reuse existing state owners and host operations. No acquisition/delivery protocol,
permissions, persistence, dependencies or supported site capabilities change.
Mode: Operate. Build path: code-first; the accepted sample is the critique reference.

## Direction contract

THESIS: Show independent acquisition, local retention and Locus saving beside
content, with supported recovery visible before opening Activity.

OWN-WORLD: Dark mineral-blue layers, yellow-green priority actions, fixed UI sans
type, flat summary rows, restrained boundaries and explicit keyboard focus.

STORY: Find retained summaries, inspect original content, distinguish three
outcomes, then explicitly export, check the original save or configure connection.
No navigation or setup creates an implicit capture or delivery attempt.

FIRST VIEWPORT: Wide 192px navigation, 352px list and flexible inspector. Below
1200px use 160px/304px. Below 960px collapse navigation; below 768px separate
list/detail, focus Back after explicit selection and return to the originating row.

FORM: Signal shelf grounded candidate 7, inherited seed `0e7c3974`, selected by
the user and accepted as dark-only. Functional
Lucide vectors; no new shipping raster. Do not carry synthetic lab controls into
production entrypoints.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification boundary

Browser tools permit only HTTP/HTTPS and blocked chrome://extensions. Local
production component previews at 127.0.0.1:5179 use disposable host/queue fixtures,
not an installed extension or live Locus receiver. Unit tests and MV3 build cover
existing modules; host Chrome/Locus end-to-end suites cannot be claimed from the
local preview. Required current captures live in .impeccable/review/signal-shelf-production.
