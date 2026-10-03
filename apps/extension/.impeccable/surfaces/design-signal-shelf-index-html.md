---
version: 1
slug: "design-signal-shelf-index-html"
primary_target: "design/signal-shelf/index.html"
related_targets: ["ui/results/ResultsApp.tsx"]
---

# Signal shelf sample

## Scope

An interactive design sample and extension-wide specification, not a replacement
for the production extension. The user selected Signal shelf in chat and on the
direction board. Build path: code-first. Mode: Operate. Use synthetic records only.
The shared system reaches Inbox, detail, settings, queue and source-page controls.
Preserve the existing product and interaction contracts; no backend work is part
of this design deliverable.

## Direction contract

THESIS: Make independent capture outcomes immediately readable beside the content,
instead of asking the owner to infer safety from one generic status.

OWN-WORLD: Mineral-blue navigation, pale blue-white working surfaces, yellow-green
action ink, a fixed UI sans scale, compact flat rows and measured eight-pixel
spacing. Dark mode keeps the blue material rather than becoming neutral black.

STORY: Find a record, distinguish acquisition, local retention and Locus saving,
read its content and choose the supported next action. Diagnostics remain secondary.

FIRST VIEWPORT: A 192px navigation column, 352px record list and flexible content
inspector at 1440px. The inspector opens with its source and action, then a flat
three-part outcome strip, a short reason and next action, and the content tabs.
At narrow widths list and detail become separate views with explicit focus return.
The signature interaction is a stable parallel outcome strip: each fact changes
independently without arrows, numbered stages or implied sequential progress.

FORM: Signal shelf, grounded candidate 7; seed `0e7c3974`; explicitly selected
by the user. The code-led sample carries the committed direction; no image comp
was generated or approved.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Review boundary

Review the design sample rather than backend behavior. Required captures: wide
light, wide dark, 390px list/detail, 320px detail, and component examples. Exercise
theme switching, view/search selection, all sample outcomes, tabs, named clear
confirmation, settings, queue and narrow keyboard focus. The sample does not
acquire media, contact Locus, grant Chrome permissions or handle real credentials.
Use no new raster assets; ordinary Lucide icons are functional vector geometry.
