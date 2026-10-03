---
name: Locus capture — Signal shelf
description: Selected extension-wide target system, realized first in the standalone Signal shelf sample.
colors:
  background: "#edf3f6"
  foreground: "#20384a"
  card: "#ffffff"
  card-foreground: "#20384a"
  popover: "#ffffff"
  popover-foreground: "#20384a"
  primary: "#d9e785"
  primary-foreground: "#203139"
  secondary: "#e5edf2"
  secondary-foreground: "#294455"
  muted: "#e5edf2"
  muted-foreground: "#526b7c"
  accent: "#dfeaf1"
  accent-foreground: "#20384a"
  destructive: "#98243a"
  destructive-foreground: "#ffffff"
  success: "#186346"
  warning: "#705008"
  info: "#245981"
  border: "#c8d6e0"
  input: "#c8d6e0"
  ring: "#3a6380"
  sidebar: "#142d45"
  sidebar-foreground: "#eef4f8"
  sidebar-accent: "#284b65"
  sidebar-muted: "#b4c8d5"
  sample-reading: "#f8fbfc"
  sample-list: "#f2f7fa"
  sample-selected: "#dfeaf1"
  sample-selected-ink: "#20384a"
  sample-focus: "#416e8d"
  sample-caption: "#526b7c"
  dark-background: "#102638"
  dark-foreground: "#eaf2f7"
  dark-card: "#173044"
  dark-card-foreground: "#eaf2f7"
  dark-popover: "#173044"
  dark-popover-foreground: "#eaf2f7"
  dark-primary: "#d9e785"
  dark-primary-foreground: "#203139"
  dark-secondary: "#2a475c"
  dark-secondary-foreground: "#eaf2f7"
  dark-muted: "#29465a"
  dark-muted-foreground: "#b4c8d5"
  dark-accent: "#2a475c"
  dark-accent-foreground: "#eaf2f7"
  dark-destructive: "#ffb2bd"
  dark-success: "#91d6b1"
  dark-warning: "#f0d48c"
  dark-info: "#9cc8ed"
  dark-border: "#35566c"
  dark-input: "#35566c"
  dark-ring: "#a0c5dc"
  dark-sample-reading: "#132b3e"
  dark-sample-list: "#102638"
  dark-sample-selected: "#28485e"
  dark-sample-selected-ink: "#eaf2f7"
  dark-sample-focus: "#a0c5dc"
  dark-sample-caption: "#b4c8d5"
typography:
  workspace-title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  record-title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  reading:
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
rounded:
  progress: "4px"
  row: "8px"
  medium: "8px"
  large: "10px"
  overlay: "14px"
  badge: "26px"
  avatar: "50%"
spacing:
  half: "4px"
  control-gap: "6px"
  unit: "8px"
  compact: "10px"
  small: "12px"
  base: "16px"
  inset: "18px"
  pane: "20px"
  section: "24px"
  navigation: "28px"
  reading: "32px"
  specimen: "36px"
  canvas: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  button-destructive:
    backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)"
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  search-input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "4px 10px"
  navigation:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
    padding: "24px 16px 16px"
  capture-row:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.row}"
    padding: "16px 12px"
  status-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.badge}"
    height: "20px"
    padding: "2px 8px"
  status-success:
    backgroundColor: "color-mix(in oklab, var(--success) 10%, transparent)"
    textColor: "{colors.success}"
    rounded: "{rounded.badge}"
    height: "20px"
    padding: "2px 8px"
  outcome-strip:
    padding: "18px 0 0"
  queue-progress:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.info}"
    rounded: "{rounded.progress}"
    height: "5px"
    width: "100%"
---

# Design System: Locus capture — Signal shelf

## Overview

**Creative North Star: "Signal shelf"**

Signal shelf is the selected, normative target design for Locus capture across the extension. Its first realized evidence is the standalone React sample in `design/signal-shelf`, using the installed shadcn/Base UI primitives and Lucide vectors. The existing production stylesheet and production surfaces still carry the preceding theme; this document does not claim that they have migrated. Future production integration must preserve the existing business, state ownership and interaction contracts.

The working environment combines mineral-blue navigation, pale blue-white list and reading surfaces, yellow-green priority actions, compact flat rows and a fixed UI sans hierarchy. Dark mode keeps the same blue material. The personal user can scan retained summaries, inspect content and read three independent outcome facts before choosing a supported next action. The signature is a parallel outcome strip, not a sequential progress display.

This specification records the sample after review corrections. `finish-review.md` initially required two queue fixes; `verdict.md` resolves both and gives a ship disposition only for that fix scope. Its source-control addendum separately resolves the staging-icon correction against `components-source-controls.jpg`, again at that focused scope. The retained desktop, dark, narrow, components, settings and queue captures and `verification.md` establish the sample review boundary. The parent reports typecheck, lint and sample build passing again after the source-control correction; the earlier valid source-scope detector result was `[]`. Focused status specimens reached approximately 5.54:1 minimum contrast in light and 5.80:1 in dark; this is not full accessibility certification. No new shipping raster was created.

**Key Characteristics:**

- Mineral-blue working surfaces in both themes.
- Fixed UI type roles and restrained, flat component geometry.
- Parallel Capture, Local copy and Locus save facts.
- Persistent reasons and supported next actions beside the content.
- Separate narrow list/detail views with explicit keyboard focus return.

## Colors

The palette is a blue working environment with a yellow-green action accent and independent semantic status inks. The frontmatter is normative: unsuffixed names are light-mode sample custom properties, and `dark-` names are explicit dark-mode overrides. Dark mode inherits unchanged root properties, including the action and navigation colors.

### Primary

- **Signal yellow-green** (`primary`, `primary-foreground`): priority action fill with dark action text; also used for selection text and the small navigation brand vector.
- Hover lowers primary fill to 80% opacity. It does not change the action's semantic role.

### Secondary

- **Blue action surface** (`secondary`, `secondary-foreground`): supporting actions. The navigation overrides this role locally with `sidebar-accent` and `sidebar-foreground`.
- **Selected blue** (`accent`, `accent-foreground`, `sample-selected`, `sample-selected-ink`): modest selection and hover surfaces; selected capture rows have a contrasting boundary as well as a fill.
- **Outcome inks** (`success`, `warning`, `info`, `destructive`): confirmed completion, incomplete/uncertain outcomes, acquisition/setup information and actual failure. Their dark counterparts brighten the ink while preserving meaning. Badge fill and stroke derive from these inks at low opacity rather than adding new colors.

### Neutral

- **Mineral navigation** (`sidebar`, `sidebar-foreground`, `sidebar-accent`, `sidebar-muted`): persistent blue rail, readable labels, active background and secondary counts.
- **Working ground** (`background`, `sample-list`, `sample-reading`): shell, summary list and content field. Dark reading remains a distinct blue layer.
- **White-blue surface** (`card`, `card-foreground`, `popover`, `popover-foreground`): inspector header and overlays.
- **Quiet blue support** (`muted`, `muted-foreground`, `sample-caption`): subordinate copy, subtle hover and progress track.
- **Boundary and focus** (`border`, `input`, `ring`, `sample-focus`): divisions, input strokes and keyboard focus. Base UI focus rings coexist with the sample's explicit outline.

**The Parallel Facts Rule.** Keep Capture, Local copy and Locus save independently labeled. Do not connect them with arrows, numbers or one aggregate success claim.

**The Neutral Staging Rule.** Use the neutral outline and Inbox icon for local staging. Missing connection setup is informational; reserve error ink for an actual failed outcome.

## Typography

**UI and Reading Font:** Segoe UI Variable, Segoe UI, system-ui, sans-serif. This is an Operate surface: the system font is used for task UI, with no separate display role.

The main ramp is fixed at (12 / 14 / 16 / 18 / 24px). The hierarchy relies on size, weight and spacing; headings do not scale fluidly with the viewport.

### Hierarchy

- **Workspace title:** `workspace-title`; used for the list heading. The specimen title uses the same size and weight without the list's tracking.
- **Record title:** `record-title`; wraps long identifiers. Specimen section headings use the same size/weight but retain normal tracking; the component sheet also demonstrates an inherited semibold (600) specimen heading.
- **Reading:** `reading`; captured prose has a maximum measure of (68ch), preserved line breaks and anywhere wrapping.
- **Body:** `body`; task copy and record rows. Record labels use weight (650) and line height (1.45).
- **Label:** `label`; metadata, source context, counts and explanatory captions. Counts use tabular numerals.
- **Control:** `control`; inherited primitive labels. Badges use (12px / 500 / 16px line height); inputs inherit (16px / 24px) below 768px and (14px / 20px) at 768px and above.

Observed exceptions are contextual, not new ramp steps: the brand word is (20px), connection/helper text uses (13px), and narrow outcome captions/badges use (11px). Do not reuse these exceptions as display styles.

**The UI Voice Rule.** Use the fixed UI sans hierarchy for work surfaces. Reading content gains line height and measure rather than a decorative display face.

## Layout

The sample's wide first expression is navigation, summary list and flexible inspector: columns (192px / 352px / minmax(0, 1fr)). At widths below (1200px), the rail/list become (160px / 304px). Below (960px), the rail hides and explicit navigation opens a dialog; the list remains (304px). Below (768px), list and detail occupy separate full-width views. Preserve this structural behavior when adapting the world to other surfaces; it is not a requirement to give source-page controls a three-column shell.

The root fills (100svh), with a fixed sample toolbar and a minimum-zero flex/grid working region. The list and inspector scroll within that region. Avoid a second document scrollbar. Inspector insets step from (32px) to (24px) to (20px); list insets use (20px). Rows use (16px 12px). Repeated rhythm centers on the eight-pixel unit, with the frontmatter recording actual intermediate insets and the inherited control's (6px) gap.

Captured prose is bounded at (68ch); inspector identifiers and metadata wrap. The three outcome facts stay side by side at (320px), with reduced gaps and badge padding rather than changing to a connected sequence. Metadata columns change from (120px) to (88px) at narrow widths.

The component sheet is a sample-only canvas: maximum width (1240px), padding (36px 40px), falling to (24px 20px) below 768px. Its swatches change from six to three columns. The sample toolbar and scenario selectors are review infrastructure, not a production composition rule.

Narrow selection focuses Back; Back returns focus to the originating row, with search as the fallback. Rows support ArrowUp, ArrowDown, Home, End and Enter activation. These behaviors were checked in the sample. Background production updates must preserve established browsing and focus contracts.

## Elevation & Depth

The shell is flat: tonal layers and single-pixel divisions separate work areas. There is no resting row or pane shadow. Imported primitives retain modest depth for segmented tabs and overlays; the detail tabs use the line variant without a shadow.

### Shadow Vocabulary

- **Transient notice:** `box-shadow: 0 8px 32px #142d4520`; the sample toast only.
- **Active segmented tab:** inherited Tailwind `shadow-sm`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`.
- **Dialog boundary:** (1px) foreground ring at 10% opacity; backdrop black at 10% with the imported (4px) blur where supported. This inherited overlay behavior does not establish a glass material for the working shell.

Rows transition background using `sample-motion` (160ms) and `sample-ease` (`cubic-bezier(.22,1,.36,1)`). Imported controls use the installed Tailwind default (150ms, `cubic-bezier(0.4,0,0.2,1)`); dialogs use a (100ms) fade/scale. Reduced motion forces animation and transitions to (.01ms), a single animation iteration, and automatic scroll behavior. Do not add entrance choreography.

**The Flat Working Surface Rule.** Use tonal separation and restrained strokes for the working shell. Reserve the observed lift for overlays and transient feedback.

## Shapes

Custom capture rows and small code/swatch surfaces have gentle corners (`rounded.row`). The shadcn radius base is (10px); the imported mapping produces medium (8px), large (10px), overlay (14px) and badge (26px) corners. Thus buttons and search groups have (10px) corners, line-tab triggers retain (8px) geometry, and dialogs have (14px) corners. Badge rounding is a fixed primitive radius, not a newly invented infinite pill token.

The notice uses (10px), progress uses (4px), and author initials use circular geometry. Boundaries are predominantly (1px); selection makes its boundary explicit. Use functional Lucide vector shapes rather than text glyphs or decorative image marks.

## Components

### Buttons

Compact and familiar, with one clear priority. Primary, outline, secondary, ghost and destructive variants are evidenced in the component sheet; the link variant exists in the imported primitive but is not promoted here as a sampled pattern.

Default buttons are (32px) high with (10px) horizontal padding, (6px) gap and (10px) radius. Inline start/end icons reduce their corresponding edge to (8px), and ordinary button icons are (16px). Primary uses the action token; outline uses the working ground and border; secondary uses the support surface; ghost gains a muted hover surface. Secondary hover mixes in foreground at 5%. Destructive uses 10% error fill and error ink, increasing fill on hover; in dark mode its resting fill is 20%.

Imported focus is a (3px) ring at 50% ring opacity with a ring-colored border. The sample adds a (2px) explicit focus outline with (3px) offset to buttons, links and selects. Press moves buttons down (1px), except popup triggers excluded by the primitive. Disabled controls have 50% opacity and suppress pointer interaction. Preserve Base UI behavior during integration rather than recreating it from the sidecar's static specimens.

Small vector-only controls are actually present: source capture and manual clear use (36px) squares with (16px) icons; dismiss notice uses (32px); search clear uses (32px) through InputGroupButton; dialog close uses (28px). Each carries an accessible name. These observed sizes are not a blanket guarantee of touch-target suitability in every host context.

### Inputs / Fields

Search is the installed InputGroup with leading Search vector, visible placeholder and a hidden semantic label: “Search capture label or source URL.” The group is (32px) high with an input boundary and (10px) radius. It is transparent in light mode, with input-colored 30% fill in dark. Focus-visible on the inner input moves the group border and adds the shared ring. The inner control removes its own border/ring; the group owns the visible boundary.

Search matches only capture label and source URL in this sample. No-result copy states that scope and offers clear search; it makes no full-content, author or media search promise. Settings use existing Field/Input composition, read-only example values and disabled submission; they do not establish a new production settings flow.

### Navigation

A mineral-blue rail with left-aligned (38px) high buttons, (10px) icon gaps, restrained (12px) counts and a connection summary. Current view uses secondary treatment and `aria-current="page"`; other views use ghost treatment. Below 960px the same navigation content appears in an explicitly opened, titled dialog. Connection and task controls do not invent automatic queue opening.

### Capture Rows / Containers

Summary-first flat rows with (8px) corners, (16px 12px) insets and (10px) internal gaps. A muted hover tint supports scanning; selected rows use selected fill and selected-ink border with `aria-pressed`. Their hierarchy is source/time, label, outcome, then a short reason. The inspector presents source/action, heading, independent outcomes, persistent explanation/next action, then Preview / Metadata / Activity. Diagnostics stay in an expandable secondary disclosure.

### Status and Parallel Outcomes

Status combines a word, a (12px) Lucide vector and a semantic tone. Success maps to Check, warning to TriangleAlert, failure to CircleAlert, information/acquisition to Clock, and neutral staging to Inbox. The neutral outline uses foreground and border rather than error ink. The corrected source-page specimen uses this same shared neutral staging treatment.

The signature definition list has three equal columns, a top boundary, (18px) top inset, (16px) desktop gap and (22px) top margin. Outcome badges become at least (24px) high, wrap words, and retain labels. Below 768px the gap is (8px), captions and badges use (11px), and badge horizontal padding becomes (5px). It is possible and necessary to show Complete / Not retained / Saved together.

### Queue Progress

Queue rows use (16px) vertical insets and (10px) gaps, plus the same Status component as the inspector. Acquisition is info/Clock; staging is neutral/Inbox. The corrected native progress surface has a (5px) height, (4px) radius, info fill and muted track, explicitly styled for WebKit and Mozilla. Its visible “64% in this static example” is demonstration data, not a duration estimate or a new progress capability. Closing the queue does not cancel accepted captures.

### Feedback, Recovery and Clear

Recovery remains discoverable beside the affected record: setup requires configuration followed by explicit original-save continuation; failed or uncertain saves direct the user to inspect the original attempt; confirmed uploads are not repeated. Incomplete capture offers inspection/export of available portions and is not sent. Older captures without a save attempt offer inspection/export without implying retroactive send.

Retention failure states that only a committed local revision is recoverable after restart and offers export of currently available content. A confirmed Locus save remains a separate fact. Clear names the target, initially focuses Cancel and describes removal of the extension's local copy while exports and accepted Locus content remain. Empty/loading states use installed Empty/Skeleton primitives, meaningful guidance and an accessible loading status.

The sample illustrates these contracts through synthetic/no-op controls; production integration must consume existing owners and protocols. No permissions, persistence, credentials, acquisition, delivery or search capabilities are added by this document.

## Do's and Don'ts

### Do:

- **Do** preserve the blue material, action priority and semantic token roles across both themes.
- **Do** show status as a word, a functional vector icon and a semantic color; keep staging neutral.
- **Do** keep the three independent outcomes readable together, including when local retention fails after Locus succeeds.
- **Do** state the supported recovery and retention limits beside the affected capture, after transient feedback disappears.
- **Do** preserve narrow Back/focus return, named-clear confirmation, keyboard activation and reduced-motion handling.
- **Do** keep summary search honest: it matches capture labels and source URLs in this sample.
- **Do** use existing shadcn/Base UI variants and preserve their interaction semantics when integrating the target system.

### Don't:

- **Don't** imply that preview, a local copy or configuration proves a confirmed Locus save.
- **Don't** imply that connection setup replays older captures, partial content is sent, or legacy results gain a new send capability.
- **Don't** turn the parallel outcome strip into a wizard, a connected progress path or one generic success badge.
- **Don't** use the synthetic toolbar, records, static progress or no-op controls as production behavior.
- **Don't** promise restart recovery for uncommitted local content, automatic restart download continuation or cancellation by closing an inspection view.
- **Don't** turn component inheritance or a focused contrast check into a claim of complete accessibility coverage.
- **Don't** add decorative raster imagery, display typography or broadcast ornament to task controls.
