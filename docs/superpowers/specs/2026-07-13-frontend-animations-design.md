# Frontend animations with `motion` — design

Date: 2026-07-13
Status: approved
Scope: frontend only (`frontend/`). Backend untouched.

## Goal

Introduce intentional UI animations using the `motion` library (the current
name of framer-motion; import path `motion/react`). Cover four surfaces:
overlays, page/list transitions, viewer panels, onboarding tour. Keep Clean
Architecture + DDD boundaries intact, respect the hard 200-line-per-file cap,
use `@/*` aliases everywhere, bump dependencies (minor/patch only), and add
tests for the pure logic.

## Constraints (hard)

- **Layering**: all `motion` code lives in `presentation/` only. Domain,
  application, and infrastructure layers never import `motion`. No new
  presentation→infrastructure dependency.
- **200 lines/file**: enforced by ESLint `max-lines` (skipBlankLines,
  skipComments). Run `yarn lint` after every change. Extract, never cram.
- **Aliases**: single entry point `@/shared/presentation/motion`. No deep
  relative imports across contexts.
- **Backend**: not touched. No OpenAPI regen.
- **Library update scope**: minor/patch only. No major bumps (typescript 7,
  eslint 10 deferred to separate work).

## Approach

Chosen: **A — centralized motion module + reusable presentation wrappers.**
Shared variants, transition presets, and a reduced-motion helper live in
`@/shared/presentation/motion/`. Reusable wrapper components
(`MotionOverlay`, `MotionModal`, `MotionDrawer`, `MotionList`/`MotionItem`)
encapsulate `AnimatePresence` so each surface wires up in one line and stays
well under 200 lines. Wrappers are intentionally built now (user chose the
future-proof version over strict YAGNI).

Rejected: B (inline motion — duplicates variants, risks 200-line overflow,
inconsistent timing). C (CSS-only — user explicitly wants framer-motion).

## Dependencies

Add:
- `motion` (latest v12+), imported as `motion/react`.

Bump (minor/patch, no breaking changes):
- `next` + `eslint-config-next` → 16.2.10
- `tailwindcss` + `@tailwindcss/postcss` → 4.3.2
- `three` → 0.185.1, `@types/three` → 0.185.1
- `three-mesh-bvh` → 0.9.11
- `eslint` → 9.39.5
- `@types/node` → 26.1.1

## Shared motion module — `frontend/src/shared/presentation/motion/`

Each file focused and well under 200 lines.

Pure data (unit-tested):
- `variants.ts` — `fade`, `scaleFade`, `slideRight`, `slideUp`, `listStagger`,
  `listItem`. Plain variant objects.
- `transitions.ts` — timing presets: `quick` (~0.15s), `smooth` (~0.25s),
  `spring`. Anchored to the current feel (existing dropdown-enter is 120ms).
- `reduced-motion.ts` — helper (`useReducedMotionVariants(v)` / factory) that
  returns instantaneous variants when `prefers-reduced-motion` is set. Pure
  branching logic → the primary unit-test target.

Reusable wrappers (presentation components):
- `motion-overlay.tsx` — `<MotionOverlay>`: `fade` backdrop + container,
  encapsulates `AnimatePresence`. Base for modals/drawers. Props: `open`,
  `onClose`, `children`.
- `motion-modal.tsx` — `<MotionModal>`: centered dialog with `scaleFade`,
  built on `MotionOverlay`.
- `motion-drawer.tsx` — `<MotionDrawer>`: side panel with `slideRight`, `side`
  prop.
- `motion-list.tsx` — `<MotionList>` / `<MotionItem>`: stagger container +
  item for card grids.
- `index.ts` — re-exports; the single alias entry `@/shared/presentation/motion`.

Wrappers stay thin: they accept `open`/`onClose`/`children` and expose only
motion behavior. This keeps all motion mechanics out of the calling components,
which removes the 200-line risk from `panorama-edit-panel`/`model-viewer`.

## Per-surface changes

**Overlays**
- `confirm-modal.tsx` — wrap the active dialog in `MotionModal` /
  `AnimatePresence` (it already mounts once from a store; presence keyed on the
  active dialog).
- `toaster.tsx` — toasts become `motion.li` inside `AnimatePresence`, keyed by
  `toast.id` (enter + exit).
- `dropdown.tsx` — replace the CSS `dropdown-enter` keyframe with
  `AnimatePresence` so the menu now animates on exit too. Remove the now-dead
  `@keyframes dropdown-enter` from `globals.css` if nothing else uses it.
- Console/territory drawers (`edit-roles-drawer`, `create-user-drawer`,
  `edit-roles`/`role-detail`, `assign-admins-drawer`, `replace-source-form`
  where drawer-shaped) — adopt `MotionDrawer` (`slideRight`), backdrop `fade`.

**Pages / lists**
- Territory/model card grids — wrap the grid in a small client `MotionList` and
  cards in `MotionItem` (`listStagger`/`listItem`). RSC pages cannot hold motion
  state, so the grid wrapper is a small client component.
- Route transitions kept minimal (fade-in of the list). No heavy layout/shared
  transition.

**Viewer panels**
- `ui-overlay`, `overlays-panel`, `model-info-panel`, `panorama-edit-panel` —
  slide/fade on open via `AnimatePresence` (`slideUp`/`fade` as fits each).

**Onboarding tour**
- fade/scale on the current step highlight.

## 200-line strategy

- Wrappers absorb motion volume, so calling components change by ~1–3 lines.
- At-risk files: `panorama-edit-panel.tsx` (215 non-blank), `model-viewer.tsx`
  (214). If a change still risks the cap, extract a sub-section into a new file
  in the same `presentation/` folder rather than inlining variants.
- Out of scope (not touched): `scene-canvas.tsx` (277), `use-placements-editor.ts`
  (214) — the 3D canvas and an application hook, unrelated to animations.
- `yarn lint` after each edit catches any regression.

## Testing

- Unit (`node --test`, `src/**/*.test.ts`): `reduced-motion.ts` (variant
  switching by flag) and the shape/validity of variant presets. Visual
  animations are not unit-tested.
- E2E: existing headless-Chrome/CDP pattern with `prefers-reduced-motion`
  emulation — smoke that overlays mount/unmount and pages don't crash. No new
  Playwright infrastructure.
- Gate: `yarn lint` + `yarn build` + `yarn test` all green.

## Accessibility

`prefers-reduced-motion` is respected via `reduced-motion.ts` — reduced motion
collapses animations to near-instant transitions rather than removing state
changes. Not treated as optional.
