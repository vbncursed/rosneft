# Tooltip — design

**Date:** 2026-09-22 · **Status:** approved in brainstorming, awaiting spec review
**Scope:** `frontend/` only.

## Goal

A shared `Tooltip` for the SPA, and every icon-only control wired to it — the viewer's tool
rail first. Today those controls rely on the native `title`: it appears after ~1 s as an OS
chip, never on keyboard focus, never on a disabled button, and it does not match the design.

## Decisions (brainstorming, 2026-09-22)

| # | Decision | Why |
|---|---|---|
| T1 | Scope: the tool rail **and every icon-only control**, plus disabled buttons whose `title` explains why | One look wherever an icon has no label; the disabled reasons are the ones users cannot see today |
| T2 | **Popover API + own placement function**, no dependency | The popover top layer escapes `overflow-hidden` (Overlays panel), stacking contexts and the canvas; placement is a pure, tested function like `tour-geometry.ts`. CSS anchor positioning is not safe in the desktop shell's WebKit on older macOS; a positioning library is a dependency for one component |
| T3 | Hover: **500 ms** delay; a tooltip opened within **300 ms** of another one closing opens **instantly, without the enter animation** (shared warm-up) | No flicker when the pointer crosses the UI; the rail reads in one sweep |
| T4 | Keyboard: opens **immediately on `:focus-visible`**, not on a focus that follows a mouse click | Keyboard users get the name; mouse users are not shown it twice |
| T5 | Closes on pointer leave, blur, **Esc** (consumed only when a tooltip is open — it must not also close the modal underneath) and on press of the trigger | Standard; a pressed control has done its job |
| T6 | **No tooltips on touch** (`pointerType !== "mouse"` never opens one; hover-less devices) | No hover on touch; long-press belongs to the OS. The accessible name is unchanged |
| T7 | Motion: enter 120 ms, opacity + 2 px translate away from the trigger, `ease-out` token; exit instant; reduced motion keeps opacity only | Tooltips are frequent, small UI — fast, directional, no exit animation |
| T8 | Placement: `side` `"top"` (default) or `"bottom"`; flips when it does not fit; clamped 8 px inside the viewport; 6 px gap from the trigger | Rail sits at the top edge → `bottom`; everything else reads naturally above |
| T9 | Look: `panel-2` ground, `line-2` border, radius 6, 11 px text, `fg`; optional shortcut drawn with the existing keycap style | Matches the viewer's chrome; `Measure` + `M` teaches the key |
| T10 | a11y: `role="tooltip"`; trigger gets `aria-describedby` **only while open**; accessible names unchanged; the native `title` is removed wherever a Tooltip replaces it (no double tooltip) | WAI-ARIA tooltip pattern; screen readers keep the name they have |

## API

`shared/ui/tooltip`:

```tsx
<Tooltip label="Measure" shortcut="M" side="bottom">
  <button aria-label="Measure" …>…</button>
</Tooltip>
```

- Wraps **one** element. It adds pointer/focus/key handlers and, while open, `aria-describedby`
  to that element (props merged, the child's own handlers still called).
- A **disabled** child cannot receive pointer events, so Tooltip wraps it in a
  `<span class="inline-flex">` that takes the hover; the tooltip still names the reason.
- Props: `label: string`, `shortcut?: string`, `side?: "top" | "bottom"`, `children: ReactElement`.
- Files: `tooltip.tsx` (component + popover element), `use-tooltip.ts` (timers, shared warm-up
  clock, Esc), `model/tooltip-geometry.ts` (pure placement: trigger rect + tooltip size +
  viewport → `{ top, left, side }`), specs, `tooltip.fixture.tsx`, `index.ts`.

## Integration

**Shared components (one edit each):**

| Component | Change |
|---|---|
| `shared/ui/tool-rail` | Each tile wrapped, `side="bottom"`; new `ToolRailItem.shortcut?: string` → tooltip keycap + `aria-keyshortcuts`; `title` removed. In `viewer-overlays.tsx` `"Measure (M)"` becomes name `"Measure"` + `shortcut: "M"` (update the tests and the tour/`aria-label` expectations that pin "Measure (M)") |
| `shared/ui/button` `shape="icon"` | Shows a tooltip from its `aria-label` by default; `tooltip?: { label: string; shortcut?: string } \| false` overrides or disables. Covers: model-detail delete, territory-catalog replace/delete, model-library delete, upload queue remove, view-tab section-head upload |
| `shared/ui/collapsed-rail` | Expand button wrapped; `title` removed |
| `shared/ui/viewport-window` | Title-bar actions wrapped; drag handle "Drag to move" and resize corner "Resize" get tooltips (hover only — they are pointer-only spans); `title`s removed |
| `shared/ui/drawer`, `shared/ui/toast` | Close / dismiss wrapped |
| `shared/ui/menu` | Trigger wrapped with `triggerLabel` (kebab) |
| `shared/ui/date-picker`, `shared/ui/quantity-stepper`, `shared/ui/password-field` | Their icon buttons wrapped |

**Plain `<button>`s wrapped at the call site (and `title` removed):** the six inspector Close
buttons (`widgets/{content,alert,access,record,role,person}-inspector`), audit filter-chip
removes (`features/audit-filter/ui/filter-bar.tsx`), role-chip remove
(`features/role-assign/ui/role-chips.tsx`), upload-modal close, anchor-card close
(`widgets/view-tab/ui/anchor-card.tsx`), panorama-row edit, Overlays collapse
(`widgets/overlays-panel/ui/overlays-panel.tsx`), calibration −/+ (`calibration-card.tsx`),
placement rename/delete (`entities/placement/ui/instance-row.tsx`).

**Disabled with a reason:**
- `pages/model-detail/ui/model-detail-page.tsx` delete: tooltip "In use on N territories"
  (today only in `title`); the reason is also appended to the `aria-label`, as
  `model-library-page.tsx` already does, so keyboard and screen-reader users get it.
- `pages/model-library/ui/model-library-page.tsx` delete: tooltip "Remove its placements first".
- `widgets/permission-matrix/ui/permission-matrix.tsx` locked chip: tooltip with
  `LOCKED_TITLE` / the description (it has visible text, but this `title` is an explanation,
  not a duplicate).

**Left alone:** 3D scene markers (`point-marker`, `panorama-marker` — scene elements with their
own hit and hover behaviour), `title`s on controls whose visible text says the same, the
`iframe` title, the QR code, the truncated model name in `model-picker-card` (shows the full
text, not an action hint), `measurement-segment` (visible text; its title is a usage hint —
kept native for now).

## Testing and verification

- `tooltip-geometry.spec.ts`: bottom and top placement, flip at each edge, horizontal clamp to
  8 px, centring on the trigger.
- `tooltip.spec.tsx` / `use-tooltip.spec.ts` (fake timers): opens after 500 ms of hover, not
  before; a second trigger within 300 ms opens instantly; opens on keyboard focus, not on a
  focus that follows a mouse click; closes on leave, blur, Esc (and Esc does not propagate
  when a tooltip closed), trigger press; touch pointer never opens; `role="tooltip"`,
  `aria-describedby` present only while open; disabled child wrapped and still shows.
- Call-site specs: `title` gone where replaced; names unchanged except `"Measure (M)"` →
  `"Measure"` + `aria-keyshortcuts="M"`; model-detail delete name includes the reason.
- Cosmos fixture: top/bottom, shortcut, disabled, near each viewport edge.
- Live (Chromium, local stack, 1280×800, both themes): tool rail sweep (warm-up), Overlays
  panel collapse, PDF window actions/grip/corner, a modal close, an inspector close, keyboard
  Tab through the rail, Esc inside a modal, a near-edge button. Screenshots + a short screen
  capture of the rail sweep.
- Design pass against emilkowalski skills (timing, motion, weight, placement).
- Gate: `yarn lint`, `yarn test:coverage` (90/85/90/90), 200-line cap.

## Rollout

`dev` → PR to `main` → `/code-review` → SPA-only deploy.
