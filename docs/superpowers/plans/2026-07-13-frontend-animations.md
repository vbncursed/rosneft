# Frontend Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intentional UI animations across overlays, card grids, viewer panels, and the onboarding tour using the `motion` library, behind a small shared motion module.

**Architecture:** All animation code lives in `presentation/` only. A shared module `@/shared/presentation/motion/` holds pure variant/transition presets, a reduced-motion helper, and thin reusable wrappers (`MotionOverlay`/`MotionModal`/`MotionDrawer`/`MotionList`) that encapsulate `AnimatePresence`. Surfaces wire up in 1–3 lines each, keeping every file under the 200-line cap.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript strict, `motion` (import `motion/react`), Node built-in test runner (`node:test`), ESLint flat config with `max-lines: 200`.

## Global Constraints

- **200 lines/file** — ESLint `max-lines` (skipBlankLines, skipComments). Run `yarn lint` after every task; a task is not done until lint is clean.
- **Layering** — `motion` is imported only in `presentation/` files. Domain/application/infrastructure never import it.
- **Aliases** — import the motion module via `@/shared/presentation/motion` (barrel) or `@/shared/presentation/motion/<file>`. No cross-context relative imports.
- **Library import path** — always `motion/react`, never `framer-motion`.
- **Dependency updates** — minor/patch only. No major bumps (typescript 7, eslint 10 are out of scope).
- **Brand copy** — never introduce the word "Rosneft"/"Роснефть" in displayed text; the brand is "Andrey".
- **Backend** — untouched. No OpenAPI regen.
- **Accessibility** — every animated surface respects `prefers-reduced-motion` via the reduced-motion helper.
- **Commands** run from `frontend/`: `yarn dev`, `yarn build`, `yarn lint`, `yarn test`.

---

### Task 1: Dependencies — add `motion`, bump minor/patch

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: the `motion` package (import `motion/react`) available to all later tasks.

- [ ] **Step 1: Record the green baseline**

Run (from `frontend/`):
```bash
yarn lint && yarn build && yarn test
```
Expected: all three succeed. If anything fails before you start, stop and report — do not begin on a red baseline.

- [ ] **Step 2: Add motion and apply minor/patch bumps**

Run:
```bash
yarn add motion
yarn add next@16.2.10
yarn add three@0.185.1
yarn add three-mesh-bvh@0.9.11
yarn add -D eslint-config-next@16.2.10 @tailwindcss/postcss@4.3.2 tailwindcss@4.3.2 \
  @types/three@0.185.1 eslint@9.39.5 @types/node@26.1.1
```

- [ ] **Step 3: Verify the toolchain still builds**

Run:
```bash
yarn lint && yarn build && yarn test
```
Expected: all green. `three` 0.185 is a minor bump — if the viewer build surfaces a type error from `@types/three`, that is the only expected risk; fix the specific type reference and re-run. Do not proceed until green.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/yarn.lock
git commit -m "chore(deps): add motion, bump minor/patch versions"
```

---

### Task 2: Motion presets — variants + transitions

**Files:**
- Create: `frontend/src/shared/presentation/motion/variants.ts`
- Create: `frontend/src/shared/presentation/motion/transitions.ts`
- Test: `frontend/src/shared/presentation/motion/presets.test.ts`

**Interfaces:**
- Produces:
  - `variants.ts` exports `fade`, `scaleFade`, `slideRight`, `slideUp`, `listStagger`, `listItem` — each a `Variants` with `hidden`/`visible` keys (`listStagger.visible` carries `transition.staggerChildren`).
  - `transitions.ts` exports `quick`, `smooth`, `spring` — each a `Transition`.

- [ ] **Step 1: Write the failing test**

`frontend/src/shared/presentation/motion/presets.test.ts`:
```ts
// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { fade, scaleFade, slideRight, slideUp, listStagger, listItem } from "./variants.ts";
import { quick, smooth, spring } from "./transitions.ts";

test("every variant defines hidden and visible states", () => {
  for (const v of [fade, scaleFade, slideRight, slideUp, listStagger, listItem]) {
    assert.ok("hidden" in v, "missing hidden");
    assert.ok("visible" in v, "missing visible");
  }
});

test("listStagger drives its children", () => {
  const visible = listStagger.visible as { transition?: { staggerChildren?: number } };
  assert.ok((visible.transition?.staggerChildren ?? 0) > 0);
});

test("transitions carry a positive duration or a spring type", () => {
  assert.equal(quick.duration, 0.15);
  assert.equal(smooth.duration, 0.25);
  assert.equal((spring as { type?: string }).type, "spring");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test 2>&1 | grep -A2 presets`
Expected: FAIL — cannot resolve `./variants.ts` / `./transitions.ts`.

- [ ] **Step 3: Write `transitions.ts`**

```ts
import type { Transition } from "motion/react";

// Timing presets, anchored to the app's existing feel (the old dropdown-enter
// keyframe was 120ms). quick = menus/toasts, smooth = modals/panels.
export const quick: Transition = { duration: 0.15, ease: "easeOut" };
export const smooth: Transition = { duration: 0.25, ease: "easeOut" };
export const spring: Transition = { type: "spring", stiffness: 400, damping: 32 };
```

- [ ] **Step 4: Write `variants.ts`**

```ts
import type { Variants } from "motion/react";

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -2 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0 },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

// Container drives its MotionItem children in sequence.
export const listStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test 2>&1 | grep -A2 presets` → Expected: PASS.
Run: `yarn lint` → Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/presentation/motion/variants.ts \
  frontend/src/shared/presentation/motion/transitions.ts \
  frontend/src/shared/presentation/motion/presets.test.ts
git commit -m "feat(motion): add shared variant and transition presets"
```

---

### Task 3: Reduced-motion helper

**Files:**
- Create: `frontend/src/shared/presentation/motion/reduced-motion.ts`
- Test: `frontend/src/shared/presentation/motion/reduced-motion.test.ts`

**Interfaces:**
- Consumes: `Variants` from `motion/react`.
- Produces:
  - `resolveVariants(variants: Variants, reduced: boolean): Variants` — pure; when `reduced`, returns a plain opacity crossfade (state change preserved, movement/scale dropped); otherwise returns `variants` unchanged.
  - `useResolvedVariants(variants: Variants): Variants` — client hook wrapping `useReducedMotion()`.

- [ ] **Step 1: Write the failing test**

`frontend/src/shared/presentation/motion/reduced-motion.test.ts`:
```ts
// Run with: yarn test
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveVariants } from "./reduced-motion.ts";
import { slideRight } from "./variants.ts";

test("passes variants through untouched when motion is allowed", () => {
  assert.equal(resolveVariants(slideRight, false), slideRight);
});

test("collapses to an opacity-only crossfade when reduced", () => {
  const r = resolveVariants(slideRight, true) as {
    hidden: Record<string, unknown>;
    visible: Record<string, unknown>;
  };
  assert.deepEqual(r.hidden, { opacity: 0 });
  assert.deepEqual(r.visible, { opacity: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test 2>&1 | grep -A2 reduced-motion`
Expected: FAIL — cannot resolve `./reduced-motion.ts`.

- [ ] **Step 3: Write `reduced-motion.ts`**

```ts
"use client";

import { useReducedMotion, type Variants } from "motion/react";

// resolveVariants keeps the state change (mount/unmount still cross-fades) but
// drops movement and scale for users who prefer reduced motion. Pure so it can
// be unit-tested without a renderer.
export function resolveVariants(variants: Variants, reduced: boolean): Variants {
  if (!reduced) return variants;
  return { hidden: { opacity: 0 }, visible: { opacity: 1 } };
}

export function useResolvedVariants(variants: Variants): Variants {
  return resolveVariants(variants, useReducedMotion() ?? false);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test 2>&1 | grep -A2 reduced-motion` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/presentation/motion/reduced-motion.ts \
  frontend/src/shared/presentation/motion/reduced-motion.test.ts
git commit -m "feat(motion): add reduced-motion variant helper"
```

---

### Task 4: Reusable wrapper components + barrel

**Files:**
- Create: `frontend/src/shared/presentation/motion/motion-overlay.tsx`
- Create: `frontend/src/shared/presentation/motion/motion-modal.tsx`
- Create: `frontend/src/shared/presentation/motion/motion-drawer.tsx`
- Create: `frontend/src/shared/presentation/motion/motion-list.tsx`
- Create: `frontend/src/shared/presentation/motion/index.ts`

**Interfaces:**
- Consumes: presets (Task 2), `useResolvedVariants` (Task 3).
- Produces (consumed by Tasks 5–10):
  - `MotionOverlay({ open, onClose?, children, className? })` — fading backdrop shell; `AnimatePresence` on `open`; backdrop click (target === currentTarget) calls `onClose`. Default className is the app's fixed centering backdrop.
  - `MotionModal({ open, onClose?, children, className? })` — `MotionOverlay` + a `scaleFade` panel; `className` styles the panel box.
  - `MotionDrawer({ open, onClose?, side?, children, className? })` — `MotionOverlay` + a `slideRight` panel anchored to `side` (`"right"` default). No current consumer; provided per the future-proofing decision.
  - `MotionList({ children, className? })` and `MotionItem({ children, className? })` — stagger container + item.

- [ ] **Step 1: Write `motion-overlay.tsx`**

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { fade } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

// Shared fading backdrop + centering shell for modals and drawers.
// AnimatePresence keeps the subtree mounted through its exit animation.
export default function MotionOverlay({ open, onClose, children, className }: MotionOverlayProps) {
  const backdrop = useResolvedVariants(fade);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={smooth}
          onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
          className={
            className ??
            "fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          }
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Write `motion-modal.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import MotionOverlay from "@/shared/presentation/motion/motion-overlay";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  // Styles the panel box (border/bg/padding/width).
  className?: string;
}

// Centered dialog: scaleFade panel over a fading backdrop.
export default function MotionModal({ open, onClose, children, className }: MotionModalProps) {
  const panel = useResolvedVariants(scaleFade);
  return (
    <MotionOverlay open={open} onClose={onClose}>
      <motion.div
        variants={panel}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={smooth}
        className={className}
      >
        {children}
      </motion.div>
    </MotionOverlay>
  );
}
```

- [ ] **Step 3: Write `motion-drawer.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import MotionOverlay from "@/shared/presentation/motion/motion-overlay";
import { slideRight } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionDrawerProps {
  open: boolean;
  onClose?: () => void;
  side?: "right" | "left";
  children: ReactNode;
  className?: string;
}

// ponytail: side panel wrapper — no current consumer, kept as the agreed
// future-proof surface. Delete if it stays unused.
export default function MotionDrawer({ open, onClose, side = "right", children, className }: MotionDrawerProps) {
  const panel = useResolvedVariants(slideRight);
  const anchor = side === "right" ? "ml-auto" : "mr-auto";
  return (
    <MotionOverlay open={open} onClose={onClose}>
      <motion.div
        variants={panel}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={smooth}
        className={`${anchor} ${className ?? ""}`.trim()}
      >
        {children}
      </motion.div>
    </MotionOverlay>
  );
}
```

- [ ] **Step 4: Write `motion-list.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { listStagger, listItem } from "@/shared/presentation/motion/variants";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

// Stagger container. Renders on the server as hidden, then animates in on
// hydration — safe to drop around an RSC-rendered grid.
export function MotionList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={listStagger} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className }: { children: ReactNode; className?: string }) {
  const item = useResolvedVariants(listItem);
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 5: Write `index.ts`**

```ts
export * from "./variants";
export * from "./transitions";
export * from "./reduced-motion";
export { default as MotionOverlay } from "./motion-overlay";
export { default as MotionModal } from "./motion-modal";
export { default as MotionDrawer } from "./motion-drawer";
export { MotionList, MotionItem } from "./motion-list";
```

- [ ] **Step 6: Verify build + lint (typecheck is the gate here)**

Run: `yarn lint && yarn build`
Expected: clean. Every wrapper is well under 200 lines.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/presentation/motion/
git commit -m "feat(motion): add MotionOverlay/Modal/Drawer/List wrappers"
```

---

### Task 5: Animate overlays — confirm modal + toaster

**Files:**
- Modify: `frontend/src/shared/presentation/confirm/confirm-modal.tsx`
- Modify: `frontend/src/shared/presentation/toast/toaster.tsx`

**Interfaces:**
- Consumes: `MotionModal` (Task 4), `motion`/`AnimatePresence` from `motion/react`.

- [ ] **Step 1: Refactor `confirm-modal.tsx` to render the body inside `MotionModal`**

The current file wraps the dialog in its own backdrop + panel `<div>`s. Move those responsibilities to `MotionModal`, keep the body (title/message/field/buttons) and its effects. Keep the last request during exit so the panel animates out with its content.

Replace the top of the file:
```tsx
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ConfirmRequest } from "@/shared/presentation/confirm/confirm";
import {
  getServerSnapshot,
  getSnapshot,
  resolveActive,
  subscribe,
} from "@/shared/presentation/confirm/confirm-store";
import OtpInput from "@/shared/presentation/components/otp-input";
import MotionModal from "@/shared/presentation/motion/motion-modal";

export default function ConfirmModal() {
  const req = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Retain the last request so the panel keeps its content while animating out.
  const last = useRef<ConfirmRequest | null>(null);
  if (req) last.current = req;
  const shown = req ?? last.current;
  return (
    <MotionModal
      open={!!req}
      onClose={() => resolveActive(false)}
      className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
    >
      {shown ? <DialogBody request={shown} /> : null}
    </MotionModal>
  );
}
```

Rename the existing `Dialog` function to `DialogBody` and delete its outer two `<div>`s (the backdrop `<div role="dialog" … className="fixed inset-0 …">` and the panel `<div className="mx-4 … p-6 …">`). Keep everything inside the panel — the title `<h2>`, message `<p>`, the segmented/field/alt inputs, and the button row — as the returned fragment. Move `role="dialog"`, `aria-modal`, and `aria-labelledby` onto the returned root element (wrap the body in a `<div role="dialog" aria-modal="true" aria-labelledby={…}>` that has no positioning classes). Keep the `useEffect` (body-overflow lock, focus, Esc/Enter) and `confirmTone` exactly as-is.

- [ ] **Step 2: Animate the toast stack in `toaster.tsx`**

Wrap the map in `AnimatePresence` and make each card a `motion.div`:
```tsx
"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Toast } from "@/shared/presentation/toast/toast";
import {
  dismiss,
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "@/shared/presentation/toast/toast-store";
import { slideRight } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";
```
Change the container body:
```tsx
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
```
In `ToastCard`, change the root `<div …>` to a `motion.div` with `layout` (so surviving cards slide up as one is removed) and the slide variant:
```tsx
function ToastCard({ toast }: { toast: Toast }) {
  const palette = tone[toast.kind];
  const anim = useResolvedVariants(slideRight);
  return (
    <motion.div
      layout
      variants={anim}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={smooth}
      role={toast.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${palette.ring} px-4 py-3 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md`}
    >
      {/* …existing span/p/button unchanged… */}
    </motion.div>
  );
}
```
(The tone table and inner span/p/button stay unchanged.)

- [ ] **Step 3: Verify**

Run: `yarn lint && yarn build && yarn test`
Expected: all green; both files under 200 lines.

- [ ] **Step 4: Drive it (manual smoke)**

Run `yarn dev`, trigger a delete-confirm dialog and a toast (e.g. attempt a delete). Confirm the modal scales in / out and toasts slide in and slide out on dismiss.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/presentation/confirm/confirm-modal.tsx \
  frontend/src/shared/presentation/toast/toaster.tsx
git commit -m "feat(motion): animate confirm modal and toast stack"
```

---

### Task 6: Animate dropdown menu enter/exit + remove dead keyframe

**Files:**
- Modify: `frontend/src/shared/presentation/components/dropdown/dropdown.tsx:167-178`
- Modify: `frontend/src/shared/presentation/components/dropdown/dropdown-menu.tsx` (read first)
- Modify: `frontend/src/app/globals.css` (remove `@keyframes dropdown-enter` + `.dropdown-menu-enter`)

**Interfaces:**
- Consumes: `AnimatePresence`/`motion` from `motion/react`, `scaleFade`, `quick`, `useResolvedVariants`.

- [ ] **Step 1: Read `dropdown-menu.tsx`**

Run: `sed -n '1,200p' frontend/src/shared/presentation/components/dropdown/dropdown-menu.tsx`
Note the outer element that carries the `dropdown-menu-enter` class (the portaled menu root).

- [ ] **Step 2: Wrap the conditional in `dropdown.tsx` with `AnimatePresence`**

At `dropdown.tsx:167`, change:
```tsx
      {open ? (
        <DropdownMenu … />
      ) : null}
```
to:
```tsx
      <AnimatePresence>
        {open ? (
          <DropdownMenu … />
        ) : null}
      </AnimatePresence>
```
Add `import { AnimatePresence } from "motion/react";` at the top.

- [ ] **Step 3: Make the menu root a `motion` element in `dropdown-menu.tsx`**

Convert the outer menu element (the one with `className="… dropdown-menu-enter"`) to `motion.div` (keep it wrapping the portaled `<ul role="listbox">`), remove the `dropdown-menu-enter` class, and add:
```tsx
import { motion } from "motion/react";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";
```
On the root element:
```tsx
  const anim = useResolvedVariants(scaleFade);
  // …
  <motion.div variants={anim} initial="hidden" animate="visible" exit="hidden" transition={quick} …>
```
Keep the portal, `rect` positioning styles, and listbox markup unchanged. If the menu currently renders `<ul>` as the outer element, wrap it: `motion.div` (positioned) → `<ul>` (unchanged), moving the positioning/`style` onto the `motion.div`.

- [ ] **Step 4: Remove the dead keyframe from `globals.css`**

Delete the `@keyframes dropdown-enter { … }` block and the `.dropdown-menu-enter { animation: … }` rule (they are now unused). Leave `@keyframes drift` and the rest of the file untouched.

Verify nothing else references the class:
```bash
grep -rn "dropdown-menu-enter\|dropdown-enter" frontend/src
```
Expected: no matches after the edit.

- [ ] **Step 5: Verify + smoke**

Run: `yarn lint && yarn build`. Then `yarn dev` and open any dropdown (e.g. the viewer view-selector) — it should scale in on open and out on close.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/presentation/components/dropdown/ frontend/src/app/globals.css
git commit -m "feat(motion): animate dropdown enter/exit, drop CSS keyframe"
```

---

### Task 7: Animate console/territory modals → MotionModal

**Files:**
- Modify: `frontend/src/auth/presentation/console/edit-roles-drawer.tsx:39-41,73-74`
- Modify: `frontend/src/auth/presentation/console/create-user-drawer.tsx` (read first)
- Modify: `frontend/src/auth/presentation/console/edit-roles-drawer.tsx` and siblings that render the same centered `fixed inset-0 … flex items-center justify-center` backdrop pattern: `role-detail.tsx`, `assign-admins-drawer.tsx` (territory), `replace-source-form.tsx` (only if modal-shaped)

**Interfaces:**
- Consumes: `MotionModal` (Task 4). Each modal exposes an `onClose` prop already.

Apply the same transformation to each file. Below is the concrete edit for `edit-roles-drawer.tsx`; repeat the identical shape for the others (they share the backdrop/panel markup).

- [ ] **Step 1: Convert `edit-roles-drawer.tsx`**

Add import:
```tsx
import MotionModal from "@/shared/presentation/motion/motion-modal";
```
Replace the outer backdrop `<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={…}>` and the inner panel `<div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6">` with a single `MotionModal`:
```tsx
  return (
    <MotionModal
      open
      onClose={onClose}
      className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6"
    >
      {/* …existing panel contents unchanged: the <p>Roles·… down to the button row… */}
    </MotionModal>
  );
```
`open` is always `true` here because the parent conditionally renders the drawer; when the parent stops rendering it, `MotionModal`'s `AnimatePresence` still needs the element to persist for exit. **Therefore also lift the mount to `open`:** in the parent that renders `<EditRolesDrawer … />` conditionally (`console` page/table), keep the component always mounted and pass an `open` boolean instead — OR (simpler, preferred) leave the parent conditional as-is and accept enter-only animation. Pick the simpler path: keep parent conditional, pass `open` (enter animates; exit is instant). Document the choice with a one-line comment. Do not add exit plumbing unless a reviewer asks.

- [ ] **Step 2: Read and convert `create-user-drawer.tsx` and the siblings**

Run: `sed -n '1,220p' frontend/src/auth/presentation/console/create-user-drawer.tsx`
Apply the same MotionModal swap (backdrop+panel → `MotionModal open onClose className`). Do the same for `role-detail.tsx` and `assign-admins-drawer.tsx` if they use the identical centered backdrop. Skip any file that is not a centered modal.

- [ ] **Step 3: Verify**

Run: `yarn lint && yarn build`. Each touched file must stay under 200 lines (the swap removes two wrapper divs, so line count drops).

- [ ] **Step 4: Smoke + commit**

`yarn dev`, open the console, edit a user's roles — the modal scales in. Then:
```bash
git add frontend/src/auth/presentation/console/
git commit -m "feat(motion): animate console modals via MotionModal"
```

---

### Task 8: Stagger the catalog card grids

**Files:**
- Modify: `frontend/src/app/page.tsx:117-158`
- Modify: `frontend/src/app/models/page.tsx` (read first — same grid shape)
- Modify: `frontend/src/app/territories/page.tsx` (read first)

**Interfaces:**
- Consumes: `MotionList`, `MotionItem` (Task 4). These are client components rendered from RSC pages (allowed — server renders client wrappers with server children inside).

- [ ] **Step 1: Convert the grid in `app/page.tsx`**

Add import:
```tsx
import { MotionList, MotionItem } from "@/shared/presentation/motion";
```
Change the grid container and each card wrapper:
```tsx
        <MotionList className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const href = itemHref(item);
            const Card = ( /* …unchanged… */ );
            return (
              <MotionItem key={item.slug} className="relative">
                {/* …unchanged Link/Card + renderDelete block… */}
              </MotionItem>
            );
          })}
        </MotionList>
```
(Only the two wrapper elements change: `<div className="…grid…">` → `<MotionList className="…grid…">`, and `<div key={item.slug} className="relative">` → `<MotionItem key={item.slug} className="relative">`.)

- [ ] **Step 2: Read and convert `models/page.tsx` and `territories/page.tsx`**

Run: `sed -n '1,200p' frontend/src/app/models/page.tsx` and the territories page. If they render their own card grid (same `grid gap-… ` container with a `.map`), apply the same `MotionList`/`MotionItem` swap. If they reuse the `Section` from `app/page.tsx`, no further change is needed.

- [ ] **Step 3: Verify + smoke**

Run: `yarn lint && yarn build`. `yarn dev`, load the home page — cards fade/rise in with a stagger. Reduce motion in OS settings and reload — cards cross-fade with no movement.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/models/page.tsx frontend/src/app/territories/page.tsx
git commit -m "feat(motion): stagger catalog card grids"
```

---

### Task 9: Animate viewer panels

**Files:**
- Modify: `frontend/src/viewer/presentation/components/overlays-panel.tsx` (read first — toggled panel)
- Modify: `frontend/src/panorama/presentation/components/panorama-edit-panel.tsx` (215 non-blank — watch the cap)
- Modify: `frontend/src/viewer/presentation/components/model-info-panel.tsx` (mount fade)

**Interfaces:**
- Consumes: `AnimatePresence`/`motion` from `motion/react`, `slideUp`, `smooth`, `useResolvedVariants`. These panels are inline (no backdrop), so they use `motion.div` + `AnimatePresence` directly — NOT `MotionOverlay`.

- [ ] **Step 1: Read the panels and find the toggle boundary**

Run: `sed -n '1,200p' frontend/src/viewer/presentation/components/overlays-panel.tsx` and the panorama-edit-panel. Identify where the panel is conditionally rendered (a parent `open`/`selected` flag or an internal collapsed state).

- [ ] **Step 2: Wrap the toggled panels**

For a panel currently rendered as `{open ? <Panel … /> : null}` (in its parent), wrap:
```tsx
<AnimatePresence>
  {open ? <Panel … /> : null}
</AnimatePresence>
```
and make the panel's own root a `motion.div`:
```tsx
const anim = useResolvedVariants(slideUp);
// …
<motion.div variants={anim} initial="hidden" animate="visible" exit="hidden" transition={smooth} className={/* existing root classes */}>
```
Add imports:
```tsx
import { AnimatePresence, motion } from "motion/react"; // AnimatePresence only in the parent
import { slideUp } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";
```

- [ ] **Step 3: 200-line guard on `panorama-edit-panel.tsx`**

Run: `yarn lint`. If `max-lines` now fails on `panorama-edit-panel.tsx`, extract a cohesive sub-section (e.g. the default-view controls or the marker list block) into a sibling file in the same `presentation/components/` folder and import it back. Do NOT inline variant objects — they come from the module. Re-run `yarn lint` until clean.

- [ ] **Step 4: `model-info-panel.tsx` mount fade**

Make its root a `motion.div` with `fade` + `initial="hidden" animate="visible"` (no `AnimatePresence` needed — it stays mounted; this is a one-shot fade-in). Keep all existing classes and content.

- [ ] **Step 5: Verify + smoke**

Run: `yarn lint && yarn build`. `yarn dev`, open a territory, toggle the overlays panel and (for a panorama) the edit panel — they slide/fade in and out.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/viewer/presentation/components/ frontend/src/panorama/presentation/components/
git commit -m "feat(motion): animate viewer overlays/info/edit panels"
```

---

### Task 10: Animate the onboarding tour card

**Files:**
- Modify: `frontend/src/onboarding/presentation/tour-overlay.tsx:78-141`

**Interfaces:**
- Consumes: `AnimatePresence`/`motion` from `motion/react`, `scaleFade`, `smooth`, `useResolvedVariants`.

- [ ] **Step 1: Animate the card, keyed per step**

The card `<div role="dialog" … style={cardStyle(rect)}>` should become a `motion.div` keyed by `step.id` so each step transition cross-fades. Wrap the card in `AnimatePresence mode="wait"`:
```tsx
import { AnimatePresence, motion } from "motion/react";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";
```
Inside the component:
```tsx
const cardAnim = useResolvedVariants(scaleFade);
```
Replace the card element:
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={step.id}
    role="dialog"
    aria-modal="true"
    aria-labelledby={`tour-title-${step.id}`}
    style={cardStyle(rect)}
    variants={cardAnim}
    initial="hidden"
    animate="visible"
    exit="hidden"
    transition={smooth}
    className="pointer-events-auto z-[1210] rounded-2xl border border-white/15 bg-black/85 p-4 text-neutral-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md"
  >
    {/* …existing h2 / p / button row unchanged… */}
  </motion.div>
</AnimatePresence>
```
Leave the halo `<div>` (it already uses `motion-safe:transition-all`) and the click-swallow layer unchanged.

- [ ] **Step 2: 200-line guard**

Run: `yarn lint`. `tour-overlay.tsx` is 142 lines today — the added imports/hook keep it well under 200. Confirm clean.

- [ ] **Step 3: Verify + smoke**

Run: `yarn build`. `yarn dev`, restart the tour (the `?` button in the viewer) — each step's card cross-fades as you click Next.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/onboarding/presentation/tour-overlay.tsx
git commit -m "feat(motion): animate onboarding tour card transitions"
```

---

### Task 11: Reduced-motion e2e smoke + final gate

**Files:**
- Create: `frontend/e2e/reduced-motion-smoke.mjs` (headless-Chrome/CDP, per the repo's existing browser-e2e-without-playwright pattern)
- Modify: `CLAUDE.md` (add a one-line note on the motion module convention)

**Interfaces:**
- Consumes: nothing new; drives the running dev/prod server over CDP.

- [ ] **Step 1: Write the CDP smoke script**

Following the repo's established pattern (global `WebSocket`, no Playwright), write a script that: launches headless Chrome with `--force-prefers-reduced-motion` (or emulates via `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce`), loads the home page, asserts it renders the catalog cards (no crash, cards present in DOM), opens a confirm dialog if reachable, and exits non-zero on any console error or missing card. Keep it a smoke check — presence and no-crash, not pixel assertions.

```js
// frontend/e2e/reduced-motion-smoke.mjs
// Smoke: with prefers-reduced-motion, the app renders and animates without crashing.
// Run: node e2e/reduced-motion-smoke.mjs  (dev server must be running)
// Follows the repo's CDP-over-WebSocket pattern (no Playwright).
// … implement per browser-e2e-without-playwright memory:
//   1. connect to CDP, new target at APP_URL
//   2. Emulation.setEmulatedMedia features:[{name:'prefers-reduced-motion',value:'reduce'}]
//   3. Page.navigate + wait for load
//   4. Runtime.evaluate: document.querySelectorAll('main article').length > 0
//   5. fail on any Runtime.consoleAPICalled of type 'error'
```
(Fill in using the same CDP boilerplate as any existing script under `frontend/e2e/` or the pattern in the memory note; do not add a test framework.)

- [ ] **Step 2: Run the smoke against a dev server**

Run:
```bash
yarn dev &   # or a prod build; wait for ready
node e2e/reduced-motion-smoke.mjs
```
Expected: exit 0, "cards present, no console errors".

- [ ] **Step 3: Add the CLAUDE.md convention note**

Append one short paragraph under the architecture rules noting: "UI animations use `motion` (import `motion/react`). Shared presets and wrappers live in `@/shared/presentation/motion/`; import them there rather than reaching for `framer-motion` or inlining variants. `motion` is presentation-only — never import it in domain/application/infrastructure. Every animated surface respects `prefers-reduced-motion` via `useResolvedVariants`."

- [ ] **Step 4: Full gate**

Run: `yarn lint && yarn build && yarn test`
Expected: all green. Confirm no `src/**` file exceeds 200 lines:
```bash
yarn lint 2>&1 | grep -i "max-lines" || echo "no max-lines violations"
```

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/reduced-motion-smoke.mjs CLAUDE.md
git commit -m "test(motion): reduced-motion smoke + document motion module"
```

---

## Notes on scope

- Not touched: `scene-canvas.tsx` (277 non-blank) and `use-placements-editor.ts` (214) — the 3D canvas and an application hook, outside the animation surface.
- `MotionDrawer` ships without a current consumer (the console "drawers" are centered modals → `MotionModal`). It exists per the agreed future-proofing decision and carries a `ponytail:` comment; delete it if it stays unused.
- Exit animations on the console modals are deliberately skipped (enter-only) to avoid restructuring each parent's conditional-render into an `open`-prop lift. Add exit plumbing only if requested.
