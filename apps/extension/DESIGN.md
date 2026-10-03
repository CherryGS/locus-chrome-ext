---
name: Locus capture — Signal shelf
description: Dark-only production design for the Locus capture workspace and shared capture controls.
colors:
  background: "#102638"
  foreground: "#eaf2f7"
  card: "#173044"
  card-foreground: "#eaf2f7"
  popover: "#173044"
  popover-foreground: "#eaf2f7"
  primary: "#d9e785"
  primary-foreground: "#203139"
  secondary: "#2a475c"
  secondary-foreground: "#eaf2f7"
  muted: "#29465a"
  muted-foreground: "#b4c8d5"
  accent: "#2a475c"
  accent-foreground: "#eaf2f7"
  destructive: "#ffb2bd"
  destructive-foreground: "#ffffff"
  success: "#91d6b1"
  warning: "#f0d48c"
  info: "#9cc8ed"
  border: "#35566c"
  input: "#35566c"
  ring: "#a0c5dc"
  sidebar: "#142d45"
  sidebar-foreground: "#eef4f8"
  sidebar-accent: "#284b65"
  sidebar-muted: "#b4c8d5"
  workspace-reading: "#132b3e"
  workspace-list: "#102638"
  workspace-selected: "#28485e"
  workspace-selected-ink: "#eaf2f7"
  workspace-focus: "#a0c5dc"
  workspace-caption: "#b4c8d5"
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
  reading: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  button-outline-small:
    backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.medium}"
    height: "28px"
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
    backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)"
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "0 10px"
  search-input:
    backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.large}"
    height: "32px"
    padding: "4px 10px"
  navigation:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
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
  queue-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "16px 0"
---

# Design System: Locus capture — Signal shelf

## Overview

**Creative North Star: "Signal shelf"**

Signal shelf is the accepted dark-only visual world implemented in the production Locus capture workspace and shared capture controls. Mineral-blue navigation, distinct list and reading layers, yellow-green priority actions and compact flat rows support personal capture work. The accepted FORM is grounded candidate 7, inherited seed `0e7c3974`; the production surface contract preserves this provenance.

This Operate environment uses a fixed UI sans hierarchy and functional Lucide vectors. Capture, Local copy and Locus save appear as independent facts above content, with persistent explanations and supported recovery before secondary diagnostics. Dark native controls initialize without a theme switch. Existing host operations, ownership and capabilities remain the behavioral authority.

Implementation evidence is `assets/tailwind.css`, the results components, `CaptureQueuePanel` and shared status controls. The production review folder records viewport and fixture checks, including the corrected in-place Retry loading action. Typecheck, lint and MV3 build passed after the correction; 394 unit tests passed earlier. HTTP localhost previews loaded real production components with disposable in-memory host fixtures. The browser URL policy blocked installed-extension inspection: native Chrome/source mounting, downloads, grants and live Locus delivery remain unverified, and updated browser assertions were not executed. These checks establish scoped UI evidence, not a whole-product certification. Review PNGs are nonshipping; no new shipping raster was added.

**Key Characteristics:**

- Dark-only mineral-blue working surfaces and native controls.
- Fixed UI type roles and restrained, flat component geometry.
- Parallel Capture, Local copy and Locus save facts.
- Persistent reasons and supported next actions beside the content.
- Separate narrow list/detail views with explicit keyboard focus return.

## Colors

The palette combines dark-blue working layers, yellow-green action priority and separate semantic outcome inks. Frontmatter values are normative and map directly to production custom properties in the shared `:root, .dark` block. The six `workspace-*` names replace the sample's names. Chart and additional sidebar roles alias these primitives; aliases do not establish extra colors. Sidecar tonal ramps are preview metadata, not production palette additions.

### Primary

- **Signal yellow-green** (`primary`, `primary-foreground`): priority action fill with dark text, text selection and the small navigation brand vector. Primary hover uses 80% fill opacity.

### Secondary

- **Supporting blue** (`secondary`, `secondary-foreground`): supporting actions; the sidebar has its own active-navigation blue.
- **Selection blue** (`accent`, `accent-foreground`, `workspace-selected`, `workspace-selected-ink`): restrained active and hover surfaces. Selected capture rows have a visible boundary as well as a fill.
- **Outcome inks** (`success`, `warning`, `info`, `destructive`): confirmed completion, incomplete or uncertain outcomes, acquisition or setup, and actual failure. Badge fills and strokes derive from these inks at low opacity.

### Neutral

- **Mineral navigation** (`sidebar`, `sidebar-foreground`, `sidebar-accent`, `sidebar-muted`): persistent rail, active view and subordinate counts.
- **Working ground** (`background`, `workspace-list`, `workspace-reading`): shell, summary list and distinct content field.
- **Raised blue** (`card`, `card-foreground`, `popover`, `popover-foreground`): inspector header, recovery area, file containers and overlays.
- **Quiet support** (`muted`, `muted-foreground`, `workspace-caption`): subordinate copy and restrained interaction feedback.
- **Boundary and focus** (`border`, `input`, `ring`, `workspace-focus`): dividers, fields and keyboard indication. Primitive rings coexist with the explicit workspace outline.

**The Parallel Facts Rule.** Keep Capture, Local copy and Locus save independently labeled. Do not connect them with arrows, numbers or one aggregate success claim.

**The Neutral Staging Rule.** Use the neutral outline and Inbox icon for local staging. Missing connection setup is informational; reserve error ink for an actual failed outcome.

## Typography

Inspector and source-record titles use balanced wrapping without clamping the full inspected title. Narrow metadata record/file identities wrap within their row at a unitless (1.5) line height, while summary rows retain their compact clamp and recover the complete value through inspection. File-description fallback IDs may break anywhere rather than enlarge the card. Alert prose uses pretty wrapping; diagnostic and JSON blocks retain ordinary wrapping and exact copyable text. Unsupported wrapping refinements degrade to normal browser wrapping.

Capture-list times/counts, activity counts, and queue counts explicitly use tabular numbers; the existing Windows typeface already rendered the tested digits equally. Link underlines use font-derived position/thickness with ink skipping. Existing font stack, sizes, weights, paragraph measure and preserved source line breaks remain authoritative.

**UI and Reading Font:** Segoe UI Variable, Segoe UI, system-ui, sans-serif. This task surface has no separate decorative display role.

The fixed ramp is (12 / 14 / 16 / 18 / 24px). Size, weight and spacing establish hierarchy; headings do not grow fluidly with viewport width.

### Hierarchy

- **Workspace title:** `workspace-title`; list heading with restrained tracking.
- **Record title:** `record-title`; inspected capture heading with anywhere wrapping. Captured record titles use the same size with medium weight (500).
- **Reading:** `reading`; captured prose uses (68ch) maximum measure, preserved line breaks and anywhere wrapping.
- **Body:** `body`; task copy and summary rows. Summary titles use weight (650) and line height (1.45).
- **Label:** `label`; source context, timestamps, counts and captions. Navigation counts use tabular numerals.
- **Control:** `control`; default primitive labels. Small buttons use (12.8px), extra-small buttons and badges use (12px); badges have weight (500) and (16px) line height. Inputs use (16px) below 768px and (14px) at and above it.

The (20px) brand word and (11px) narrow outcome captions/badges are bounded contextual exceptions, not additional reusable heading roles. Do not promote source-host inherited typography into the workspace ramp.

**The UI Voice Rule.** Use the fixed UI sans hierarchy for work surfaces. Reading content gains line height and measure rather than a decorative display face.

## Layout

The production workspace fills (100svh) with a minimum-zero flex region and internal list/inspector scrolling. Wide navigation and list measure (192px / 352px), followed by a flexible inspector. Below (1200px) they become (160px / 304px). Below (960px) navigation initializes collapsed and remains explicitly accessible through its trigger. Between 768px and 959px the desktop rail uses offcanvas behavior; below (768px) it uses the primitive's mobile sheet. List and detail occupy separate full-width views below 768px.

List-header insets are (24px 20px 16px); rows are (16px 12px) with (10px) internal gaps. The inspector header is (26px 32px 20px) and recovery is (20px 32px). Horizontal inspector insets become (24px) below 1200px and both regions use (20px) padding below 768px. Captured preview content uses (20px / 24px) horizontal/vertical padding, increasing to (32px) at 640px, within a (896px) maximum container. Rhythm centers on the eight-pixel unit with actual intermediate control gaps and insets retained.

The inspector toolbar stacks below 768px, keeping heading and actions readable. The three outcome facts remain side by side at (320px), with reduced gaps and wrapping badges. Captured prose remains bounded at (68ch). Queue dialogs keep headers/actions outside an internally scrolling task list; queue rows stack below 640px.

Explicit narrow selection focuses Back; Back returns to the originating row, with search as fallback. ArrowUp, ArrowDown, Home and End move row focus; native button activation selects. Background updates do not set explicit selection focus intent. The local production fixture checked narrow focus return and viewport bounds at 390px and 320px, plus the current 842px width. These results do not establish native source-page integration coverage.

## Elevation & Depth

The working shell is flat: blue tonal layers and single-pixel divisions separate areas without resting row or pane shadows. Existing primitives retain modest lift for transient feedback, the floating queue launcher and selected segmented tabs. Detail tabs use the line variant without a resting shadow.

### Shadow Vocabulary

- **Floating feedback / launcher:** Tailwind `shadow-lg`: `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`.
- **Active segmented tab:** Tailwind `shadow-sm`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`.
- **Dialog boundary:** foreground ring at 10% opacity with (1px) width; black backdrop at 10% and supported (4px) blur. This overlay treatment does not establish glass as a working material.

Rows use `workspace-motion` (160ms) and `workspace-ease` (`cubic-bezier(.22,1,.36,1)`). Primitive transitions use the installed (150ms) default. Dialogs and confirmation dialogs open over `duration-fast` (250ms), close over `duration-quick` (150ms), and use `scale-large` (.96) with `ease-smooth-out`. Sorting menus share these clocks/easing, using `scale-medium` (.97) on entry and `scale-tiny` (.99) on exit. Backdrops share their dialog's clocks. Desktop sidebar gap/position movement uses synchronized (200ms) transitions with the shared ease-smooth-out curve. Narrow navigation retains its existing (200ms) panel timing. Toast entry/stacking retains (500ms) transform/opacity, (150ms) height and (250ms) content opacity; ending style uses `duration-medium` (350ms) and `ease-smooth-out` for transform/opacity. These seven accepted motion tokens are defined once in the shared stylesheet. Reduced motion forces duration to (.01ms), one animation iteration and automatic scrolling; native Bilibili cover controls disable their own transition. Base UI owns focus, positioning, presence, dismissal and toast stacking/swipe behavior. No entrance choreography defines the workspace.

Toast content keeps its natural height while the outer toast animates the stack height. Making content inherit that height feeds the outer measurement back into ResizeObserver when notifications have different heights.

**The Flat Working Surface Rule.** Use tonal separation and restrained strokes for the working shell. Reserve the observed lift for overlays and transient feedback.

## Shapes

Sorting menus use a derived (12px) outer radius: the existing (8px) radio-item radius plus the menu's (4px) padding. Independent dialog/content surfaces keep their established tokens and asymmetric composition.

Summary rows have gentle (8px) corners. The shared radius base is (10px): default buttons/fields use (10px), small controls and line-tab triggers use (8px), dialogs use (14px), toasts use (18px) and badges use (26px). Badge rounding is a fixed primitive radius; author initials and the (48px) queue launcher use circular geometry. Boundaries are predominantly (1px), with a contrasting selected-row stroke.

Native Bilibili toolbar and cover controls retain (6px) corners as a bounded host-context exception; the cover control measures (28px) square and toolbar height follows the observed host variable with a (24px) fallback. This exception is not the general workspace corner rule. Functional SVG vectors communicate actions/status; decorative raster or text-glyph icons do not define this world.

## Components

### Buttons

Button transitions name color, background-color, border-color, box-shadow, opacity and the existing press translation. Tabs and badges name the same visual properties without translation. Size, position, padding and outlines are not swept into `transition-all`. Existing duration/easing and press geometry remain authoritative, including both explicit translation axes for centered shadow-root dialogs.

Compact primitives establish one clear priority: yellow-green primary, blue secondary, quiet ghost, boundary-led outline and tinted destructive. The link variant supports contextual actions.

Default buttons are (32px) high, with (10px) horizontal padding, (6px) gap and (10px) radius. Small buttons are (28px), use (4px) gap and (8px) radius; extra-small buttons are (24px). Default, small and extra-small vector sizes are (16 / 14 / 12px). Default inline icons reduce their adjacent edge to (8px); small inline icons use (6px). Inspector export and in-place Retry loading use the small outline variant.

Dark outline uses input-colored 30% fill and an input boundary, increasing fill to 50% on hover. Secondary hover mixes foreground at 5%; ghost gains muted 50% tint. Destructive uses 20% failure fill, increasing to 30%, with a 40% failure focus ring. Primitive focus adds a (3px) ring at 50% ring opacity and a ring-colored border; workspace button/link focus also has a (2px) outline and (3px) offset. Press translates down (1px), except popup triggers. Disabled controls have 50% opacity and suppress pointer interaction.

Inspector source/clear, Back and dialog close are (28px) icon controls; search clear is (24px). Their accessible names remain essential. These observed sizes do not assert blanket touch-target suitability in every host context. Preserve Base UI semantics; sidecar snippets illustrate appearance without reproducing application operations.

### Inputs / Fields

Search uses InputGroup, a leading Search vector, a semantic label and visible placeholder. The group owns its input boundary, dark 30% fill, (32px) height and (10px) radius; inner-input focus moves the group border and adds the shared ring. The inner input removes duplicate boundaries. Search matches capture labels and source URLs; no-results guidance states that scope and offers clear search.

Settings is the real connection/access dialog, opening Connection by default and retaining General for explicit website grants. It contains no theme selector. Connection-busy protection, focus restoration and existing host operations remain authoritative; preview fixtures do not prove native grants or live connection success.

Connection validation marks only the affected address or Token field, associates its error text with the input and focuses the first invalid field. Request failures remain a form-level status. A blank Token only reuses credentials at the saved address. Capture notifications with a View capture action, and error notifications, remain until dismissed; ordinary actionless success notices retain the provider's default timeout.

Interface copy uses `Capture` / `Capturing` for obtaining content, `Local copy` / `Saved locally` for device storage, and `Saved to Locus` for confirmed receiver saving. The connection action is `Connect to Locus`; it does not send existing captures. Token source/reuse instructions remain visible as field help after typing. `Retry loading` rereads existing captures without reacquisition, and `Clear capture` names the local removal action in both its trigger and confirmation. Recovery copy states that only previously saved content can be recovered after restarting Chrome.

### Navigation

A mineral-blue rail provides Inbox, In progress, Saved and All captures, counts and Settings. Buttons measure (38px) high with (10px) gaps and (12px) counts. Active navigation uses sidebar-accent and `aria-current="page"`; hover uses the same local sidebar material. Responsive collapse and the mobile sheet preserve explicit access. The production rail does not inherit the sample's extra connection summary or synthetic toolbar.

### Capture Rows / Containers

Acquired image and video preview frames use a (1px) inset outline with a pure-white 10% media-edge token. The outline adds no layout space and keeps dark image boundaries visible against the reading surface. Rounded media corners and native video controls keep their existing geometry and behavior.

Flat summaries present source/time, label, and one status sentence with its functional icon and semantic tone. The list omits separate staging/outcome badges that repeat the sentence; detailed independent outcomes remain in the inspector. A confirmed Locus save with failed local retention explicitly keeps both facts in the summary. Selected rows use both fill and stroke plus `aria-pressed`; hover uses muted blue. File containers use raised-blue fill and restrained outline. The inspector orders source/actions, heading, independent outcomes, persistent recovery, then Preview / Metadata / Activity. Technical diagnostics remain expandable.

### Status and Parallel Outcomes

Keyboard focus on each capture summary exposes its source/time and status through accessible descriptions. The list footer is a stable polite status region for count changes. Routine local-copy and Locus progress use polite status semantics; missing configuration is a note, while actual failures retain alert semantics. These roles do not prove speech timing on every screen reader.

Preview files, metadata records/files, and activity/export rows expose list-item semantics inside their existing ItemGroup. Empty groups omit the list role rather than announce a list with no entries. The queue launcher's controls relation is present only while its dialog exists.

Shared status uses text, a (12px) functional vector and tone: Inbox for staging, Check for confirmed Locus save, TriangleAlert for partial, CircleAlert for failure and CircleHelp for unresolved state. Active acquisition/saving uses motion-safe LoaderCircle; queued uses Clock3. The inspector fact strip uses Clock for informational facts and follows its independent fact vocabulary.

The signature definition list has three equal columns, a top boundary, (18px) top inset, (16px) wide gap and (22px) top margin. Badges are at least (24px) high, wrap words and retain labels. Below 768px gaps become (8px), captions/badges (11px), and badge horizontal padding (5px). Complete / Not saved locally / Saved is a valid combination.

Persistent recovery sits beside content before tabs. When read failure leaves an older snapshot visible, its warning includes an actionable Retry loading button wired to the existing read operation. Retention explanations identify the committed revision recoverable after restart; available content can still be exported. Original-save continuation and connection setup follow existing capability guards.

### Capture Queue / Source Controls

The focused launcher moves (8px) with arrow keys or (32px) with Shift plus an arrow, using the same viewport bounds as pointer dragging. Enter and Space still open the queue; movement never opens it or starts capture. Script-generated keys are ignored. The accessible description explains movement and activation. A first-focus `Skip to content` link bypasses the result sidebar without changing the hash-owned capture route. Focusable tab panels expose a two-pixel inset outline; forced-colors mode uses the system Highlight outline for focused controls, including inputs whose shadow ring would otherwise disappear.

The source-page queue opens through explicit launcher activation; closing it keeps accepted tasks running. Its (48px) circular launcher uses secondary fill and the existing floating shadow. The queue dialog uses (16px) padding, flat rows with (16px) vertical insets, shared outcome badges, reasons and secondary diagnostics. Task actions include supported retry preparation, opening the result and Refresh status. This production queue does not render the sample's static percentage/progress example.

Source controls share functional capture/status vectors and semantic tones. Native Bilibili controls remain scoped to host slots with existing host geometry and literal dark cover fallbacks. Fixture glyph captures exercise the real vector component; native Twitter/Bilibili DOM mounting remains unverified.

Source activation captures the whole default scope without a media-picker step, including modified clicks. Twitter includes text and every direct attachment; Bilibili retains current-part scope. The queue launcher becomes visible after authorized source startup even when no tasks exist, remains collapsed, and explicitly opens an empty queue. Opening or showing it does not inspect a source or start capture. Queue records expose one result destination: `Open in Inbox` for Locus recovery/setup, or the existing named result icon for other tasks.

## Do's and Don'ts

### Do:

- **Do** preserve the dark-blue material, yellow-green action priority and semantic token roles on target surfaces.
- **Do** show status as a word, a functional vector icon and a semantic color; keep staging neutral.
- **Do** keep the three independent outcomes readable together, including when local retention fails after Locus succeeds.
- **Do** place persistent reasons and supported recovery beside affected content, including Retry loading beside an older preview.
- **Do** preserve explicit narrow Back/focus return, named-clear confirmation, keyboard activation and reduced-motion handling.
- **Do** keep summary search honest: it matches capture labels and source URLs.
- **Do** preserve existing shadcn/Base UI interaction semantics and bounded source-host geometry.

### Don't:

- **Don't** imply that a preview, local copy or connection configuration proves a confirmed Locus save.
- **Don't** imply that setup replays older captures, partial content is sent, or legacy captures gain a new send capability.
- **Don't** turn the parallel facts into a wizard, connected progress path or aggregate success badge.
- **Don't** carry synthetic lab controls or static percentage progress into production behavior.
- **Don't** promise restart recovery for uncommitted content, automatic download continuation or cancellation by closing inspection.
- **Don't** turn component inheritance or fixture checks into whole-product accessibility or native Chrome/Locus verification claims.
- **Don't** add decorative raster imagery, display typography or broadcast ornament to task controls.
