---
target: Inbox list and detail
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:E:\\Project\\locus-chrome-ext\\apps\\extension\\ui\\results\\ResultsApp.tsx"
target_fingerprint: "sha256:f0529a17d81b62da25e328032ece475cb1535ba50318841c8a0d393c9802c42d"
target_path: "E:\\Project\\locus-chrome-ext\\apps\\extension\\ui\\results\\ResultsApp.tsx"
timestamp: 2026-10-03T03-10-19Z
slug: ui-results-resultsapp-tsx
---
Method: dual-agent (A: /root/critique_design · B: /root/critique_detector)

# Inbox list and detail critique

Scope: `apps/extension/ui/results/ResultsApp.tsx` and its Inbox list, inspector,
navigation and status consumers. Mode: Operate. Audience: the owner personally
using Locus capture. Assessments were isolated; the parent read A's completed
review before reading B's detector findings. Production assets were freshly
built with `pnpm build`; browser host responses and capture content were synthetic
and disposable. No production UI changes were made.

## Design specificity and overall impression

The interface is a coherent personal working tool. Its strongest product-specific
choices are the independent acquisition, local retention and Locus outcomes,
failure-first Inbox, available-content export and original-attempt continuation.
Content earns the detail pane; technical data is progressively disclosed. Preserve
the incumbent identity and task semantics.

The largest opportunity is to connect the reason a capture needs attention with
its supported next action while keeping the reading surface calm. Focus continuity
and light-theme failure-label contrast should be addressed before visual polish.

## Design health score

All ten heuristics apply. Scores are bounded design judgments, not certification.
The synthesized status-visibility score includes B's rendered contrast evidence.

| # | Heuristic | Score /4 | Key evidence |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | Separate outcomes are truthful, but light-theme red status text lacks adequate contrast. Loading was not runtime-confirmed. |
| 2 | Match between system and real world | 3 | Inbox and staging are understandable; Activity contains more technical terminology. |
| 3 | User control and freedom | 2 | Named clear confirmation and Back exist; narrow transitions lose keyboard position. |
| 4 | Consistency and standards | 3 | Components and themes are coherent; search wording exceeds the implemented matching scope. |
| 5 | Error prevention | 3 | Clear names its local target/effect and initially focuses Cancel; unsupported legacy sending is not invented. |
| 6 | Recognition rather than recall | 3 | Labeled views and tabs aid discovery; recovery and retention precautions require discovering Activity. |
| 7 | Flexibility and efficiency | 2 | Arrow/Enter navigation and sorting work; focus loss and overstated search reduce efficiency. |
| 8 | Aesthetic and minimalist design | 3 | Content-forward, restrained workspace; repeated status/hint layers add modest scanning load. |
| 9 | Error recovery | 3 | Activity offers supported recovery; the default Preview weakly presents the next action. |
| 10 | Help and documentation | 2 | Practical empty-state and local guidance; failure Preview lacks a concise next-step explanation. |
| **Total** | | **26/40** | **Acceptable: address the identified interaction and legibility gaps.** |

## What works

1. Local staging and a failed Locus save can coexist visibly without conflating
   their truth. Partial files stay associated with the selected capture.
2. Preview, Metadata and Activity separate reading from technical inspection.
   Desktop themes and clean 320px detail fit the content; no production horizontal
   overflow was observed in the inspected narrow states.
3. Clear confirmation names the capture, explains the local-only effect, and
   initially focuses Cancel. No unsupported undo or bulk capability is demanded.

## Priority issues

### [P1] Narrow list/detail transitions lose keyboard focus

At 390px and 320px, ArrowDown correctly focuses the next capture and Enter opens
its detail, but focus then falls to BODY when the list is hidden. Back also leaves
focus on BODY rather than restoring the originating row. Both assessments observed
this independently. A keyboard user must restart navigation and rediscover position.

Source: `ResultsApp.tsx:109`, `ResultsApp.tsx:129`,
`useLibraryNavigation.ts:43`, `CaptureInspector.tsx:97` under `ui/results/`.

Fix: transfer focus on explicit narrow row activation to the inspector heading or
Back control, and restore the initiating visible row on Back. Use a list-heading
fallback if that row no longer exists. Background updates must keep their existing
focus-preserving contract. Suggested command: `$impeccable harden`.

### [P1] Light-theme red status labels have insufficient text contrast

B read rendered light-theme colors, converted them to sRGB, composited alpha through
ancestor backgrounds, and calculated contrast. The 12px Needs attention badge was
approximately 3.40:1 in the selected row, 3.76:1 in an ordinary row, and 4.01:1 in
the detail header. These are below the 4.5:1 normal-text criterion; small bold text
does not qualify for the large-text exception. Canvas quantization makes the values
approximate, but the badge measurements are sufficiently below the threshold to
warrant a targeted correction. Muted row text measured above 5:1, so a blanket
muted-text failure is not supported. A 4.48:1 Activity message remains a borderline
measurement requiring precision before a separate categorical finding.

Source: `ui/shared/CaptureStatusBadge.tsx:46`, `ui/results/CaptureList.tsx:239`,
`ui/results/CaptureInspector.tsx:162`; the shared destructive Badge variant in
`components/ui/badge.tsx` and semantic tokens in `assets/tailwind.css` determine
the actual color pair.

Fix: correct the shared failure-badge foreground/background pairing and measure
selected/unselected rows and detail headers in both themes. Preserve the semantic
error color and independent staging indicator. Suggested command: `$impeccable audit`.
Reference: [WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### [P2] Search wording promises unsupported author/uploader matching

The accessible name promises label, uploader, author, source ID and URL, while the
implementation matches only label plus source URL. The synthetic author-search
failure is a demonstration of that boundary, not proof that production Twitter
handle search always fails. Parent source verification established a reachable
case: `packages/bilibili/src/source.ts:87` builds labels from BVID, part and title,
without uploader name; the uploader remains in payload metadata. Twitter labels
usually include the handle (`packages/twitter/src/source.ts:110`), so handle search
can work there, while display-name search is not generally covered.

Source: `ui/results/CaptureList.tsx:133`, `:138`, and
`ui/results/useLibraryNavigation.ts:67`.

Fix: align visible and accessible wording with summary-label/source search first.
True uploader/display-name search is a separately scoped metadata/search decision;
do not load every record Blob merely to fulfill the placeholder. Suggested command:
`$impeccable clarify`.

### [P2] Attention details hide recovery and retention precautions behind Activity

Opening a failed save defaults to Preview, with Export ZIP receiving strongest
emphasis. Connection settings and Check and continue save are revealed by the
smaller Locus-status link or Activity tab. Retention failure shows short warnings
above Preview, while the explanation that only the committed revision is recoverable
after restart and that available content can be exported lives in Activity.
Export remains available; this is a discoverability gap rather than a blocked task.

Source: `ui/results/CaptureInspector.tsx:117`, `:167`, `:174`, `:220`;
`ui/results/CaptureOutcomeDetails.tsx:59`; `ui/results/LocusSaveStatus.tsx:66`.

Fix: add a compact reason-and-supported-next-action presentation beside the
persistent status. Keep technical diagnostics in Activity. Explain local-retention
risk separately from Locus saving; preserve original-attempt continuation, explicit
action and legacy staging without inventing sending or automatic replay.
Suggested commands: `$impeccable clarify`, `$impeccable layout`.

## Detector synthesis

CLI scans of `ui/results` and shared `CaptureStatusBadge.tsx` each exited 0 with
zero findings. This is absence of matching source patterns, not a clean usability
or accessibility certification.

Successful browser overlays reported 4-8 patterns per pass across five rendered
views/transitions. Totals are per-pass counts, not additive unique defects. Categories
were layout-property animation, flat type hierarchy and nested cards. Shared sidebar
width animation is a performance-sensitive pattern, but no jank was measured. A
compact workspace can establish hierarchy through placement, weight and selection
without meeting a generic font-size ratio. Pane, scroll and diagnostic containers
were also labeled as nested cards; their task roles make these false-positive risks.
None justifies an automatic layout rewrite.

The two assessments agree on focus loss and the extra recovery-discovery step.
B's independent rendered measurements add the material light-theme badge contrast
finding. This contrast finding came from measurement, not the CLI detector.

## Cognitive load and emotional journey

Cognitive load is moderate. Four workspace views and three detail tabs are coherent
groups. Across toolbar, tabs and status links, a failed-save detail has at least
seven visible controls; grouping helps, but no single recovery priority leads them.
Repeated row status and hint layers require scanning. The necessary intrinsic load
is understanding three independent outcomes; extraneous load comes from lost focus,
search promises and discovering recovery. Preserve the distinctions while reducing
the effort to choose the next supported action.

Opening retained content provides reassurance. The emotional valley is seeing a
failure without an immediate next step; Activity restores confidence with explicit
original-attempt controls. Named clear confirmation provides a deliberate end.
Actual operation completion was not exercised, so no successful save/export ending
is claimed.

## Persona checks and minor observations

- Alex, power user: Arrow/Enter works, but narrow triage repeatedly loses position;
  uploader search and recovery placement slow discovery.
- Sam, keyboard-dependent user: controls have names and clear starts on Cancel,
  but explicit list/detail transitions lose focus; small red labels also reduce
  light-theme legibility. No screen-reader certification is claimed.
- Returning owner: staging and saving are clearly separated; current local-retention
  risk and the supported action deserve more immediate explanation.

Icon controls measured 28px and tabs about 25px high: a comfort refinement, not a
demonstrated minimum-target failure. At 320px partial-export controls wrap without
production page overflow. Overflow caused by the detector's own banner was excluded.
Loading was source-reviewed only because the requested fixture rendered populated
content. Media-rich/Bilibili rendering, long histories, assistive-technology output,
real protocol outcomes and restarts remain outside this run.

## Questions to consider

1. Should the next pass address focus/contrast/search first, or also change the
   placement of supported recovery actions?
2. When opening an Inbox item, should reading content remain the default emphasis,
   or should the reason and next action receive more emphasis?

The next implementation scope must follow the user's answers; this critique alone
does not authorize new search capabilities or changes to delivery semantics.
