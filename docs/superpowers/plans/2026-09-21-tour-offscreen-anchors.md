# Tour: reveal anchors below the Overlays panel's fold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tour step whose control lives in the Overlays panel scrolls that control into view, so the halo and the card land on something the reader can see.

**Architecture:** One change in the shared `TourOverlay` (`useAnchorRect`): before measuring, a step that names a panel `tab` calls `scrollIntoView({ block: "center" })` on its anchor. Both tours (viewer and panorama) route through it, so both are fixed at once.

**Tech Stack:** React 19, Vitest + Testing Library, yarn.

**Spec:** the bug report of 2026-09-21 (steps 7, 9, 12 of the viewer tour; screenshots show a centred card, no halo).

## Global Constraints

- yarn only, never npm.
- `yarn lint` (= `tsc -b --noEmit && oxlint`) is the type check; bare `tsc --noEmit` checks nothing.
- A parallel session works in `backend/` — stage commits by path.
- Branch: `dev` (features merge into dev).

---

## Root cause

Steps 7 `toggle-markers`, 9 `move-points` and 12 `add-document` anchor to controls inside
`#overlays-panel-body` (`widgets/view-tab/ui/view-tab.tsx:136,146,178`), which is an
`overflow-auto` box. With 10 panoramas the list pushes them far below the panel's visible area.

`tour-overlay.tsx` then:
1. measures a rect that is **below the viewport** — the dim's hole and the halo are drawn off-screen ("улетает далеко вниз");
2. `cardStyle` finds that neither "beside" (panel is at the right edge) nor "below" fits → `CENTRED` card, pointing at nothing;
3. never scrolls — the comment at `tour-overlay.tsx:129-131` says so on purpose, assuming "every A-scope anchor is fixed chrome". Package B added panel anchors and broke that assumption;
4. the full-screen dim (`fixed inset-0`) takes the wheel, so the reader cannot scroll the panel to the control by hand.

Step 10 `external-link` and every `panorama-*` step of the panorama tour (`panorama-tour-steps.ts`, anchor card under the list) have the same exposure; the fix covers them too.

The tab switch already happens in the same commit as the step (`use-territory-viewer.ts:189-193`), so the anchor is in the DOM when the overlay's layout effect runs.

**Manual scrolling under the dim is deliberately left blocked**: the tour is modal, and once it scrolls to the anchor itself there is nothing to scroll to. (Wheel over the lit control already reaches the panel through the hole.)

---

### Task 1: Scroll panel anchors into view

**Files:**
- Modify: `frontend/src/features/onboarding/ui/tour-overlay.tsx` (`useAnchorRect`, its call site, the stale comment at 127-131)
- Test: `frontend/src/features/onboarding/ui/tour-overlay.spec.tsx`

**Interfaces:**
- Consumes: `TourStep.tab?: "view" | "placements"` (`model/tour-step.ts`) — the marker of "this anchor lives in the scrolling panel".
- Produces: `useAnchorRect(selector: string, reveal: boolean): Rect | null` (file-private).

Why only `tab` steps: `panorama-marker` is an HTML overlay inside the canvas; `scrollIntoView` on it would scroll the canvas's `overflow-hidden` wrapper and shift the scene. Header / rail anchors are fixed and need nothing.

- [ ] **Step 1: Write the failing tests** — append inside `describe("TourOverlay", …)`:

```tsx
  it("scrolls a panel step's control into view before measuring it", () => {
    const el = anchor("toggle-markers", { top: 900, left: 1700, width: 280, height: 20 });
    el.scrollIntoView = vi.fn();
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers");
    render(<TourOverlay tour={tour({ step })} />);

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("leaves fixed chrome and canvas anchors where they are", () => {
    const el = anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    el.scrollIntoView = vi.fn();
    render(<TourOverlay tour={tour()} />);

    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run, expect the first to FAIL**

Run: `cd frontend && yarn vitest run src/features/onboarding/ui/tour-overlay.spec.tsx`
Expected: "scrolls a panel step's control…" fails — `scrollIntoView` not called.

- [ ] **Step 3: Implement** — in `useAnchorRect`:

```tsx
function useAnchorRect(selector: string, reveal: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) return;
    // A panel control can sit far below the panel's fold (ten panoramas push
    // the markers switch off-screen), and the dim swallows the wheel that would
    // reach it. Scrolled before the first measure, so the halo is drawn where
    // the control ends up. `?.` because jsdom has no scrollIntoView.
    if (reveal) document.querySelector(selector)?.scrollIntoView?.({ block: "center" });
    const measure = () => {
      /* unchanged */
    };
    /* unchanged */
  }, [selector, reveal]);
```

Update the hook's doc comment ("the only two things that move a control…" — add: "and, for a panel step, the reveal above"). Call site:

```tsx
  const rect = useAnchorRect(selector, step?.tab !== undefined);
```

Replace the comment block at 127-131 ("Nothing scrolls the anchor into view…") with:

```tsx
  // Asked of the DOM here rather than read off `rect`: a null rect also means
  // "not measured yet", which would skip a step whose control is present.
```

(The scroll rationale now lives in `useAnchorRect`, where the scroll is.)

`block: "center"` rather than `"nearest"`: centred, the card's "below" placement fits under the anchor instead of falling back to the screen centre; `"nearest"` parks it on the bottom edge.

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && yarn vitest run src/features/onboarding && yarn lint`
Expected: all PASS, lint clean.

- [ ] **Step 5: Live check** (the bug is layout — tests alone do not prove it)

`yarn dev` against the stack, open a territory with ≥ 8 panoramas (`mr-1-wo`), replay the tour (▶ on the rail), 1280×800 and 1920×1080. Steps 7, 9, 10, 12: the panel scrolls, the halo sits on the control, the card sits under it. Step 8 (`panorama-marker`): the scene does not shift. Then enter a panorama and walk the panorama tour to `panorama-delete`. Screenshot each.

- [ ] **Step 6: Coverage + commit**

Run: `cd frontend && yarn test:coverage` (90/85/90/90 thresholds)

```bash
git add frontend/src/features/onboarding/ui/tour-overlay.tsx frontend/src/features/onboarding/ui/tour-overlay.spec.tsx
git commit -m "fix(frontend): tour scrolls panel controls into view before pointing at them"
```

---

## Follow-up (2026-09-21, user report after Task 1): tall anchors overflow the panel

Step 6 `panorama-picker` anchors the whole `<ul>` of panoramas (`view-tab.tsx:122`). With 10+
panoramas the list is taller than `#overlays-panel-body`; `useAnchorRect` takes the element's
raw `getBoundingClientRect()`, so the halo and the dim's hole run past the panel and off the
bottom of the screen. Same for `objects-list` (28 placements on prod) and any tall anchor.
Task 1's `block: "center"` makes it worse for a tall anchor — it scrolls to the list's middle.
Task 1 was live-checked with only 2 panoramas, which could not show this.

Fix: measure the part of the anchor its clipping ancestors actually show, and reveal to the
anchor's start. Wheel over the lit (clipped) list then scrolls the panel through the dim's hole
— the hole passes events to the page — and the capture-phase scroll listener re-measures, so
the reader can browse the list on step 6.

### Task 2: Clip the spotlight to the visible part of the anchor

**Files:**
- Modify: `frontend/src/features/onboarding/ui/tour-overlay.tsx` (`useAnchorRect`'s `measure`, the reveal's `block`, comments)
- Test: `frontend/src/features/onboarding/ui/tour-overlay.spec.tsx`

**Interfaces:**
- Consumes: `useAnchorRect(selector, reveal)` from Task 1.
- Produces: file-private `visibleRect(el: Element): Rect`.

- [ ] **Step 1: Failing tests** — change Task 1's expectation to `{ block: "start" }`, and add:

```tsx
  it("clips the spotlight to what the anchor's scrolling panel shows", () => {
    const panel = document.createElement("div");
    panel.style.overflow = "auto";
    panel.getBoundingClientRect = () =>
      ({ top: 100, left: 1000, width: 300, height: 400, right: 1300, bottom: 500, x: 1000, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.append(panel);
    anchors.push(panel);
    // A list three times the panel's height, starting inside it.
    const el = anchor("panorama-picker", { top: 150, left: 1010, width: 280, height: 1200 });
    panel.append(el);
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "panorama-picker");
    render(<TourOverlay tour={tour({ step })} />);

    expect(screen.getByTestId("tour-halo")).toHaveStyle({
      top: "144px",
      left: "1004px",
      width: "292px",
      height: "362px",
    });
  });
```

(Anchor 150→1350 clipped to panel 100→500 gives top 150, height 350; plus the 6 px ring on each side.)

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && yarn vitest run src/features/onboarding/ui/tour-overlay.spec.tsx`

- [ ] **Step 3: Implement** in `tour-overlay.tsx`:

```tsx
// The part of `el` its clipping ancestors actually show. A tall anchor — the
// list of fifteen panoramas — is taller than the panel it scrolls in, and its
// raw box ran the halo and the dim's hole past the panel and off the screen.
function visibleRect(el: Element): Rect {
  let { top, left, right, bottom } = el.getBoundingClientRect();
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflow === "visible") continue;
    const box = p.getBoundingClientRect();
    top = Math.max(top, box.top);
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
    bottom = Math.min(bottom, box.bottom);
  }
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
```

`measure` becomes `const el = …; if (!el) { setRect(null); return; } setRect(visibleRect(el));`.
The reveal becomes `scrollIntoView?.({ block: "start" })` — the start of a tall list, and a small
control lands at the panel's top (under its 26 px `scroll-pt` strip), where the card's "below"
placement fits. Update the reveal comment accordingly (drop "centre" reasoning, say "start").

- [ ] **Step 4: Run tests + lint**: `cd frontend && yarn vitest run src/features/onboarding && yarn lint`

- [ ] **Step 5: Live check with real volume** (local compose stack, `yarn dev --port 3000`, root `admin`/`change-me-now`, Python Playwright):
  - Seed the local territory `dji-wp46-cut` to **15 panoramas** and **≥ 20 placements** through the gateway API (reuse an existing panorama's image blob / an existing model; read `backend/services/gateway-service/api/openapi.yaml` for the routes). Leave them — record what was added in the report.
  - At **1280×800** and **1920×1080**, walk the whole viewer tour and the panorama tour. For every anchored step assert: the halo rect is inside the viewport; for every `tab` step, the halo rect is within `#overlays-panel-body`'s rect grown by 6 px; the anchor's visible part is non-empty. Screenshot each step.
  - On step 6 (`panorama-picker`): wheel over the lit list and assert `#overlays-panel-body.scrollTop` grew and the halo stayed inside the panel.
  - RED side once: with Task 2 reverted in the working tree (re-apply by editing, never git checkout/restore/stash), show the step-6 halo runs past the viewport.

- [ ] **Step 6: Coverage + commit**: `cd frontend && yarn test:coverage`, then
```bash
git add frontend/src/features/onboarding/ui/tour-overlay.tsx frontend/src/features/onboarding/ui/tour-overlay.spec.tsx
git commit -m "fix(frontend): tour clips its spotlight to the part of a tall anchor the panel shows"
```

---

### Task 3: Let the lit panel scroll, and put the card beside a panel anchor

Found by Task 2's live check (15 panoramas, 21 placements, Chromium):

1. **Wheel over the dim's hole does not scroll the panel.** `elementFromPoint` at the lit list
   answers the list, the wheel event is not `defaultPrevented`, yet `scrollTop` stays put; with
   the dim at `pointer-events: none` the same wheel scrolls 152 → 452. Chromium's scroll
   targeting ignores the clip-path hole that element hit-testing honours, so the full-screen
   fixed dim takes the wheel and cannot scroll. On step 6 the reader sees ~9 of 15 panoramas and
   cannot reach the rest — the user asked for this step to be scrollable.
2. **The card falls back to the screen centre for panel anchors** (steps 6, 10, 12): the panel
   is at the right edge, so "beside" (to the right) never fits, and "below" does not fit under a
   tall or low anchor. The card ends up far from what it explains.

Fix 1: the dim hands a wheel that lands over the hole to the anchor's scrolling ancestor. A
browser that targets the hole correctly (WebKit in the desktop shell, if it does) never delivers
that wheel to the dim, so nothing double-scrolls.
Fix 2: `cardStyle` tries the anchor's left before "below".

**Files:**
- Modify: `frontend/src/features/onboarding/ui/tour-overlay.tsx` (`cardStyle`, new `scrollerOf`, the dim's `onWheel`, the dim's comment)
- Test: `frontend/src/features/onboarding/ui/tour-overlay.spec.tsx`

**Interfaces:**
- Consumes: `useAnchorRect`, `visibleRect`, `CLIPS` (Task 2); `selector`, `rect` in `TourOverlay`.
- Produces: file-private `scrollerOf(el: Element | null): Element | null`.

- [ ] **Step 1: Failing tests** (jsdom window is 1024×768):

```tsx
  it("puts the card to the anchor's left when the right edge leaves no room", () => {
    anchor("toggle-markers", { top: 300, left: 700, width: 280, height: 20 });
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers");
    render(<TourOverlay tour={tour({ step })} />);

    // 700 - 12 gap - 320 card = 368.
    expect(screen.getByTestId("tour-card")).toHaveStyle({ left: "368px", top: "300px" });
  });

  it("hands a wheel over the lit anchor to the panel it scrolls in", () => {
    const panel = document.createElement("div");
    panel.style.overflowY = "auto";
    Object.defineProperty(panel, "scrollHeight", { value: 2000 });
    Object.defineProperty(panel, "clientHeight", { value: 400 });
    panel.scrollBy = vi.fn();
    document.body.append(panel);
    anchors.push(panel);
    panel.append(anchor("panorama-picker", { top: 100, left: 100, width: 200, height: 300 }));
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "panorama-picker");
    render(<TourOverlay tour={tour({ step })} />);
    const dim = screen.getByTestId("tour-dim");

    fireEvent.wheel(dim, { clientX: 150, clientY: 200, deltaY: 120 });
    expect(panel.scrollBy).toHaveBeenCalledWith({ top: 120, left: 0 });

    fireEvent.wheel(dim, { clientX: 600, clientY: 600, deltaY: 120 });
    expect(panel.scrollBy).toHaveBeenCalledTimes(1);
  });
```

(`panel`'s own `getBoundingClientRect` is jsdom's zeros, and `overflowY: auto` makes it a
clipping ancestor for `visibleRect` — give it a box that contains the anchor, e.g.
`{ top: 0, left: 0, width: 1024, height: 768, … }` like Task 2's test does, or the hole is empty.)

- [ ] **Step 2: Run, expect both to FAIL**: `cd frontend && yarn vitest run src/features/onboarding/ui/tour-overlay.spec.tsx`

- [ ] **Step 3: Implement**

`cardStyle` — between the "beside" and "below" branches:

```tsx
  const before = rect.left - GAP - WIDTH;
  if (before >= GAP) {
    return { top: clamp(rect.top, GAP, window.innerHeight - height - GAP), left: before };
  }
```

and its comment: "Beside the anchor when the card fits to its right, to its left when it does
not (the Overlays panel sits on the right edge), below it when neither does, centred last."

New helper next to `visibleRect`:

```tsx
// The ancestor a wheel over the anchor should scroll: the nearest one that
// scrolls vertically and has somewhere to go.
function scrollerOf(el: Element | null): Element | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
```

In `TourOverlay`, the dim gets:

```tsx
  // Chromium aims a wheel at the dim even over its clip-path hole — element
  // hit-testing honours the hole, scroll targeting does not — so a lit list of
  // fifteen panoramas could not be scrolled. A wheel over the hole is handed to
  // the anchor's scroller; `measure` follows the scroll and keeps the halo on it.
  const onWheel = (event: React.WheelEvent) => {
    if (!rect) return;
    const { clientX: x, clientY: y } = event;
    if (x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return;
    scrollerOf(document.querySelector(selector))?.scrollBy({ top: event.deltaY, left: 0 });
  };
```

(`import type { WheelEvent } from "react"` alongside the existing React imports rather than the
`React.` namespace, matching the file's import style.) `onWheel={onWheel}` on the `tour-dim` div,
and update the dim's comment: it swallows every click, but a wheel over the hole is passed on.
Also fix Task 1's reveal comment — "the dim swallows the wheel that would reach it" becomes
"and a control below the fold is not under the pointer to be wheeled to".

- [ ] **Step 4: Run tests + lint**: `cd frontend && yarn vitest run src/features/onboarding && yarn lint`

- [ ] **Step 5: Live check** — Task 2's harness in `.../scratchpad/live2`, local stack, seeded
  `dji-wp46-cut` (15 panoramas, 21 placements), 1280×800 and 1920×1080, both tours:
  - every Task 2 assertion still passes;
  - step 6: `page.mouse.wheel` over the lit list scrolls `#overlays-panel-body` (scrollTop grows),
    the halo stays inside the panel, and repeated wheels reach the last panorama;
  - a wheel over the dim *outside* the hole scrolls nothing;
  - for every panel step, the card does not overlap the halo and sits within 24 px of it
    horizontally (to its left) — screenshot each and look at them;
  - `panorama-marker` and rail steps: card placement unchanged from Task 2's screenshots.

- [ ] **Step 6: Coverage + commit**: `cd frontend && yarn test:coverage`, then
```bash
git add frontend/src/features/onboarding/ui/tour-overlay.tsx frontend/src/features/onboarding/ui/tour-overlay.spec.tsx
git commit -m "fix(frontend): tour lets the lit panel scroll and sets the card beside it"
```

---

### Task 4: Reveal only when needed; the halo follows a scroll 1:1

From `/code-review` of PR #46 and a design-engineering pass against emilkowalski/skills
(emil-design-eng, animate, apple-design, review-animations STANDARDS):

1. **`block: "start"` scrolls on every panel step even when the control is visible** — the
   panorama tour's eight View-tab steps each jump the panel, pushing the section headers that
   explain the control out of view. Use `block: "nearest"`: a visible control does not move; an
   element taller than the panel whose top is below the fold is still aligned to its top (CSSOM
   `nearest` rule), so step 6's reason for `start` still holds; `scroll-padding-top` is honoured.
2. **(Must) The halo trails the content while the reader scrolls.** Every scroll tick
   re-measures and restarts the halo's 240 ms `top/left/width/height` transition and the dim's
   `clip-path` transition, each from near-zero velocity. A scroll is not a state change: the
   spotlight must follow the content 1:1 (`transition: none`), and animate only on step change.
3. **(Should) The halo/dim travel uses a hard-coded ease-in-out** `cubic-bezier(0.77,0,0.175,1)`
   — near-stationary for the first ~90 ms, so on a Next press the halo arrives after the card;
   it is also the only curve outside the tokens. Use the `ease-out` utility (= `--ease-out`,
   `cubic-bezier(0.23,1,0.32,1)`) for both, same durations.

Rejected (recorded, not to do): smooth reveal scroll; smooth wheel `scrollBy`; animating the
halo via `transform`; halo fade-in (Could, skipped for the 200-line cap); dim fade on exit.

**Files:**
- Modify: `frontend/src/features/onboarding/ui/tour-overlay.tsx` (`useAnchorRect`, the dim and halo `style`/`className`)
- Test: `frontend/src/features/onboarding/ui/tour-overlay.spec.tsx`

**Interfaces:**
- `useAnchorRect(selector, reveal)` returns `{ rect: Rect | null; tracking: boolean }`.
  `tracking` is true once a scroll/resize has moved the anchor away from the rect measured when
  the step began (the reveal's own scroll event re-measures the same box and does not count);
  it resets to false when the step changes, in the same commit as the new rect.

- [ ] **Step 1: Failing tests**
  - Task 1's expectation becomes `{ block: "nearest" }`.
  - Scroll after the step began moves the anchor → `tour-halo` and `tour-dim` have inline
    `style.transition === "none"`; rerender with the next step → neither has an inline transition.
  - A scroll event that leaves the anchor's box unchanged does not set it.
  - Halo and dim class lists contain `ease-out` and no `cubic-bezier(0.77`.

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && yarn vitest run src/features/onboarding/ui/tour-overlay.spec.tsx`

- [ ] **Step 3: Implement** (sketch):

```ts
const [tracking, setTracking] = useState(false);
// in the layout effect, after the reveal:
const at = measure();            // measure now returns the Rect it set, or null
setTracking(false);
const follow = () => {
  const now = measure();
  // The reveal's own scroll event re-measures the same box; anything else is the reader.
  if (now && at && (now.top !== at.top || now.left !== at.left || now.width !== at.width || now.height !== at.height)) setTracking(true);
};
// resize/scroll → follow
```

In the component, `style={{ ...dimStyle(rect), ...(tracking && { transition: "none" }) }}` and the
same on the halo — an inline style wins deterministically, so no second transition utility on
the same property (the clsx trap in `frontend/CLAUDE.md`). Classes: dim
`ease-[var(--ease-out),cubic-bezier(0.77,0,0.175,1)]` → `ease-out`; halo
`ease-[cubic-bezier(0.77,0,0.175,1)]` → `ease-out`. Keep reduced-motion classes as they are.
Update comments to match (the reveal comment's "start" rationale → "nearest").

- [ ] **Step 4: Tests + lint**: `cd frontend && yarn vitest run src/features/onboarding && yarn lint`

- [ ] **Step 5: Live check** (local stack, `dji-wp46-cut` already seeded: 15 panoramas, 33 placements; 1280×800 and 1920×1080; both tours): all prior assertions; panorama tour — the panel's `scrollTop` does not change between consecutive steps whose control is already visible; step 6 still opens the list at its first row; during a wheel on steps 6 and 14 the halo's rect equals the anchor's clipped rect within 1 px on the very next frame (no lag); on Next the halo transitions again (computed `transition-duration` non-zero). Feel-check: record a burst of 5 fast Next presses and a wheel sequence as screenshots/video frames and look at them.

- [ ] **Step 6: Coverage + commit**: `cd frontend && yarn test:coverage`, then
```bash
git add frontend/src/features/onboarding/ui/tour-overlay.tsx frontend/src/features/onboarding/ui/tour-overlay.spec.tsx
git commit -m "fix(frontend): tour reveals only what is hidden and its spotlight follows a scroll 1:1"
```

---

### Task 5: Move the tour's pure geometry into `tour-geometry.ts`

`tour-overlay.tsx` reached 193 of the 200-line cap (`frontend/CLAUDE.md`). Pure refactor, no
behaviour change: move the DOM-free-of-React geometry — constants (`WIDTH`, `GAP`, `HEIGHT`,
`HALO`), `Rect`, `clamp`, `CENTRED`, `cardStyle`, `dimStyle`, `haloStyle`, `CLIPS`,
`visibleRect`, `scrollerOf` and any other pure helper the hooks call — into
`frontend/src/features/onboarding/ui/tour-geometry.ts`, exported only as far as
`tour-overlay.tsx` and the new spec need. Hooks (`useAnchorRect`, the wheel effect) and the
component stay in `tour-overlay.tsx`. Comments travel with their code unchanged except where a
comment points at "the component below"/"above" and now has to name the other file.

**Files:**
- Create: `frontend/src/features/onboarding/ui/tour-geometry.ts`
- Create: `frontend/src/features/onboarding/ui/tour-geometry.spec.ts` — direct unit tests of `cardStyle` (right / left-of-panel / below / centred branches), `visibleRect` (clip, scroll-padding inset, fully-clipped park, `clipLeft`), `scrollerOf`; move tests out of `tour-overlay.spec.tsx` only where they test pure geometry and gain nothing from rendering — keep every behaviour test of the overlay where it is.
- Modify: `frontend/src/features/onboarding/ui/tour-overlay.tsx`, `tour-overlay.spec.tsx` (imports only, plus any moved tests)

- [ ] Step 1: create `tour-geometry.ts` by moving code verbatim; update imports.
- [ ] Step 2: `cd frontend && yarn vitest run src/features/onboarding && yarn lint` — green, same test count or more.
- [ ] Step 3: add `tour-geometry.spec.ts`; `yarn test:coverage` — thresholds met, both files ≤ 200 lines.
- [ ] Step 4: live smoke (local stack, `dji-wp46-cut`, 1280×800): steps 6, 7, 14 and one panorama step look identical to `scratchpad/live4`; wheel on step 6 still scrolls.
- [ ] Step 5: commit
```bash
git add frontend/src/features/onboarding/ui/tour-geometry.ts frontend/src/features/onboarding/ui/tour-geometry.spec.ts frontend/src/features/onboarding/ui/tour-overlay.tsx frontend/src/features/onboarding/ui/tour-overlay.spec.tsx
git commit -m "refactor(frontend): tour geometry moves into tour-geometry.ts"
```
