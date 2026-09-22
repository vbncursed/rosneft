# Runeicons across the frontend — design

**Date:** 2026-09-22 · **Status:** implemented
**Scope:** `frontend/` only. No backend, no desktop-shell change.

## Goal

Replace every icon in the SPA — the 35 SVG glyphs in `shared/ui/icon` and the eight text
characters that stand in for icons — with the outline set of
[runeicons](https://github.com/Nexvyn/runeicons), filling its gaps from
[Lucide](https://lucide.dev) (the set runeicons' outline style is built on: same 24 grid, same
names, same construction). The tour's replay tile becomes a question mark.

## Decisions (from brainstorming, 2026-09-22)

| # | Decision | Why |
|---|---|---|
| D1 | **Outline** style (runeicons `public/normal/`), not duotone / fill / pixelated / glass | Closest to the current thin line and the mono typography; the only complete style (fill lacks e.g. rotate, image) |
| D2 | **One stroke width, 1.75**, on a 24 grid, for every icon | Current glyphs mix 1.4–2.2; runeicons' native 2 reads heavier than the mono text at 13 px; 1.5 fades in the light theme at 13 px. Compared at 13/16/20 px in both themes |
| D3 | Gaps filled from **Lucide** (ISC), not approximated from runeicons, not kept from the design system | Visually indistinguishable from runeicons outline; near-substitutes (menu for ⋮, move for ruler) change meaning |
| D4 | **All icon-like characters** are replaced: the tool rail's ↺ ↔ ＋ ◎ ▤ ▶, `×` on a measurement chip, `●`/`○` in the dropdown, and later every standalone `×` `+` `−` `←` `→` `✓` `▾` and leading "+" (see Characters → icons). Typographic `→` and `·` inside sentences stay text (see Deliberately stays text) | The user asked for icons "everywhere"; arrows and separators in running text are typography, not icons |
| D5 | Vendored as data inside the existing `Icon` component; **no new dependency** | runeicons' packages are `private: true`, not on npm; `lucide-react` for seven glyphs is a second source and a dependency for ~40 lines of paths |
| D6 | Semantic names stay (`cube`, `kebab`, `passkey`, `panorama`…); only drawings change | No churn at the ~50 call sites; a name says what the icon means here, not which library drew it |
| D7 | Panorama = runeicons **camera**; maximize/minimize = Lucide **maximize/minimize** (corner brackets, like today); grip = runeicons **grip-horizontal** | Chosen from rendered options; closest in meaning / closest to the current drawing |

## Mapping

Source abbreviations: **R** = runeicons `public/normal/<path>.svg` (Apache-2.0), **L** = Lucide
`icons/<name>.svg` (ISC).

### Existing names (35)

| Name | New drawing | | Name | New drawing |
|---|---|---|---|---|
| `pencil` | R `tools/pencil` | | `search` | R `tools/search` |
| `trash` | R `tools/trash-2` | | `info` | R `indicators/info` |
| `check` | R `indicators/check` | | `kebab` | L `ellipsis-vertical` |
| `cube` | R `documents/box` | | `minus` | R `indicators/minus` |
| `eye` | R `senses/eye` | | `grid` | R `layouts/layout-grid` |
| `eye-off` | R `senses/eye-off` | | `list` | L `list` |
| `lock` | R `identity/lock` | | `arrow-right` | R `arrows/arrow-right` |
| `magnet` | L `magnet` | | `arrow-up` | R `arrows/arrow-up` |
| `passkey` | R `identity/fingerprint-pattern` | | `chevron-left` | R `arrows/chevron-left` |
| `plus` | R `indicators/plus` | | `chevron-right` | R `arrows/chevron-right` |
| `refresh` | R `schedule/refresh-cw` | | `chevron-up` | R `arrows/chevron-up` |
| `ruler` | L `ruler` | | `panorama` | R `playback/camera` |
| `calendar` | R `schedule/calendar` | | `file` | R `documents/file` |
| `download` | R `arrows/arrow-down-to-line` | | `maximize` | L `maximize` |
| `upload` | R `arrows/arrow-up-from-line` | | `minimize` | L `minimize` |
| `moon` | R `nature/moon` | | `grip` | R `layouts/grip-horizontal` |
| `sun` | R `nature/sun` | | `close` | R `indicators/x` |
| `warning` | R `indicators/triangle-alert` | | | |

### New names (4)

| Name | New drawing | Used by |
|---|---|---|
| `reset` | R `arrows/rotate-ccw` | tool rail: Reset camera |
| `documents` | R `documents/file-text` | tool rail: Documents |
| `help` | R `indicators/circle-question-mark` | tool rail: Replay guided tour |
| `chevron-down` | R `arrows/chevron-down` | dropdown trigger caret (was `▾`) |

### Characters → icons

| Where | Was | Becomes |
|---|---|---|
| `pages/territory-viewer/ui/viewer-overlays.tsx` `TILES` | `↺` `↔` `＋` `◎` `▤` `▶` | `<Icon>` `reset` `ruler` `plus` `panorama` `documents` `help` |
| `shared/ui/tool-rail/tool-rail.fixture.tsx` | same six | same six icons |
| `widgets/viewer-canvas/three/measurement-segment.tsx` removable chip | `×` | `<Icon name="close">` |
| `shared/ui/dropdown/dropdown.tsx` option marker | `●` / `○` | `check` when selected; an empty box of the same width when not, so labels do not shift |
| `features/onboarding/model/viewer-tour-steps.ts` `shortcuts` body | "…with the ▶ button." | "…with the ? button." |
| `shared/ui/dropdown/dropdown.tsx` trigger caret | `▾` | `chevron-down`, still rotates when open |
| `shared/ui/drawer`, `shared/ui/toast`, the six `widgets/*-inspector` Close buttons, `features/audit-filter` filter chips, `features/role-assign/ui/role-chips.tsx`, `pages/upload-models/ui/queue-row.tsx` | `×` | `close` |
| `shared/ui/date-picker` prev/next month | `←` `→` | `chevron-left` / `chevron-right` |
| `shared/ui/quantity-stepper`, `widgets/view-tab/ui/calibration-card.tsx` | `−` `+` | `minus` / `plus` |
| `entities/model/ui/model-picker-card.tsx` selected badge | `✓` | `check` |
| Button labels starting with a typed "+": New user, New role, Model, Territory, Upload (catalog and library), Add passkey, add role, add person (user decision 2026-09-22) | `+ Label` | `<Icon name="plus">` + label; where the label became a bare noun the button's `aria-label` keeps the verb: `New model`, `New territory`, `Upload models`, `Upload territory` |

Also: the PDF window's grip is `text-dim` and its resize corner `border-dim` (`line-2` is a
border token, ~1.6:1 on `panel-2`).

### Deliberately stays text

- `+ ± − →` event-kind operators in `entities/audit/ui/event-card.tsx` (commented there).
- Arrows inside link labels (`← Home`, `Open →`) and `→` between before/after values.
- The `⌘K` key legend, `…`, the `/` breadcrumb separator.
- `×` in dimensions (`a × b × c m`).

`ToolRailItem.glyph` already accepts a `ReactNode` ("A mono glyph or an `<Icon>`"), so the tool
rail's API does not change.

## Architecture

- `shared/ui/icon/glyphs.tsx` / `glyph-extras.tsx` keep the `GLYPHS` map and `IconName` type.
  Each entry becomes just its `body` (the path/circle/rect elements, attributes stripped of
  `stroke`, `stroke-width`, `fill`, colour). The per-glyph `box` and `width` fields and the
  "`width === 0` means filled" rule go: every icon is `viewBox="0 0 24 24"`, stroked at 1.75,
  `fill="none"`, `currentColor`.
- `Icon` keeps its props (`name`, `size`, `title`, rest spread onto `<svg>`); its body shrinks
  to the uniform attributes.
- Split between the two glyph files stays by size (200-line cap), not by source library.
- `shared/ui/icon/NOTICE` credits runeicons (Apache-2.0, Copyright 2026 Runeicons — the Apache licence requires
  the licence and attribution to travel with redistributed work) and Lucide (ISC, Copyright (c) 2026 Lucide Icons and
  Contributors), with the list of which names come from which.
- `frontend/CLAUDE.md` gets one paragraph: icons deliberately no longer follow
  `Design System.dc.html` § Icons; runeicons outline at 1.75 + Lucide gaps; where to add one.

## Testing and verification

- Unit: every `IconName` has a body; `Icon` renders `viewBox="0 0 24 24"`,
  `stroke-width="1.75"`, `fill="none"`; decorative icons carry `aria-hidden`, titled ones
  `role="img"` + `<title>`. Dropdown: selected option shows the check, unselected reserves its
  width. Measurement chip renders the close icon. Tool rail tiles render an `<svg>` per tool.
- Cosmos: `icon.fixture` shows the full set, both themes.
- Live, local stack, both themes at 1280×800, screenshots: home, catalog, model detail,
  account, console (users, audit), territory viewer (tool rail, Overlays panel both tabs,
  PDF window, measurement chip, the tour's replay tile and the shortcuts step), upload modal.
- Design pass against emilkowalski skills (optical size and alignment inside 26–30 px tiles,
  consistency across both themes).
- Gate: `yarn lint`, `yarn test:coverage` (90/85/90/90).

## Rollout

`dev` → PR to `main` → `/code-review` → SPA-only deploy (backend untouched), as on 2026-09-22.

## Out of scope

- Favicon / PWA icons (`public/icon.svg`, `apple-icon.png`) — brand assets, not UI icons.
- Icons drawn inside three.js (panorama beacons, gizmo) — scene geometry, not the icon set.
- Typographic `→` / `·` in sentences (D4) and the characters under "Deliberately stays text".
