# Territory Viewer v2, package B — panoramas and documents: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the old SPA's panoramas and documents into the v2 viewer at `/territories/{slug}` — walk-in equirect panoramas with anchors, the anchor editor with calibration, per-panorama object visibility, upload modals for both, a floating pdf.js window, the external tour link, and the tours grown to 15 + 9 steps.

**Architecture:** Two new entities (`panorama`, `document`) carry the types, gateways and the pure models moved from `frontend/`; `features/viewer-mode` grows `view` / `move` / `editingPanoramaId`; `features/panorama-view` and `features/document-view` own the orchestration hooks; the three layer gains the sphere, the parallax-free rig, the anchor markers, the drag controller and the camera tracker under `widgets/viewer-canvas/three/`; the View tab becomes `widgets/view-tab`; the uploads are `widgets/upload-modal` over `entities/upload`'s new `useFileUpload`; the PDF is `widgets/document-window` over `shared/ui/viewport-window`. The page container is split so no file crosses 200 lines.

**Tech Stack:** React 19, TypeScript 7 (`tsc -b --noEmit`), Tailwind 4, three 0.186 / @react-three/fiber 9.7 / drei 10.7 / three-stdlib 2.36, vitest 5 + `@react-three/test-renderer` 9.1, react-cosmos 7, Playwright (python) for the live pass, pdf.js 6.0.227 vendored.

**Spec:** `docs/superpowers/specs/2026-09-14-territory-viewer-v2-package-b-design.md` (the binding authority; decisions B-1…B-5, §1–§7). Package A's spec is `docs/superpowers/specs/2026-09-10-territory-viewer-v2-design.md`. Every mock measurement and string is in `.superpowers/sdd/2026-09-10-territory-viewer-v2/mock-digest.md` (states 8–13, the View tab at lines 150–170, the 16-step tour at state 15); the code recon is `recon-b.md` beside it.

## Global Constraints

- **Skills first.** Every implementer and reviewer loads through the Skill tool, one call each: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`; tasks 7, 8 and their reviewers add `threejs-fundamentals`, `threejs-interaction`, `threejs-textures`, `threejs-materials`, `threejs-geometry`. The list goes in the report.
- **Working rules** (frontend-v2/CLAUDE.md): `yarn`, never npm; `yarn lint` = `tsc -b --noEmit && oxlint` (bare `tsc --noEmit` checks nothing); `yarn test:coverage` thresholds 90/85/90/90; `yarn build`; `src/architecture.spec.ts` — a sibling spec per module, a Cosmos fixture per slice with JSX, inward-only imports, no deep imports across slices; the 200-line cap (code lines) hand-checked; clsx does not merge — one CSS property, one place per element per state; `unanswered` for refetch errors; the Canvas is a context boundary (nothing under `widgets/viewer-canvas/three/` reads `can`, the query client or the theme); never drei `<Stats>`; `frameloop="demand"` — every scene change calls `invalidate()`.
- **Commits** by path only (`git add frontend-v2 docs/superpowers/specs`), never `.claude/settings.json` or `backend/go.work.sum`; `--no-verify` with the line `Frontend-only; the backend gate is skipped — no Go code changed.`; the last line EXACTLY `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; verify with `git show --numstat --format="" HEAD | awk '{print $3}'`. No push, no PR update without the user's word.
- **TDD**: every task shows break → red → restore → green on its named spec.
- **Copy**: every string is the mock's (digest) unless §6 records a deviation; no invented copy.
- **Coverage exemptions**: only `src/widgets/viewer-canvas/three/image-bitmap.ts` is added to `exempt-modules.ts` (B-4).
- **Base**: HEAD `e882f3a` of `feat/frontend-v2-design-system`; package A's viewer is not to be redesigned.

## File map

```
frontend-v2/public/pdfjs/                                    # Task 1 — copied from frontend/public/pdfjs minus the sample PDF
frontend-v2/src/shared/ui/icon/glyph-extras.tsx              # Task 1 — panorama, file, maximize, minimize, grip, arrow-up
frontend-v2/src/shared/ui/range/{range.tsx,range.spec.tsx,range.fixture.tsx}          # Task 1
frontend-v2/src/shared/ui/modal/modal.tsx                    # Task 1 — size "sm" (520)
frontend-v2/src/shared/ui/viewport-window/{viewport-window.tsx,.spec.tsx,.fixture.tsx} # Task 2
frontend-v2/src/entities/panorama/{index.ts, model/*, api/*}                          # Task 3
frontend-v2/src/entities/document/{index.ts, model/*, api/*}                          # Task 4
frontend-v2/src/entities/scene/{api/scene-gateway.ts, model/scene-view-model.ts}     # Task 4
frontend-v2/src/entities/placement/api/placements-gateway.ts (setPlacementVisibility) # Task 4
frontend-v2/src/entities/territory/api/territories-gateway.ts (updateTerritory)       # Task 4
frontend-v2/src/features/viewer-mode/model/{viewer-mode.ts,use-viewer-mode.ts}       # Task 5
frontend-v2/src/features/panorama-view/{index.ts, model/*}                            # Task 6
frontend-v2/src/widgets/viewer-canvas/three/{image-bitmap.ts,panorama-sphere.tsx,panorama-rig.tsx,camera-tracker.tsx,panorama-loading-overlay.tsx} # Task 7
frontend-v2/src/widgets/viewer-canvas/three/{panorama-marker.tsx,panorama-markers-layer.tsx,panorama-drag-controller.tsx,placement-markers.tsx,scene-canvas.tsx,placements-layer.tsx} + ui/props.ts # Task 8
frontend-v2/src/features/document-view/{index.ts, model/*}                            # Task 9
frontend-v2/src/widgets/document-window/{index.ts, ui/*}                              # Task 10
frontend-v2/src/features/territory-link/{index.ts, model/use-territory-link.ts}       # Task 11
frontend-v2/src/widgets/view-tab/{index.ts, ui/view-tab.tsx, ui/panorama-row.tsx, ui/document-row.tsx, model/copy.ts} # Task 11
frontend-v2/src/widgets/view-tab/ui/{anchor-card.tsx,calibration-card.tsx}            # Task 12
frontend-v2/src/entities/upload/model/use-file-upload.ts                              # Task 13
frontend-v2/src/features/panorama-upload/, features/document-upload/                  # Task 13
frontend-v2/src/widgets/upload-modal/{index.ts, ui/upload-modal.tsx}                  # Task 13
frontend-v2/src/features/placements-editor/model/use-placements-editor.ts (setVisibility, create with ids) # Task 14
frontend-v2/src/widgets/placements-panel/ui/{placements-panel.tsx,visible-in.tsx}     # Task 14
frontend-v2/src/pages/territory-viewer/model/{viewer-view.ts,strip-and-chips.ts,viewer-props.ts,page-props.ts,page-props-b.ts,use-viewer-panoramas.ts,use-viewer-documents.ts,use-territory-viewer.ts} # Task 15
frontend-v2/src/pages/territory-viewer/ui/{viewer-overlays.tsx,viewer-header.tsx,territory-viewer-page.tsx} + widgets/overlays-panel (scrolled strip) + fixtures # Task 16
frontend-v2/src/features/onboarding/model/{viewer-tour-steps.ts,panorama-tour-steps.ts} + page wiring # Task 17
.superpowers/sdd/2026-09-10-territory-viewer-v2/live.py (section 7), frontend-v2/CLAUDE.md, root CLAUDE.md, README # Task 18
```

Dependency order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18. Tasks 2, 9/10 and 13 touch no three code; 7 and 8 are the three tasks.

---

### Task 1: pdf.js, the new glyphs, `Range`, `Modal size="sm"`

**Files:**
- Create: `frontend-v2/public/pdfjs/` (copy of `frontend/public/pdfjs/` without `web/compressed.tracemonkey-pldi-09.pdf`)
- Modify: `frontend-v2/.oxlintrc.json` — `ignorePatterns` already holds `public/**` (Task 1 of A); verify, do not duplicate.
- Modify: `frontend-v2/src/shared/ui/icon/glyph-extras.tsx` — six glyphs
- Create: `frontend-v2/src/shared/ui/range/range.tsx`, `range.spec.tsx`, `range.fixture.tsx`, `index.ts`
- Modify: `frontend-v2/src/shared/ui/modal/modal.tsx`, `modal.spec.tsx`, `modal.fixture.tsx` — `size: "sm" | "md" | "lg"`

**Interfaces:**
- Produces: `IconName` gains `"panorama" | "file" | "maximize" | "minimize" | "grip" | "arrow-up"`; `Range` (`{ value, min, max, step, onChange, label, disabled?, className? }`), `Modal size="sm"` = `w-[min(32.5rem,calc(100vw-2rem))]` (520 px).

- [ ] **Step 1: pdf.js**

```bash
cd frontend-v2 && mkdir -p public/pdfjs && rsync -a --exclude 'compressed.tracemonkey-pldi-09.pdf' ../frontend/public/pdfjs/ public/pdfjs/
du -sh public/pdfjs && grep -o 'const version = "[0-9.]*"' public/pdfjs/build/pdf.mjs
```
Expected: `6.0.227`, ~7.4 MB, no sample PDF. `yarn lint` stays clean because `public/**` is ignored.

- [ ] **Step 2: glyphs — failing spec** in `shared/ui/icon/icon.spec.tsx` (append):

```tsx
it.each(["panorama", "file", "maximize", "minimize", "grip", "arrow-up"] as const)(
  "draws the %s glyph",
  (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector("svg")).not.toBeNull();
  },
);
```
Run: `yarn vitest run src/shared/ui/icon` → red (`GLYPHS[name]` undefined → throws).

- [ ] **Step 3: glyphs** — append to `EXTRA_GLYPHS` (24-box strokes, width 1.7 unless noted):

```tsx
  // A 2:1 frame with the horizon: the panorama thumb and the upload card.
  panorama: {
    box: "0 0 24 24",
    width: 1.6,
    body: (
      <>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M2 12c3.5-2 6.5-2 10 0s6.5 2 10 0" />
      </>
    ),
  },
  file: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
  maximize: {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />,
  },
  minimize: {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3" />,
  },
  // Three 14×1 lines — the mock's drag handle.
  grip: {
    box: "0 0 24 24",
    width: 1.5,
    body: <path d="M5 8h14M5 12h14M5 16h14" />,
  },
  "arrow-up": {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M12 19V5M6 11l6-6 6 6" />,
  },
```
Run the icon spec → green. Add the six to `icon.fixture.tsx`'s gallery.

- [ ] **Step 4: `Range` — failing spec** `shared/ui/range/range.spec.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Range } from "./range";

describe("Range", () => {
  it("is a labelled slider that reports a number", () => {
    const onChange = vi.fn();
    render(<Range label="Photo opacity" value={0.65} min={0.15} max={1} step={0.05} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Photo opacity" });
    expect(slider).toHaveValue("0.65");
    fireEvent.change(slider, { target: { value: "0.7" } });
    expect(onChange).toHaveBeenCalledWith(0.7);
  });

  it("paints the accent fill as far as the value", () => {
    render(<Range label="Yaw" value={90} min={0} max={360} step={1} onChange={() => {}} />);
    expect(screen.getByRole("slider").style.getPropertyValue("--range-fill")).toBe("25%");
  });

  it("is inert when disabled", () => {
    render(<Range label="Yaw" value={0} min={0} max={1} step={0.1} onChange={() => {}} disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
```

- [ ] **Step 5: `Range`** — `shared/ui/range/range.tsx`:

```tsx
import { clsx as cx } from "clsx";

export type RangeProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** The accessible name; the visible label is the caller's row. */
  label: string;
  disabled?: boolean;
  className?: string;
};

/**
 * The mock's slider: a 4 px track in `--border`, the accent fill up to the
 * value, a 14 px knob with a 1 px accent border on panel. The fill is one CSS
 * variable on the input — a gradient background — so the native control keeps
 * its keyboard handling and the design keeps its look.
 */
export function Range({ value, min, max, step, onChange, label, disabled = false, className }: RangeProps) {
  const fill = max > min ? `${((value - min) / (max - min)) * 100}%` : "0%";
  return (
    <input
      type="range"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--range-fill": fill } as React.CSSProperties}
      className={cx(
        "h-1 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,var(--color-accent)_var(--range-fill),var(--color-line)_var(--range-fill))] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-panel",
        "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-panel",
        className,
      )}
    />
  );
}
```
`index.ts`: `export { Range, type RangeProps } from "./range";`. Fixture `range.fixture.tsx`: `opacity` (0.65 of 0.15–1 with the mock's `Photo opacity` label row + mono 10 `65 %`), `yaw` (137.5 of 0–360), `disabled`. Check the token names `--color-accent` / `--color-line` against `src/index.css`'s `@theme inline` block and use the ones that exist. Run the spec → green. Measure in Cosmos: track 4 px, knob 14 px.

- [ ] **Step 6: `Modal size="sm"`** — spec case in `modal.spec.tsx`: `size="sm"` renders the dialog with class containing `32.5rem`; implementation: `size === "lg" ? "w-[min(45rem,calc(100vw-2rem))]" : size === "sm" ? "w-[min(32.5rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"`; prop doc: `sm is the 520px upload modal`. Fixture entry `sm`. Red → green.

- [ ] **Step 7: gate + commit**

```bash
yarn lint && yarn test:coverage && yarn build
git add frontend-v2/public/pdfjs frontend-v2/src/shared/ui
git commit --no-verify -m "feat(frontend-v2): pdf.js vendored, six glyphs, a Range slider and the 520px modal

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `shared/ui/viewport-window`

**Files:**
- Create: `frontend-v2/src/shared/ui/viewport-window/viewport-window.tsx`, `.spec.tsx`, `.fixture.tsx`, `index.ts`

**Interfaces:**
- Produces:
```ts
export type ViewportWindowAction = { name: string; icon: IconName; tone?: "default" | "bad"; onClick: () => void };
export type ViewportWindowProps = {
  title: string;
  /** null = fills its container at the 14 inset (expanded); a geometry = floating. */
  geometry: { x: number; y: number; w: number; h: number } | null;
  actions: ViewportWindowAction[];
  onMoveStart?: (e: React.PointerEvent) => void;
  onResizeStart?: (e: React.PointerEvent) => void;
  /** True while a drag runs: a transparent shield covers the body so an iframe cannot eat the pointer. */
  dragging?: boolean;
  children: ReactNode;
  className?: string;
};
```

- [ ] **Step 1: failing spec** `viewport-window.spec.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewportWindow } from "./viewport-window";

const GEO = { x: 10, y: 20, w: 560, h: 400 };
const actions = (onClick = vi.fn()) => [{ name: "Exit document overlay", icon: "minus" as const, onClick }];

describe("ViewportWindow", () => {
  it("is a named dialog placed by its geometry, with the drag handle and the resize grip", () => {
    const onMoveStart = vi.fn();
    const onResizeStart = vi.fn();
    render(
      <ViewportWindow title="plan-sheet-03.pdf" geometry={GEO} actions={actions()} onMoveStart={onMoveStart} onResizeStart={onResizeStart}>
        <p>body</p>
      </ViewportWindow>,
    );
    const win = screen.getByRole("dialog", { name: "plan-sheet-03.pdf" });
    expect(win.style.left).toBe("10px");
    expect(win.style.width).toBe("560px");
    fireEvent.pointerDown(screen.getByTitle("Drag to move"));
    expect(onMoveStart).toHaveBeenCalledOnce();
    fireEvent.pointerDown(screen.getByTitle("Resize"));
    expect(onResizeStart).toHaveBeenCalledOnce();
  });

  it("fills the viewport when expanded — no handle, no grip", () => {
    render(<ViewportWindow title="f.pdf" geometry={null} actions={actions()}><p>body</p></ViewportWindow>);
    const win = screen.getByRole("dialog");
    expect(win.className).toContain("inset-3.5");
    expect(screen.queryByTitle("Drag to move")).toBeNull();
    expect(screen.queryByTitle("Resize")).toBeNull();
  });

  it("draws every action as a named icon button, bad ones in the bad tone", () => {
    const onClick = vi.fn();
    render(
      <ViewportWindow title="f.pdf" geometry={GEO} actions={[{ name: "Delete f.pdf", icon: "trash", tone: "bad", onClick }]}>
        <p>body</p>
      </ViewportWindow>,
    );
    const btn = screen.getByRole("button", { name: "Delete f.pdf" });
    expect(btn.className).toContain("border-bad");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shields the body while dragging", () => {
    const { rerender } = render(<ViewportWindow title="f.pdf" geometry={GEO} actions={[]}><p>body</p></ViewportWindow>);
    expect(screen.queryByTestId("drag-shield")).toBeNull();
    rerender(<ViewportWindow title="f.pdf" geometry={GEO} actions={[]} dragging><p>body</p></ViewportWindow>);
    expect(screen.getByTestId("drag-shield")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: implementation** `viewport-window.tsx` (mock state 12: border2, radius 12, panel, shadow; title bar border-bottom panel2 padding 9/11 gap 10; handle three 14×1 lines `cursor:grab`; name mono 11 ellipsis; 24×24 icon buttons border2 radius 6 panel; body panel2):

```tsx
import type { PointerEvent, ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ViewportWindowAction = { name: string; icon: IconName; tone?: "default" | "bad"; onClick: () => void };

export type ViewportWindowProps = {
  title: string;
  geometry: { x: number; y: number; w: number; h: number } | null;
  actions: ViewportWindowAction[];
  onMoveStart?: (e: PointerEvent<HTMLElement>) => void;
  onResizeStart?: (e: PointerEvent<HTMLElement>) => void;
  dragging?: boolean;
  children: ReactNode;
  className?: string;
};

const ACTION =
  "flex size-6 cursor-pointer items-center justify-center rounded-[6px] border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The mock's "viewport window": a floating panel with a title bar that can be
 * dragged by its handle, resized from its corner, and that fills the viewport
 * when `geometry` is null. It knows nothing about what it holds; the document
 * window puts the pdf.js frame in it.
 */
export function ViewportWindow({ title, geometry, actions, onMoveStart, onResizeStart, dragging = false, children, className }: ViewportWindowProps) {
  const floating = geometry !== null;
  return (
    <section
      role="dialog"
      aria-label={title}
      style={floating ? { left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h } : undefined}
      className={cx(
        "absolute z-30 flex flex-col overflow-hidden rounded-card border border-line-2 bg-panel shadow-elevation",
        !floating && "inset-3.5",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-line bg-panel-2 px-[11px] py-[9px]">
        {floating ? (
          <span title="Drag to move" onPointerDown={onMoveStart} className="flex cursor-grab items-center text-line-2 active:cursor-grabbing">
            <Icon name="grip" size={14} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{title}</span>
        {actions.map((a) => (
          <button
            key={a.name}
            type="button"
            title={a.name}
            aria-label={a.name}
            onClick={a.onClick}
            className={cx(ACTION, a.tone === "bad" ? "border-bad bg-bad-soft text-bad" : "border-line-2 bg-panel text-fg hover:border-accent-line")}
          >
            <Icon name={a.icon} size={12} />
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 bg-panel-2">
        {children}
        {dragging ? <div data-testid="drag-shield" className="absolute inset-0" /> : null}
      </div>
      {floating && onResizeStart ? (
        <span title="Resize" onPointerDown={onResizeStart} className="absolute bottom-0 right-0 size-4 cursor-se-resize border-b-2 border-r-2 border-line-2" />
      ) : null}
    </section>
  );
}
```
`index.ts` exports both types and the component. Fixture: `pip` (560×400 inside a 900×600 relative box, four actions `Expand plan-sheet-03.pdf` maximize / `Hide plan-sheet-03.pdf` minus / `Delete plan-sheet-03.pdf` trash bad / `Exit document overlay` — the last uses the `minus` glyph rotated? No: use a 12 px `×` — add it as the seventh glyph `close` (`<path d="M6 6l12 12M18 6 6 18" />`, width 2) in Task 1's file if none exists (check `GLYPHS` for an existing close/x first), `expanded` (geometry null with `Restore … to a window` minimize), `dragging`. Red → green; measure in Cosmos (title bar 9/11, buttons 24, radius 12) in both themes.

- [ ] **Step 3: gate + commit** — `git add frontend-v2/src/shared/ui`; message `feat(frontend-v2): ViewportWindow — the mock's floating panel with a handle, a grip and icon actions`.

---

### Task 3: `entities/panorama`

**Files:**
- Create under `frontend-v2/src/entities/panorama/`: `index.ts`; `model/panorama.ts`; `model/calibration.ts` + `.spec.ts`; `model/look-yaw.ts` + `.spec.ts`; `model/marker-drag.ts` + `.spec.ts`; `model/image-signature.ts` + `.spec.ts`; `model/exif-gps.ts` + `.spec.ts`; `model/geo-anchor.ts` + `.spec.ts`; `model/read-with-progress.ts` + `.spec.ts`; `model/exif-scene-position.ts` + `.spec.ts`; `api/panoramas-gateway.ts` + `.spec.ts`; `api/to-panorama.ts` + `.spec.ts`; `panorama.fixture.tsx` is NOT needed (no JSX in the slice).

**Interfaces:**
- Produces:
```ts
export type Panorama = { id: number; territorySlug: string; slug: string; title: string; sourceBlobHash: string; position: Vec3; yawOffset: number; defaultYaw: number; updatedAt: string };
export type PanoramaCreate = { title: string; sourceBlobHash: string; position?: Vec3; yawOffset?: number };
/** The PUT is a full replace on the gateway — every field, every time. */
export type PanoramaUpdate = { title: string; position: Vec3; yawOffset: number; defaultYaw: number };
listPanoramas(slug), createPanorama(slug, body), updatePanorama(slug, id, body), deletePanorama(slug, id)
toPanorama(dto)
clampOpacity, nudgePosition, applyCalibration, type CalibrationDraft
yawToTarget, dirToYaw
IDLE, begin, move, dropTarget, type DragState
isEquirectImageSignature, readExifGps, gpsToScenePosition, type GpsFix, type SourceBbox
readWithProgress, exifScenePosition, type ScenePositionResult
```
- Consumes: `Vec3` from `@/entities/placement`; `httpGet/httpPost/httpPut/httpDelete` from `@/shared/api`; `components` from `@/shared/api/dto`.

- [ ] **Step 1: move the pure models verbatim.** For each of `calibration`, `look-yaw`, `marker-drag`, `image-signature`, `exif-gps`, `geo-anchor` copy `frontend/src/panorama/domain/<name>.ts` → `entities/panorama/model/<name>.ts` and `<name>.test.ts` → `<name>.spec.ts`; for `read-with-progress` and `exif-scene-position` from `frontend/src/panorama/application/`. Edits, and only these:
  - `import type { Vec3 } from "@/shared/domain/vec3"` → `import type { Vec3 } from "@/entities/placement"`;
  - `@/panorama/domain/panorama` → `./panorama`; `@/panorama/domain/geo-anchor` → `./geo-anchor`; `@/panorama/domain/exif-gps` → `./exif-gps`;
  - in every spec: `import { test } from "node:test"` → `import { test } from "vitest"`; `from "./x.ts"` → `from "./x"`; `exif-scene-position.spec.ts` already uses vitest — repoint its `SourceBbox` import to `./geo-anchor`.
  - `readWithProgress`'s comment about TextureLoader stays.
Run `yarn vitest run src/entities/panorama` → every moved test green (they are the old suite). Comments stay as they were; the cap is not at risk (largest is `exif-gps.ts` at 105).

- [ ] **Step 2: failing gateway spec** `api/panoramas-gateway.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ httpGet: vi.fn(), httpPost: vi.fn(), httpPut: vi.fn(), httpDelete: vi.fn() }));
vi.mock("@/shared/api", () => http);

const { listPanoramas, createPanorama, updatePanorama, deletePanorama } = await import("./panoramas-gateway");

const DTO = { id: 7, territorySlug: "t", slug: "control-room", title: "Control room, north door", sourceBlobHash: "h", position: { x: 1, y: 2, z: 3 }, yawOffset: 0.5, defaultYaw: 1.2, updatedAt: "2026-09-14T10:00:00Z" };

describe("panoramas gateway", () => {
  beforeEach(() => Object.values(http).forEach((f) => f.mockReset()));

  it("lists under the territory, mapping every row", async () => {
    http.httpGet.mockResolvedValue([DTO]);
    const out = await listPanoramas("t/1");
    expect(http.httpGet).toHaveBeenCalledWith("/api/territories/t%2F1/panoramas");
    expect(out[0]).toEqual({ ...DTO, territorySlug: "t" });
  });

  it("creates with the body as given", async () => {
    http.httpPost.mockResolvedValue(DTO);
    await createPanorama("t", { title: "x", sourceBlobHash: "h", yawOffset: 0 });
    expect(http.httpPost).toHaveBeenCalledWith("/api/territories/t/panoramas", { title: "x", sourceBlobHash: "h", yawOffset: 0 });
  });

  it("updates with all four fields — the gateway zeroes what is absent", async () => {
    http.httpPut.mockResolvedValue(DTO);
    await updatePanorama("t", 7, { title: "x", position: { x: 0, y: 0, z: 0 }, yawOffset: 1, defaultYaw: 2 });
    expect(http.httpPut).toHaveBeenCalledWith("/api/territories/t/panoramas/7", { title: "x", position: { x: 0, y: 0, z: 0 }, yawOffset: 1, defaultYaw: 2 });
  });

  it("deletes by id", async () => {
    http.httpDelete.mockResolvedValue(undefined);
    await deletePanorama("t", 7);
    expect(http.httpDelete).toHaveBeenCalledWith("/api/territories/t/panoramas/7");
  });

  it("maps a missing updatedAt to an empty string", async () => {
    http.httpGet.mockResolvedValue([{ ...DTO, updatedAt: undefined }]);
    expect((await listPanoramas("t"))[0].updatedAt).toBe("");
  });
});
```

- [ ] **Step 3: types, mapper, gateway**

`model/panorama.ts`:
```ts
import type { Vec3 } from "@/entities/placement";

/** An equirect photo anchored at `position` in scene units; `yawOffset` turns the sphere, `defaultYaw` is where a reader first looks. Both radians. */
export type Panorama = {
  id: number;
  territorySlug: string;
  slug: string;
  title: string;
  sourceBlobHash: string;
  position: Vec3;
  yawOffset: number;
  defaultYaw: number;
  updatedAt: string;
};

export type PanoramaCreate = { title: string; sourceBlobHash: string; position?: Vec3; yawOffset?: number };

/** Every field, every time: the gateway's PUT replaces the row and zeroes what is absent. */
export type PanoramaUpdate = { title: string; position: Vec3; yawOffset: number; defaultYaw: number };

/** The mock's "not calibrated yet": nothing has moved the anchor off the origin. */
export const isCalibrated = (p: Panorama): boolean =>
  p.position.x !== 0 || p.position.y !== 0 || p.position.z !== 0 || p.yawOffset !== 0;
```
`api/to-panorama.ts`:
```ts
import type { components } from "@/shared/api/dto";
import type { Panorama } from "../model/panorama";

type PanoramaDto = components["schemas"]["Panorama"];

export const toPanorama = (d: PanoramaDto): Panorama => ({
  id: d.id,
  territorySlug: d.territorySlug,
  slug: d.slug,
  title: d.title,
  sourceBlobHash: d.sourceBlobHash,
  position: d.position,
  yawOffset: d.yawOffset,
  defaultYaw: d.defaultYaw,
  updatedAt: d.updatedAt ?? "",
});
```
`api/panoramas-gateway.ts`:
```ts
import { httpDelete, httpGet, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Panorama, PanoramaCreate, PanoramaUpdate } from "../model/panorama";
import { toPanorama } from "./to-panorama";

type PanoramaDto = components["schemas"]["Panorama"];
const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/panoramas`;

export const listPanoramas = async (slug: string): Promise<Panorama[]> =>
  (await httpGet<PanoramaDto[]>(base(slug))).map(toPanorama);

export const createPanorama = async (slug: string, body: PanoramaCreate): Promise<Panorama> =>
  toPanorama(await httpPost<PanoramaDto>(base(slug), body));

export const updatePanorama = async (slug: string, id: number, body: PanoramaUpdate): Promise<Panorama> =>
  toPanorama(await httpPut<PanoramaDto>(`${base(slug)}/${id}`, body));

export const deletePanorama = (slug: string, id: number): Promise<void> =>
  httpDelete(`${base(slug)}/${id}`);
```
`to-panorama.spec.ts`: two cases (full row; `updatedAt` absent → `""`). `model/panorama.spec.ts`: `isCalibrated` false at the origin with yaw 0, true when any of the four moves. `index.ts` exports everything listed under Interfaces. Run → green.

- [ ] **Step 4: gate + commit** — `feat(frontend-v2): entities/panorama — the type, the gateway and the old app's pure models with their tests`.

---

### Task 4: `entities/document`, the bundle carries both, visibility and the territory link

**Files:**
- Create under `frontend-v2/src/entities/document/`: `index.ts`, `model/document.ts` + `.spec.ts`, `model/pdf-signature.ts` + `.spec.ts`, `api/to-document.ts` + `.spec.ts`, `api/documents-gateway.ts` + `.spec.ts`
- Modify: `entities/scene/api/scene-gateway.ts` (+spec), `entities/scene/model/scene-view-model.ts` (+spec), `entities/scene/index.ts`
- Modify: `entities/placement/api/placements-gateway.ts` (+spec), `entities/placement/model/placement.ts` (`PlacementCreate.visiblePanoramaIds`), `entities/placement/index.ts`
- Modify: `entities/territory/api/territories-gateway.ts` (+spec), `entities/territory/index.ts`

**Interfaces:**
- Produces:
```ts
export type Document = { id: number; territorySlug: string; title: string; sourceBlobHash: string; createdAt: string };
listDocuments(slug), createDocument(slug, { title, sourceBlobHash }), deleteDocument(slug, id), isPdfSignature(bytes)
SceneBundle.panoramas: Panorama[]; SceneBundle.documents: Document[]
SceneViewModel.panoramas: Panorama[]; SceneViewModel.documents: Document[]; SceneViewModel.sourceBbox: SourceBbox | null
setPlacementVisibility(slug, id, panoramaIds: number[]): Promise<Placement>
updateTerritory(slug, { externalPanoramaUrl }): Promise<Territory>   // PATCH
```

- [ ] **Step 1: document entity** — move `frontend/src/document/domain/pdf-signature.ts` + test (vitest-ified as in Task 3) to `model/`; `model/document.ts`:
```ts
export type Document = { id: number; territorySlug: string; title: string; sourceBlobHash: string; createdAt: string };
export type DocumentCreate = { title: string; sourceBlobHash: string };
/** The mock's row and window print the file name; the gateway keeps a title. */
export const documentFileName = (d: Document) => d.title;
```
(`document.spec.ts`: `documentFileName` returns the title — one case; keep it, the module needs a spec.) `api/to-document.ts` maps the DTO with `createdAt: d.createdAt ?? ""`; `api/documents-gateway.ts` mirrors Task 3's shape over `/api/territories/{slug}/documents` with `list`, `create`, `delete` (no PUT — spec §7). Specs as in Task 3 (encoded slug, body passthrough, delete path, `createdAt` default). Red → green.

- [ ] **Step 2: the bundle** — failing cases in `scene-gateway.spec.ts`: the mapped bundle carries `panoramas` (mapped through `toPanorama`) and `documents` (through `toDocument`), and `[]` for each when the DTO omits them. Implementation: add `panoramas: (d.panoramas ?? []).map(toPanorama)`, `documents: (d.documents ?? []).map(toDocument)` and the two fields on `SceneBundle`. `scene-view-model.spec.ts`: `toSceneViewModel` passes both lists through and exposes `sourceBbox: { min: artifact.bboxMin, max: artifact.bboxMax }` (null when the bbox is the ZERO fallback on both ends — `geo-anchor` returns null for a zero-extent box anyway, but a null here keeps the upload form from reading EXIF for nothing). Update `entities/scene/index.ts`. Every existing spec that builds a `SceneBundle` literal gains `panoramas: [], documents: []` — grep `modelOptions:` under `src/` to find them (page fixtures included).

- [ ] **Step 3: visibility** — `placements-gateway.spec.ts` case: `setPlacementVisibility("t", 5, [1, 2])` PUTs `/api/territories/t/placements/5/visibility` with `{ panoramaIds: [1, 2] }` and maps the answer. Implementation:
```ts
/** Replaces the allowlist in full; the answer carries a fresh updatedAt so an open form re-keys. */
export async function setPlacementVisibility(territorySlug: string, id: number, panoramaIds: number[]): Promise<Placement> {
  return toPlacement(await httpPut<PlacementDto>(`${base(territorySlug)}/${id}/visibility`, { panoramaIds }));
}
```
`PlacementCreate` gains `visiblePanoramaIds?: number[]` (check `model/placement.ts` — it is typed against the DTO or by hand; add the field where the type lives). Export from the index.

- [ ] **Step 4: territory link** — `territories-gateway.spec.ts` case: `updateTerritory("t", { externalPanoramaUrl: "https://tour.example" })` PATCHes `/api/territories/t` with that body and maps the answer through `toTerritory`. Implementation with `httpPatch` and `components["schemas"]["TerritoryUpdate"]` as the body type. Export.

- [ ] **Step 5: gate + commit** — `feat(frontend-v2): entities/document; the scene bundle carries panoramas and documents; placement visibility and the territory link gateways`.

---

### Task 5: `features/viewer-mode` — the view, move mode, the editing target, `P` and `V`

**Files:**
- Modify: `frontend-v2/src/features/viewer-mode/model/viewer-mode.ts` + `viewer-mode.spec.ts`
- Modify: `frontend-v2/src/features/viewer-mode/model/use-viewer-mode.ts` + `use-viewer-mode.spec.tsx`
- Modify: `frontend-v2/src/features/viewer-mode/index.ts`

**Interfaces:**
- Produces:
```ts
export type ViewerView = { kind: "scene" } | { kind: "panorama"; id: number };
export type ViewerModeState = { mode; selectedId; gizmo; snap; view: ViewerView; move: boolean; editingPanoramaId: number | null };
export type ViewerModeAction = …existing…
  | { type: "enterPanorama"; id: number } | { type: "exitPanorama" }
  | { type: "toggleMove" } | { type: "exitMove" }
  | { type: "startEdit"; id: number } | { type: "closeEdit" }
  | { type: "escape"; chainOpen: boolean };
useViewerMode({ canWrite, canMovePoints, chainOpen, onCancelChain, onCycle, beforeEscape })
  → { state, select, setGizmo, toggleSnap, toggleMeasure, exitMeasure, enterPlace, exitPlace, escape,
      enterPanorama(id), exitPanorama, toggleMove, exitMove, startEdit(id), closeEdit }
```
`onCycle` is the `P` key (the list of panoramas lives in the feature that owns it — Task 6 supplies it); `beforeEscape?: () => boolean` runs first and, returning true, claims the key (the document window, Task 15).

- [ ] **Step 1: failing reducer table** — append to `viewer-mode.spec.ts`:

```ts
const inPano = { ...INITIAL_VIEWER_MODE, view: { kind: "panorama", id: 3 } as const };

describe("the view, move and the editing target", () => {
  it("starts in the scene, not moving, editing nothing", () => {
    expect(INITIAL_VIEWER_MODE.view).toEqual({ kind: "scene" });
    expect(INITIAL_VIEWER_MODE.move).toBe(false);
    expect(INITIAL_VIEWER_MODE.editingPanoramaId).toBeNull();
  });

  it("entering a panorama leaves place and measure and move, keeps the selection", () => {
    const s = viewerModeReducer({ ...INITIAL_VIEWER_MODE, mode: "measure", move: true, selectedId: 4 }, { type: "enterPanorama", id: 3 });
    expect(s).toMatchObject({ mode: "orbit", move: false, selectedId: 4, view: { kind: "panorama", id: 3 } });
  });

  it("exiting returns to the scene and touches nothing else", () => {
    expect(viewerModeReducer({ ...inPano, selectedId: 4 }, { type: "exitPanorama" })).toMatchObject({ view: { kind: "scene" }, selectedId: 4 });
  });

  it("place cannot be entered inside a panorama", () => {
    expect(viewerModeReducer(inPano, { type: "enterPlace" })).toBe(inPano);
  });

  it("move is a scene-only mode: on, it leaves measure and deselects; off again on toggle; never inside a panorama", () => {
    const on = viewerModeReducer({ ...INITIAL_VIEWER_MODE, mode: "measure", selectedId: 2 }, { type: "toggleMove" });
    expect(on).toMatchObject({ move: true, mode: "orbit", selectedId: null });
    expect(viewerModeReducer(on, { type: "toggleMove" }).move).toBe(false);
    expect(viewerModeReducer(inPano, { type: "toggleMove" })).toBe(inPano);
    expect(viewerModeReducer(on, { type: "exitMove" }).move).toBe(false);
  });

  it("measure, place and a selection all leave move", () => {
    const moving = { ...INITIAL_VIEWER_MODE, move: true };
    expect(viewerModeReducer(moving, { type: "toggleMeasure" }).move).toBe(false);
    expect(viewerModeReducer(moving, { type: "enterPlace" }).move).toBe(false);
    expect(viewerModeReducer(moving, { type: "select", id: 1 }).move).toBe(false);
  });

  it("the editing target is its own field and survives a view change", () => {
    const editing = viewerModeReducer(INITIAL_VIEWER_MODE, { type: "startEdit", id: 3 });
    expect(editing.editingPanoramaId).toBe(3);
    expect(viewerModeReducer(editing, { type: "enterPanorama", id: 3 }).editingPanoramaId).toBe(3);
    expect(viewerModeReducer(editing, { type: "closeEdit" }).editingPanoramaId).toBeNull();
  });

  it("escape peels: move, then the selection, then the mode, then the panorama", () => {
    const esc = { type: "escape", chainOpen: false } as const;
    const all = { ...inPano, move: false, selectedId: 2, mode: "measure" as const };
    const s1 = viewerModeReducer({ ...INITIAL_VIEWER_MODE, move: true, selectedId: 2 }, esc);
    expect(s1).toMatchObject({ move: false, selectedId: 2 });
    const s2 = viewerModeReducer(all, esc);
    expect(s2.selectedId).toBeNull();
    const s3 = viewerModeReducer(s2, esc);
    expect(s3.mode).toBe("orbit");
    const s4 = viewerModeReducer(s3, esc);
    expect(s4.view).toEqual({ kind: "scene" });
    expect(viewerModeReducer(s4, esc)).toBe(s4);
  });
});
```
Run → red (unknown action types / fields).

- [ ] **Step 2: reducer**

```ts
export type ViewerView = { kind: "scene" } | { kind: "panorama"; id: number };

export type ViewerModeState = {
  mode: ViewerMode;
  selectedId: number | null;
  gizmo: GizmoMode;
  snap: boolean;
  /** Where the camera is: the scene, or inside one panorama. */
  view: ViewerView;
  /** Drag panorama points (V). A scene-only sub-mode of orbit. */
  move: boolean;
  /** The anchor card's target; survives 3D ↔ panorama. */
  editingPanoramaId: number | null;
};

export const INITIAL_VIEWER_MODE: ViewerModeState = {
  mode: "orbit", selectedId: null, gizmo: "translate", snap: false,
  view: { kind: "scene" }, move: false, editingPanoramaId: null,
};

export type ViewerModeAction =
  | { type: "toggleMeasure" } | { type: "exitMeasure" }
  | { type: "setGizmo"; gizmo: GizmoMode } | { type: "toggleSnap" }
  | { type: "select"; id: number | null }
  | { type: "enterPlace" } | { type: "exitPlace" }
  | { type: "enterPanorama"; id: number } | { type: "exitPanorama" }
  | { type: "toggleMove" } | { type: "exitMove" }
  | { type: "startEdit"; id: number } | { type: "closeEdit" }
  | { type: "escape"; chainOpen: boolean };

const SCENE: ViewerView = { kind: "scene" };

export function viewerModeReducer(state: ViewerModeState, action: ViewerModeAction): ViewerModeState {
  switch (action.type) {
    case "toggleMeasure":
      return state.mode === "measure"
        ? { ...state, mode: "orbit" }
        : { ...state, mode: "measure", selectedId: null, move: false };
    case "exitMeasure":
      return state.mode === "measure" ? { ...state, mode: "orbit" } : state;
    case "setGizmo":
      return { ...state, gizmo: action.gizmo };
    case "toggleSnap":
      return { ...state, snap: !state.snap };
    case "select":
      return action.id === null
        ? { ...state, selectedId: null }
        : { ...state, mode: "orbit", selectedId: action.id, move: false };
    case "enterPlace":
      // B-5: inside a panorama nothing is placed — the tile is inert and the key is too.
      if (state.view.kind === "panorama") return state;
      return { ...state, mode: "place", selectedId: null, move: false };
    case "exitPlace":
      return state.mode === "place" ? { ...state, mode: "orbit" } : state;
    case "enterPanorama":
      return { ...state, mode: "orbit", move: false, view: { kind: "panorama", id: action.id } };
    case "exitPanorama":
      return state.view.kind === "scene" ? state : { ...state, view: SCENE };
    case "toggleMove":
      if (state.view.kind === "panorama") return state;
      return state.move
        ? { ...state, move: false }
        : { ...state, move: true, mode: "orbit", selectedId: null };
    case "exitMove":
      return state.move ? { ...state, move: false } : state;
    case "startEdit":
      return { ...state, editingPanoramaId: action.id };
    case "closeEdit":
      return state.editingPanoramaId === null ? state : { ...state, editingPanoramaId: null };
    case "escape":
      if (action.chainOpen) return state;
      if (state.move) return { ...state, move: false };
      if (state.selectedId !== null) return { ...state, selectedId: null };
      if (state.mode !== "orbit") return { ...state, mode: "orbit" };
      if (state.view.kind === "panorama") return { ...state, view: SCENE };
      return state;
  }
}
```
Keep the existing doc comment, extend it with one sentence per new rule. Run → green; A's existing cases stay green.

- [ ] **Step 3: failing hook spec** — append to `use-viewer-mode.spec.tsx` (the file already renders the hook and fires keys; follow its helpers):

```tsx
it("P asks the owner of the list to cycle; V toggles move only with the grant", () => {
  const onCycle = vi.fn();
  const { result } = renderHook(() => useViewerMode({ canWrite: true, canMovePoints: false, chainOpen: false, onCancelChain: noop, onCycle }));
  fireEvent.keyDown(window, { key: "p" });
  expect(onCycle).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "v" });
  expect(result.current.state.move).toBe(false);
});

it("V toggles move with panorama:write", () => {
  const { result } = renderHook(() => useViewerMode({ canWrite: true, canMovePoints: true, chainOpen: false, onCancelChain: noop, onCycle: noop }));
  fireEvent.keyDown(window, { key: "v" });
  expect(result.current.state.move).toBe(true);
});

it("beforeEscape claims the key and the reducer is not asked", () => {
  const { result } = renderHook(() => useViewerMode({ canWrite: true, canMovePoints: true, chainOpen: false, onCancelChain: noop, onCycle: noop, beforeEscape: () => true }));
  act(() => result.current.enterPanorama(3));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(result.current.state.view).toEqual({ kind: "panorama", id: 3 });
});

it("gizmo keys still work inside a panorama on a selected object (B-5)", () => {
  const { result } = renderHook(() => useViewerMode({ canWrite: true, canMovePoints: true, chainOpen: false, onCancelChain: noop, onCycle: noop }));
  act(() => { result.current.enterPanorama(3); result.current.select(1); });
  fireEvent.keyDown(window, { key: "r" });
  expect(result.current.state.gizmo).toBe("rotate");
});
```

- [ ] **Step 4: hook** — extend `UseViewerModeParams` with `canMovePoints: boolean`, `onCycle: () => void`, `beforeEscape?: () => boolean`; add the six dispatchers (`enterPanorama`, `exitPanorama`, `toggleMove`, `exitMove`, `startEdit`, `closeEdit`) as `useCallback`s; `toggleMove` runs `leaveMeasure()` first (a chain is broken the same way measure is left); `escape`:
```ts
const escape = useCallback(() => {
  if (beforeEscape?.()) return;
  if (chainOpen) onCancelChain();
  dispatch({ type: "escape", chainOpen });
}, [beforeEscape, chainOpen, onCancelChain]);
```
Keys: `p: onCycle`, `v: () => { if (canMovePoints) toggleMove(); }`. Update every existing caller's params (`use-territory-viewer.ts` passes `canMovePoints: false, onCycle: () => {}` for now — Task 15 wires them; its spec's param objects too). Export `ViewerView` from the index. Run → green.

- [ ] **Step 5: gate + commit** — `feat(frontend-v2): viewer-mode knows the view, move mode and the editing target; P and V`.

---

### Task 6: `features/panorama-view` — the list, the view, calibration, drag, the texture, the markers switch

**Files:**
- Create under `frontend-v2/src/features/panorama-view/`: `index.ts`; `model/use-panorama-list.ts` + `.spec.tsx`; `model/use-panorama-view.ts` + `.spec.tsx`; `model/use-panorama-calibration.ts` + `.spec.tsx`; `model/use-panorama-drag.ts` + `.spec.tsx`; `model/use-panorama-texture.ts` + `.spec.tsx`; `model/use-marker-switch.ts` + `.spec.tsx`; `model/nudge-steps.ts` + `.spec.ts`

**Interfaces:**
- Consumes: `entities/panorama` (Task 3), `ViewerModeState`/dispatchers (Task 5), `notify`, `messageOf`, `assetUrl` from `@/entities/content`.
- Produces:
```ts
usePanoramaList({ slug, initial, onChanged }) → { panoramas, add(p), update(id, patch: Partial<PanoramaUpdate>), remove(id), pendingId }
usePanoramaView(panoramas, mode: { view, editingPanoramaId, enterPanorama, exitPanorama, startEdit, closeEdit })
  → { active: Panorama | null, editing: Panorama | null, activate(id | null), cycle(), toggleView(), startEdit(id), closeEdit(), index: { current, total } }
usePanoramaCalibration(editing, onSave) → { calibrating, draft, opacity, effective, start, cancel, save, nudge(axis, delta), setYaw, setPosition, setOpacity }   // moved
usePanoramaDrag(onCommit) → { draggingId, livePos, begin, move, end, reset }                                  // moved, minus moveMode (the reducer owns it)
usePanoramaTexture(hash, decode: TextureDecoder) → { texture, progress, status }                            // moved, decoder injected (required)
useMarkerSwitch() → { showMarkers, toggle }                                                                   // localStorage "andrey.panorama-markers"
NUDGE_STEPS = [{ label: "Fine", value: 0.005 }, { label: "Med", value: 0.02 }, { label: "Coarse", value: 0.1 }]
export type TextureDecoder = (blob: Blob) => Promise<ImageBitmap>;
```

- [ ] **Step 1: `usePanoramaList` — failing spec** (`renderHook` + `act`, `vi.mock("@/entities/panorama")` for `updatePanorama`/`deletePanorama`, `vi.mock("@/shared/lib/notify")`):
  - `update(id, { yawOffset: 1 })` sends the merged full body (`title`, `position`, `yawOffset: 1`, `defaultYaw` from the current row), swaps in the server's row, calls `onChanged` once;
  - a refused update rolls the row back and toasts `Failed to update panorama: …`;
  - `remove(id)` drops the row first, DELETEs, toasts `Panorama deleted`, calls `onChanged`; a refused delete restores the row and toasts the error;
  - `add(p)` appends; `pendingId` is the id whose PUT/DELETE is in flight, else null.

- [ ] **Step 2: `usePanoramaList`** — port `frontend/src/panorama/application/use-panoramas.ts` (read it: the optimistic merge, the `panoramasRef`, `startTransition`), with `add`, `pendingId`, `onChanged()` after every settled mutation, `messageOf(err)` for the toasts, `updatePanorama`/`deletePanorama` from `@/entities/panorama`. Keep its head comment.

- [ ] **Step 3: `usePanoramaView` — failing spec**: with a fake mode (`useState`-backed stub of the six fields) and three panoramas: `activate(3)` → `enterPanorama(3)` and `startEdit(3)`; `activate(null)` → `exitPanorama` only (the edit target stays, as the old SPA: "the X in the panel clears it"); `cycle()` from the scene → first id, from the last → scene, with no panoramas → nothing; `toggleView()` with an editing target flips scene ↔ that panorama and is a no-op without one; `index` is `{ current: 1-based position of editing, total }` for the card's `1 of 2`; `active`/`editing` re-derive by id when the list changes.

- [ ] **Step 4: `usePanoramaView`** — port `use-panorama-orchestration.ts` on top of the reducer's fields (no `useState` of its own: `activeId = mode.view.kind === "panorama" ? mode.view.id : null`).

- [ ] **Step 5: calibration, drag, texture, switch, steps** — move `use-panorama-calibration.ts` verbatim (imports re-pointed to `@/entities/panorama`; `Vec3` from `@/entities/placement`) and spec it: `start` seeds from the editing row; `nudge("x", 0.02)` moves the draft; `effective` is the row with the draft applied and null when the editing id changes (calibration is derived); `save` calls `onSave(id, { position, yawOffset })` once and clears; `setOpacity` clamps to 0.15–1. Move `use-panorama-drag.ts` minus `moveMode`/`toggle`/`exit` (the reducer's `move` replaces them; `reset()` clears an in-flight drag when the mode leaves) and spec it: `begin(7)` → `draggingId 7`, `move(p)` → `livePos p`, `end()` commits once with `(7, p)` and idles, `end()` after `begin` alone commits nothing. `nudge-steps.ts` exports `NUDGE_STEPS` (spec: three entries in that order). `use-marker-switch.ts`: `useState` seeded from `localStorage.getItem("andrey.panorama-markers") !== "hidden"`, `toggle` writes `hidden`/removes, every storage call in try/catch (spec: default on; toggle persists; a throwing storage still answers).

- [ ] **Step 6: `usePanoramaTexture` — failing spec** (`vi.stubGlobal("fetch", …)` answering a `Response` with a small body and `Content-Length`; a fake decoder resolving to `{ close: vi.fn() } as unknown as ImageBitmap`):
  - status walks `loading` → `ready`, `progress` reaches 100, the texture has `colorSpace === SRGBColorSpace`, `flipY === false`, `repeat.x === -1`, `offset.x === 1`, `wrapS === RepeatWrapping`;
  - the decoder is called with the blob (so the `flipY` orientation lives in the default decoder, not the hook);
  - a non-2xx answer → `status "error"`, texture null;
  - a rejected decode → `error`;
  - a hash change mid-flight aborts the first fetch (`AbortSignal` observed) and disposes nothing that was never created; a ready texture is disposed on the next change (`texture.dispose` spied);
  - `hash === null` → `idle`.

- [ ] **Step 7: `usePanoramaTexture`** — port `use-panorama-texture.ts` with a **required** second parameter `decode: TextureDecoder`. The default decoder (`createImageBitmap(blob, { imageOrientation: "flipY" })`) is the one line jsdom cannot run; it lives in `widgets/viewer-canvas/three/image-bitmap.ts` (Task 7, the exemption per B-4), and the page passes the widget's export in (a page may import a widget). The feature then has no untestable line. `assetUrl` comes from `@/entities/content`; `readWithProgress` from `@/entities/panorama`.

- [ ] **Step 8: index, gate, commit** — `index.ts` exports every hook, `NUDGE_STEPS`, `TextureDecoder`, `PanoramaTextureState`. `feat(frontend-v2): features/panorama-view — the list, the view over the reducer, calibration, drag, the streamed texture, the markers switch`.

---

### Task 7: the sphere, the rig, the camera tracker, the loading overlay

**Skills:** the standard seven plus `threejs-fundamentals`, `threejs-interaction`, `threejs-textures`, `threejs-materials`, `threejs-geometry`.

**Files:**
- Create under `frontend-v2/src/widgets/viewer-canvas/three/`: `image-bitmap.ts` (exempt), `panorama-sphere.tsx` + `.spec.tsx`, `panorama-rig.tsx` + `.spec.tsx`, `camera-tracker.tsx` + `.spec.tsx`, `panorama-loading-overlay.tsx` + `.spec.tsx`
- Modify: `frontend-v2/exempt-modules.ts` (+ `src/widgets/viewer-canvas/three/image-bitmap.ts` with a comment), `widgets/viewer-canvas/three/testing.ts` (`fakeControls()`), `widgets/viewer-canvas/index.ts` (export `decodeImageBitmap`)

**Interfaces:**
- Produces:
```ts
// image-bitmap.ts
export const decodeImageBitmap: TextureDecoder = (blob) => createImageBitmap(blob, { imageOrientation: "flipY" });
// panorama-sphere.tsx
PanoramaSphere({ panorama: Panorama; texture: Texture; opacity?: number })
// panorama-rig.tsx
PanoramaRig({ panorama: Panorama })
// camera-tracker.tsx
CameraTracker({ positionRef: RefObject<Vec3 | null>; yawRef: RefObject<number | null> })
// panorama-loading-overlay.tsx
PanoramaLoadingOverlay({ progress: number | null; label: string; barColor: string })
// testing.ts
export const fakeControls = () => ({ target: new Vector3(), enabled: true, enableZoom: true, enablePan: true, minDistance: 0.01, maxDistance: 100, listeners: new Map<string, Set<() => void>>(), addEventListener(t, l), removeEventListener(t, l), update: vi.fn(), fire(t) })
```

- [ ] **Step 1: `image-bitmap.ts`** — the one-liner above with the comment "WebGL cannot flipY an ImageBitmap; pre-flipping here and `flipY = false` on the texture is what keeps the equirect upright. jsdom has no createImageBitmap: exempt, and the hook that uses it takes it as a parameter." Add to `exempt-modules.ts` beside the three A files with the same reasoning.

- [ ] **Step 2: `PanoramaSphere` — failing spec** (`@react-three/test-renderer`; build a `Texture` with `new Texture()`; the drei mock is not needed):

```tsx
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BackSide, Texture, type Mesh, type MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import PanoramaSphere from "./panorama-sphere";

const PANO = { id: 1, territorySlug: "t", slug: "s", title: "Control room", sourceBlobHash: "h", position: { x: 1, y: 2, z: 3 }, yawOffset: 0.5, defaultYaw: 0, updatedAt: "" };

describe("PanoramaSphere", () => {
  it("is an inverted 50-unit sphere at the anchor, turned by the yaw offset, drawn from the inside without tone mapping", async () => {
    const r = await ReactThreeTestRenderer.create(<PanoramaSphere panorama={PANO} texture={new Texture()} />);
    const mesh = r.scene.children[0].instance as Mesh;
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.rotation.y).toBeCloseTo(0.5);
    expect((mesh.geometry as { parameters: { radius: number } }).parameters.radius).toBe(50);
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.side).toBe(BackSide);
    expect(mat.toneMapped).toBe(false);
    expect(mat.transparent).toBe(false);
    expect(mesh.renderOrder).toBe(0);
  });

  it("ghosts for calibration: transparent, no depth, drawn last", async () => {
    const r = await ReactThreeTestRenderer.create(<PanoramaSphere panorama={PANO} texture={new Texture()} opacity={0.5} />);
    const mesh = r.scene.children[0].instance as Mesh;
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.5);
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mesh.renderOrder).toBe(1000);
  });

  it("cannot be hit by the pointer — a click into the sky reaches onPointerMissed", async () => {
    const r = await ReactThreeTestRenderer.create(<PanoramaSphere panorama={PANO} texture={new Texture()} />);
    const mesh = r.scene.children[0].instance as Mesh;
    const hits: unknown[] = [];
    mesh.raycast(new (await import("three")).Raycaster(), hits);
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 3: `PanoramaSphere`** — port `frontend/src/panorama/presentation/three/panorama-sphere.tsx` with these changes: no `meshRef` prop (B-5: nothing snaps to the sphere, so no `userData.origRaycast` stash either — the raycast is simply a no-op set in a `useEffect` on the mesh ref, restored on unmount); `Panorama` from `@/entities/panorama`; the head comment rewritten to say why the sphere is unhittable and why radius 50 stays (the old app's value; nothing measures against it). Run → green.

- [ ] **Step 4: `PanoramaRig` — failing spec** (`fakeControls` from `testing.ts`; mount inside the test renderer with a component that `useThree((s) => s.set)({ controls })` on mount — put that helper, `WithControls`, in `testing.ts` too):

```tsx
it("pins the camera to the anchor, looks along defaultYaw, disables zoom and pan, and recentres on every change", async () => {
  const controls = fakeControls();
  const r = await ReactThreeTestRenderer.create(<WithControls controls={controls}><PanoramaRig panorama={{ ...PANO, defaultYaw: Math.PI / 2 }} /></WithControls>);
  const cam = probe.camera!;   // `WithControls` also mounts a probe child that copies `useThree((s) => s.camera)` into `probe`
  expect(cam.position.toArray()).toEqual([1, 2, 3]);
  expect(controls.target.x).toBeCloseTo(1 + 0.01);   // sin(π/2) · 0.01
  expect(controls.target.z).toBeCloseTo(3);
  expect(controls.enableZoom).toBe(false);
  expect(controls.enablePan).toBe(false);
  // OrbitControls orbits the eye off the anchor; the change listener puts it back.
  cam.position.set(1.5, 2, 3);
  controls.fire("change");
  expect(cam.position.toArray()).toEqual([1, 2, 3]);
});

it("re-pins without resetting the look when the anchor moves during calibration", …);   // update the panorama prop's position; target direction unchanged, camera at the new anchor
it("restores the previous camera, target and flags on unmount", …);                       // unmount → controls.enableZoom true, target back, camera back
```
(`WithControls({ controls, probe, children })` in `testing.ts`: on mount it does `useThree((s) => s.set)({ controls })` and writes `useThree((s) => s.camera)` into `probe.camera` — public API only.)

- [ ] **Step 5: `PanoramaRig`** — port `panorama-rig.tsx` verbatim apart from imports (`yawToTarget` from `@/entities/panorama`, `Vec3` from `@/entities/placement`). Keep `recenter` and `enterPanorama` as module functions with their comments. Run → green.

- [ ] **Step 6: `CameraTracker`** — port `camera-position-tracker.tsx` → `camera-tracker.tsx` (`dirToYaw` from `@/entities/panorama`); spec: after mount the refs hold the camera's position and yaw; a `change` on the fake controls updates them; `yaw` for a camera looking down +Z is 0 and down +X is π/2.

- [ ] **Step 7: `PanoramaLoadingOverlay`** — port `panorama-loading-overlay.tsx` with the bar inlined (the old `panorama-loading-bar.tsx` was 35 lines of Tailwind on cyan; here: a `ProgressBar` from `@/shared/ui/progress-bar` is a DOM component and may be used inside drei `Html`; `value={progress ?? undefined}` for indeterminate; label `Loading panorama`; the cover is `bg-panel` from the token — pass `barColor` no longer: drop that prop, the ProgressBar is tokenised). Move its spec (`panorama-loading-overlay.spec.tsx`) and convert it: `vi.mock("@react-three/fiber")` for `useThree` size and `vi.mock("@react-three/drei")` capturing `Html` props as it does today; assertions unchanged (`fullscreen` undefined; `calculatePosition()` → `[0, 0]`; style = canvas size; stable reference).

- [ ] **Step 8: gate + commit** — `feat(frontend-v2): the panorama sphere, the parallax-free rig, the camera tracker and the loading cover`.

---

### Task 8: markers, the drag controller, the canvas wiring

**Skills:** as Task 7.

**Files:**
- Create under `widgets/viewer-canvas/three/`: `panorama-marker.tsx` + `.spec.tsx`, `panorama-markers-layer.tsx` + `.spec.tsx`, `panorama-drag-controller.tsx` + `.spec.tsx`, `placement-markers.tsx` + `.spec.tsx`
- Modify: `three/placements-layer.tsx` (+spec), `three/scene-canvas.tsx` (+spec), `three/gltf-model.tsx` (`raycastable` also while moving), `ui/props.ts`, `model/scene-colors.ts` (+ `panel`, `fg` if absent), `testing.ts`
- Modify: `widgets/viewer-canvas/index.ts`

**Interfaces:**
- Produces (`ui/props.ts`, added to `ViewerCanvasProps`):
```ts
  /** The active panorama, calibration draft already applied; null in the 3D view. */
  activePanorama: Panorama | null;
  panoramaTexture: Texture | null;
  panoramaStatus: "idle" | "loading" | "ready" | "error";
  panoramaProgress: number | null;
  /** < 1 ghosts the sphere for calibration. */
  panoramaOpacity: number;
  panoramas: Panorama[];
  showMarkers: boolean;
  /** Labels for the viewport markers inside a panorama, by placement id (`storage-tank-500 #1`). */
  markerLabels: Record<number, string>;
  move: { active: boolean; draggingId: number | null; livePos: Vec3 | null };
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
  onActivatePanorama: (id: number) => void;
  onMarkerGrab: (id: number) => void;
  onMarkerMove: (point: Vec3) => void;
  onMarkerDrop: () => void;
```
- `PanoramaMarker({ panorama, moveMode, dragging, livePos, onActivate, onGrab })`; `PanoramaMarkersLayer({ panoramas, moveMode, draggingId, livePos, onActivate, onGrab })`; `PanoramaDragController({ dragging, territoryRef, onMove, onEnd })`; `PlacementMarkers({ placements, labels })`. Colours come from Tailwind tokens inside drei `Html` (DOM), so no colour props cross the boundary.

- [ ] **Step 1: `PanoramaMarker` — failing spec** (react-dom, drei `Html` as passthrough like `point-marker.spec.tsx`): a button named `Open panorama Control room` with `data-tour="panorama-marker"`; click → `onActivate(1)`; in move mode the name is `Move panorama Control room`, `pointerdown` → `onGrab(1)` and click does nothing; while dragging with `livePos` the `Html` position is the live point (assert on the captured `position` prop — mock `Html` to record props like the overlay spec does); the ring is 10 px (`size-2.5`) with a 2 px accent border and the label sits at (14, −6).

- [ ] **Step 2: `PanoramaMarker`** — the mock's state 8/9 marker, on tokens: `Html position center zIndexRange={[20, 10]}`; a `button` with `size-2.5 rounded-full border-2 border-accent bg-panel` and the label `absolute left-3.5 -top-1.5 whitespace-nowrap font-mono text-[10px] text-accent`; hover/focus ring via `focus-visible:outline-accent`; `cursor-grab`/`cursor-grabbing`/`cursor-pointer` as one property per state (clsx rule); `pointer-events-none` on the whole marker while dragging. Port the handler logic from `panorama-marker.tsx` verbatim. `accent` is a prop only for the ping halo colour if kept — drop the ping (motion), keep it simple: no `accent` prop; tokens do the colouring. Adjust the interface above accordingly.

- [ ] **Step 3: `PanoramaMarkersLayer`** — maps `panoramas` to markers (spec: N panoramas → N buttons; `draggingId` marks one as dragging).

- [ ] **Step 4: `PlacementMarkers`** — inside a panorama, one `Html` per visible placement at `placement.position`: a `span` (not a button — nothing to do) with the ring and the label from `labels[id]`; `pointer-events-none`; spec: draws one label per placement, skips a placement with no label.

- [ ] **Step 5: `PanoramaDragController` — failing spec** (test renderer + `fakeControls` + a territory group with one box mesh at the origin as `territoryRef`): while `dragging`, `controls.enabled` is false and a `pointermove` on `window` whose ray hits the box reports `onMove({x, y, z})` — build the ray through `useThree` `raycaster`/`camera`/`gl.domElement` like the old canvas did (read `frontend/src/viewer/presentation/three/scene-canvas.tsx` lines ~150–200 for the projection code and port it); `pointerup` on `window` → `onEnd()`; unmount re-enables the controls.

- [ ] **Step 6: `PanoramaDragController`** — port `panorama-drag-controller.tsx` and fold the old canvas's pointer-to-surface projection into it (it takes `territoryRef` and uses one module-level `Raycaster` + `Vector2`; the BVH-accelerated raycast the territory already carries makes this cheap).

- [ ] **Step 7: `PlacementsLayer`** — new props `activePanoramaId: number | null`, `markerLabels`, `showMarkers`; inside a panorama it renders only `placements.filter((p) => isVisibleIn(p, activePanoramaId))` (`isVisibleIn` already exists in `entities/placement`) and `<PlacementMarkers>` for them when `showMarkers`; spec: two placements, one allowed in panorama 3 → one instance + one marker; scene view → both, no markers.

- [ ] **Step 8: `SceneCanvas`** — wire it all (spec cases under the test renderer with `mockDrei`):
  - `activePanorama && panoramaTexture && panoramaStatus === "ready"` → `<PanoramaSphere>` + `<PanoramaRig>`; `panoramaStatus === "loading"` → `<PanoramaLoadingOverlay progress>`; the grid helper is not drawn inside a panorama (state 8: "no grid");
  - `<CameraTracker>` always mounted with the two refs;
  - in the scene view `showMarkers && !pointMode` → `<PanoramaMarkersLayer>` with `move.active`;
  - `<PanoramaDragController dragging={move.draggingId !== null} …>` always mounted;
  - `GltfModel raycastable={pointMode || move.active}`; `PlacementsLayer snapEnabled={snap && activePanorama === null}`; `<FocusOn request={activePanorama ? null : focusRequest}>`;
  - `onPointerMissed` deselects in orbit as before (inside a panorama too).
  Every new prop is destructured; the `mode`-derived `pointMode` is unchanged.

- [ ] **Step 9: `index.ts`, colours, gate, commit** — export `decodeImageBitmap` (already, Task 7) and nothing else new; `scene-colors.ts` reads `--color-panel` if the marker needs it inline (it should not — Tailwind classes inside `Html` are DOM). `feat(frontend-v2): panorama markers in the scene, viewport markers in a panorama, the drag controller, and the canvas wired for both`.

---

### Task 9: `features/document-view` — the open document and the PiP geometry

**Files:**
- Create under `frontend-v2/src/features/document-view/`: `index.ts`; `model/use-document-view.ts` + `.spec.tsx`; `model/use-pip-window.ts` + `.spec.tsx`; `model/pip-geometry.ts` + `.spec.ts`; `model/use-document-list.ts` + `.spec.tsx`

**Interfaces:**
- Produces:
```ts
export type DocumentWindowMode = "pip" | "collapsed" | "expanded";
useDocumentList({ slug, initial, onChanged }) → { documents, add(d), remove(id), pendingId }
useDocumentView(documents, onOpen: () => void) → { active: Document | null, window: DocumentWindowMode, open(id), close(), setWindow(mode), escape(): boolean }
  // open() calls onOpen first (the page passes exitPanorama); escape(): expanded → pip (true), pip|collapsed → close (true), nothing open → false
usePipWindow(inset = 14) → { geo: PipGeometry, dragging, startMove, startResize }
// pip-geometry.ts (pure)
export type PipGeometry = { x: number; y: number; w: number; h: number };
export const PIP_INIT = { w: 560, h: 400 }; export const PIP_MIN = { w: 320, h: 240 };
dock(viewport: { w; h }, inset): PipGeometry            // bottom-right at the inset
moved(base, dx, dy, viewport): PipGeometry             // clamp to [0, viewport − size]
resized(base, dx, dy, viewport): PipGeometry           // clamp to [min, viewport − origin]
```

- [ ] **Step 1: pure geometry — failing spec** `pip-geometry.spec.ts`: `dock({w:1440,h:900}, 14)` → `{x: 866, y: 486, w: 560, h: 400}`; `moved` clamps at 0 and at `viewport − size`; `resized` clamps at the minimum and at `viewport − origin`; a viewport smaller than the window docks at the inset (never negative).

- [ ] **Step 2: `pip-geometry.ts`** — the three functions and the constants (from `use-pip-window.ts`'s arithmetic, extracted pure).

- [ ] **Step 3: `usePipWindow` — failing spec**: initial `geo` equals `dock(window size, 14)`; `startMove` then a `pointermove` on `window` by (+30, −20) moves the geometry; `pointerup` sets `dragging` false and removes the listeners (a further `pointermove` changes nothing); `startResize` grows `w/h`; unmount mid-drag detaches (no error on a later `pointermove`); a `resize` event on `window` re-clamps an off-screen window back inside.

- [ ] **Step 4: `usePipWindow`** — port `frontend/src/document/application/use-pip-window.ts` over the pure functions; add the `window.resize` re-clamp (`setGeo((g) => moved(g, 0, 0, viewport))`).

- [ ] **Step 5: `useDocumentList`** — the same shape as `usePanoramaList` over `deleteDocument`: optimistic remove, rollback + toast on failure, `Document deleted` on success, `add`, `pendingId`, `onChanged`.

- [ ] **Step 6: `useDocumentView` — failing spec**: `open(2)` calls `onOpen` once, sets `active` to document 2 and `window` to `pip`; `setWindow("expanded")`; `escape()` from expanded → pip and returns true; from pip → closed, true; with nothing open → false; `close()` clears; `active` re-derives when the list drops the id (a deleted document closes the window).

- [ ] **Step 7: `useDocumentView`** — port `use-document-selection.ts` with the window mode instead of the boolean and `escape`.

- [ ] **Step 8: index, gate, commit** — `feat(frontend-v2): features/document-view — the open document, its window mode and the PiP geometry`.

---

### Task 10: `widgets/document-window`

**Files:**
- Create under `frontend-v2/src/widgets/document-window/`: `index.ts`; `ui/document-window.tsx` + `.spec.tsx`; `ui/collapsed-pill.tsx` + `.spec.tsx`; `document-window.fixture.tsx`

**Interfaces:**
- Produces:
```ts
export type DocumentWindowProps = {
  document: Document;
  window: DocumentWindowMode;
  canDelete: boolean;
  pip: { geo: PipGeometry; dragging: boolean; startMove; startResize };
  onWindow: (mode: DocumentWindowMode) => void;
  onDelete: () => void;       // the widget confirms first (ConfirmDialog)
  onExit: () => void;
};
```

- [ ] **Step 1: failing spec** `document-window.spec.tsx`:
  - the pdf.js frame: `<iframe title={document.title} src="/pdfjs/web/viewer.html?file=%2Fapi%2Fassets%2Fh">` (the `file` param is `encodeURIComponent(assetUrl(hash))`);
  - PiP: dialog named by the file, actions `Expand {file}`, `Hide {file}`, `Exit document overlay`, and `Delete {file}` only with `canDelete`; the handle and the grip present;
  - expanded: `Restore {file} to a window` in place of Expand, no Hide, no handle;
  - collapsed: **the iframe is still in the document** (`hidden` on the window) and the pill (`{file}` + `Show`) is drawn; `Show` → `onWindow("pip")`;
  - `Delete` opens the confirm (`Delete {file}?`, danger) and only its confirm calls `onDelete`;
  - the shield while `pip.dragging`.

- [ ] **Step 2: implementation** — `DocumentWindow` composes `ViewportWindow` (Task 2) with the actions per mode, the iframe body (`className="size-full border-0"`), `hidden={window === "collapsed"}` on a wrapper (never unmount), `ConfirmDialog` for delete, and `CollapsedPill` (`absolute bottom-3.5 left-[…]` beside the stats strip — the page positions it; the pill itself is `rounded-full border border-line-2 bg-panel px-[13px] py-[7px] shadow-elevation font-mono text-[10px] text-fg` with the `file` glyph 13 muted and a `Show` pill button `rounded-full border border-line-2 bg-panel-2 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]`). Fixture states `pip`, `expanded`, `collapsed`, `no-delete`, each inside a 1200×700 relative box with a placeholder in place of the frame (Cosmos cannot load pdf.js's viewer without the gateway — set `src` to `about:blank` in the fixture through a `frameSrc?` override prop that defaults to the real URL; the spec pins the default).

- [ ] **Step 3: gate + commit** — `feat(frontend-v2): widgets/document-window — pdf.js in a ViewportWindow, hidden but never unmounted`.

---

### Task 11: `features/territory-link` and `widgets/view-tab` — the sections

**Files:**
- Create `frontend-v2/src/features/territory-link/{index.ts, model/use-territory-link.ts + .spec.tsx, model/safe-url.ts + .spec.ts}`
- Create under `frontend-v2/src/widgets/view-tab/`: `index.ts`; `model/copy.ts` + `.spec.ts`; `ui/view-tab.tsx` + `.spec.tsx`; `ui/panorama-row.tsx` + `.spec.tsx`; `ui/document-row.tsx` + `.spec.tsx`; `ui/external-link.tsx` + `.spec.tsx`; `ui/section-head.tsx` + `.spec.tsx`; `view-tab.fixture.tsx`

**Interfaces:**
- Produces:
```ts
useTerritoryLink(slug, initialUrl) → { url, saving, save(url): Promise<boolean> }   // PATCH through updateTerritory; toast on failure
isSafeHttpUrl(raw): boolean
export type PanoramaRowView = { id; title; thumbUrl: string | null; active: boolean; calibrated: boolean; canEdit: boolean; editing: boolean };
export type ViewTabProps = {
  details: Detail[];
  panoramas: {
    rows: PanoramaRowView[];
    calibrating: { title: string } | null;         // the callout
    canUpload: boolean; onUpload: () => void;
    onEnter: (id) => void; onExit: () => void; onEdit: (id) => void;
    showMarkers: boolean; onToggleMarkers: () => void;
    onExitCalibration: () => void;
    link: { url: string | undefined; canEdit: boolean; saving: boolean; onSave: (url: string) => void };
    editor: ReactNode;                              // the anchor card (Task 12), rendered under the rows
  };
  documents: { rows: { id; name }[]; canUpload: boolean; onUpload: () => void; onOpen: (id) => void };
  footer: string | null;
};
// copy.ts
export const PANORAMAS_OVERLINE = "Panoramas"; DOCUMENTS_OVERLINE = "Documents";
export const documentsCount = (n) => `PDF overlays · ${n}`;
export const NOT_CALIBRATED = "not calibrated yet"; SHOW_IN = "Show in this panorama"; EXIT_PANORAMA = "Exit panorama";
export const CALIBRATION_LINE = "Drag panorama points on the model"; EXIT_CALIBRATION = "Exit calibration";
export const UPLOAD_PANORAMA_TITLE = "Upload a panorama"; UPLOAD_DOCUMENT_TITLE = "Upload a document";
export const LOADING_FOOTER = "Panoramas and documents stay clickable while the target LOD downloads — the coarse mesh is enough to aim the camera.";
export const insideFooter = (n: number) => `${n === 1 ? "One placement falls" : `${n} placements fall`} inside this panorama and ${n === 1 ? "is" : "are"} marked on the photo.`;  // mock: "Two placements fall …" — spell 1–9 in words: one, two, … nine
export const MARKERS_SWITCH = "Show panorama points"; TOUR_LINK = "Panorama tour";
```

- [ ] **Step 1: `features/territory-link`** — `safe-url.ts` with `isSafeHttpUrl` moved from `external-panorama-link.tsx` (spec: https/http true; `javascript:`, `data:`, garbage false). `use-territory-link.ts`: `useState(initialUrl)`, `save` → `updateTerritory(slug, { externalPanoramaUrl: url })`, sets the answer's url, returns true; on failure toasts `messageOf` and returns false (spec both; the PATCH body).

- [ ] **Step 2: `copy.ts` + spec** (`insideFooter(2)` → `Two placements fall inside this panorama and are marked on the photo.`; `insideFooter(1)` → `One placement falls … is marked …`; `documentsCount(2)` → `PDF overlays · 2`).

- [ ] **Step 3: rows — failing specs.** `PanoramaRow`: a thumb 44×34 (`w-11 h-[34px]`, `max-[1281px]:w-10 max-[1281px]:h-8`) with the image when `thumbUrl` else the `panorama` glyph 16 in `text-dim`; the title 12 px truncated; under it `not calibrated yet` (mono 9 muted) when not calibrated, else the `Show in this panorama` text button (mono 10, 0.1em, uppercase, accent) → `onEnter(id)`; on the active row the accent border + `bg-accent-soft` and `Exit panorama` → `onExit`; `canEdit` draws a 24×24 pencil button `Edit {title}` → `onEdit(id)` (the editing row gets `aria-current="true"`); `data-tour="panorama-picker"` on the first row's Show button — no: the tour step `panorama-picker` anchors the whole rows list (`ul`). `DocumentRow`: `file` glyph 15 muted, mono 11 name, `Open` (title `Open {name}`) → `onOpen(id)`.

- [ ] **Step 4: `SectionHead`** — overline (mono 9, 0.2em, uppercase, muted) + right slot (count mono 10 muted) + the optional 24×24 upload button (`border-line-2 rounded-[6px] bg-panel-2`, `arrow-up` 12, `title`/`aria-label` from the caller, `data-tour` `add-panorama` / `add-document`).

- [ ] **Step 5: `ExternalLink`** — `data-tour="external-link"`: the `Panorama tour` link button (`linkButtonClass("secondary")`, `target="_blank" rel="noopener noreferrer"`) only when `isSafeHttpUrl(url)`; with `canEdit` a `TextField` (`label="External tour URL"`, `mono`) + `Save` (loading while `saving`) — port the edit/cancel flow of `external-panorama-control.tsx`.

- [ ] **Step 6: `ViewTab` — failing spec**: the meta `DetailList`; the Panoramas section with `SectionHead` (`Panoramas`, count `2`, upload button when `canUpload`), the calibration `Callout tone="accent"` (`CALIBRATION_LINE` + `<kbd>V</kbd>` + `Exit calibration` button) when `calibrating`, the rows in a `ul[data-tour="panorama-picker"]`, the markers `Switch` row (`data-tour="toggle-markers"`, label `MARKERS_SWITCH`), the external link, then `editor`; the Documents section (`Documents`, `PDF overlays · N`, upload button when `canUpload`, the rows); the footer when given. Gap 16 between sections (View tab gap per the mock). An empty panoramas list still shows the head (so the upload button has a home); an empty documents list likewise.

- [ ] **Step 7: `ViewTab`** — implement; fixture states `idle` (state 3: two panoramas, one uncalibrated, two docs, loading footer), `calibrating` (state 4 callout), `inside` (state 8: active row, inside footer for 2), `editor` (state 9 — with a placeholder `editor` node until Task 12), `guest` (no buttons), `empty`. Measure in Cosmos beside the mock.

- [ ] **Step 8: gate + commit** — `feat(frontend-v2): the View tab — panoramas and documents sections, the markers switch, the external tour link`.

---

### Task 12: the anchor card and the calibration card

**Files:**
- Create under `widgets/view-tab/`: `ui/anchor-card.tsx` + `.spec.tsx`, `ui/calibration-card.tsx` + `.spec.tsx`, `model/degrees.ts` + `.spec.ts`; extend `view-tab.fixture.tsx`

**Interfaces:**
- Produces:
```ts
export type AnchorCardProps = {
  panorama: Panorama;
  index: { current: number; total: number };
  inside: boolean;                       // the camera is in this panorama
  failed: boolean;                       // the image failed to load
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
  saving: boolean;
  canDelete: boolean;
  onSave: (patch: PanoramaUpdate) => void;
  onDelete: () => void;                  // the card confirms first
  onToggleView: () => void;              // Enter panorama view / Switch to 3D view
  onCalibrate: () => void;
  onClose: () => void;
  calibration: CalibrationCardProps | null;
};
export type CalibrationCardProps = {
  opacity: number; onOpacity: (o: number) => void;
  step: number; onStep: (v: number) => void;                    // NUDGE_STEPS values
  position: Vec3; onNudge: (axis: "x" | "y" | "z", delta: number) => void;
  yawOffset: number; onYaw: (rad: number) => void;
  onSave: () => void; onExit: () => void;
};
// degrees.ts
export const radToDeg = (r: number) => ((r * 180) / Math.PI + 360) % 360;   // 0–360, one decimal when printed
export const degToRad = (d: number) => (d * Math.PI) / 180;
export const printDegrees = (r: number) => `${radToDeg(r).toFixed(1)}°`;
```

- [ ] **Step 1: `degrees.ts` + spec** (`printDegrees(Math.PI/2)` → `90.0°`; `radToDeg(-Math.PI/2)` → 270; round trips).

- [ ] **Step 2: `AnchorCard` — failing spec** (mock state 9 strings):
  - overline `Panorama · editing` + mono 10 accent `1 of 2`; `Title` field seeded with the title; `Position` label row with `Set from camera` text button (disabled when `inside`; enabled → reads `cameraPositionRef.current` into the Pos row) and `Vec3Field layout="row"` editable (step 0.05); `Yaw offset` label row with `Set default view` text button (enabled only when `inside`; → reads `cameraYawRef.current`, and a `Default look: 137.5°` readout appears) and a degrees `TextField` (width 96, value `printDegrees(yaw)` without the `°` while typing — keep the number field plain: `type="number" step="0.5"`) plus a `Range` 0–360;
  - `Save anchor` (primary, `data-tour="panorama-save-anchor"`) disabled until any field differs from the panorama; click → `onSave({ title, position, yawOffset, defaultYaw })` with every field; `Delete panorama` (`data-tour="panorama-delete"`, bad text button, only with `canDelete`) → confirm `Delete panorama {title}?` → `onDelete`;
  - the toggle button `Enter panorama view` / `Switch to 3D view` (`data-tour="panorama-view-toggle"`), `Calibrate (overlay)` (`data-tour="panorama-calibrate"`) → `onCalibrate`, a 24×24 close `Close panorama editor` → `onClose`;
  - re-keys on `${id}:${x},${y},${z}` (a prop change after a move-drag reseeds the form — assert by rerendering with a new position and reading the Pos cell);
  - `failed` → a `Callout tone="warn"` "This panorama's image failed to load. Delete it and upload a fresh one." in place of the fields, Delete still drawn;
  - when `calibration` is given, the `CalibrationCard` is rendered below and the anchor fields are hidden (calibration owns the numbers).
  `data-tour` ids: `panorama-set-from-camera`, `panorama-yaw` (on the yaw field's wrapper), `panorama-default-view`.

- [ ] **Step 3: `AnchorCard`** — port the logic of `panorama-edit-panel.tsx` onto `TextField`, `Vec3Field`, `Range`, `Button`, `ConfirmDialog`, `Callout`; the card is `rounded-[10px] border border-accent bg-panel-2 p-3 flex flex-col gap-[11px]`. Split `AnchorFields` (the four rows) into `ui/anchor-fields.tsx` if the file passes 200 lines.

- [ ] **Step 4: `CalibrationCard` — failing spec**: `Photo opacity` label row + mono 10 `65 %` + `Range` 0.15–1 step 0.05 → `onOpacity`; `Anchor nudge` label + `Segmented` (`Fine`/`Med`/`Coarse`, `size="xs"`, `tone="soft"`) → `onStep`; three rows `X` `Y` `Z` each `−` value(`toFixed(3)`) `+` → `onNudge("x", ±step)`; `Yaw` `Range` + degrees; `Save` / `Exit`.

- [ ] **Step 5: `CalibrationCard`** — implement; fixture states `editor` (updated with the real card, `1 of 2`, yaw `137.5°`), `editor-inside` (Set default view enabled, Set from camera disabled), `calibrating` (65 %, Fine active), `failed`.

- [ ] **Step 6: gate + commit** — `feat(frontend-v2): the anchor card and the calibration card`.

---

### Task 13: the uploads — `useFileUpload`, two features, one modal

**Files:**
- Create: `frontend-v2/src/entities/upload/model/use-file-upload.ts` + `.spec.tsx`; export from `entities/upload/index.ts`
- Create: `frontend-v2/src/features/panorama-upload/{index.ts, model/use-panorama-upload.ts + .spec.tsx}`
- Create: `frontend-v2/src/features/document-upload/{index.ts, model/use-document-upload.ts + .spec.tsx}`
- Create: `frontend-v2/src/widgets/upload-modal/{index.ts, ui/upload-modal.tsx + .spec.tsx, ui/upload-file-card.tsx + .spec.tsx, model/copy.ts + .spec.ts, upload-modal.fixture.tsx}`

**Interfaces:**
- Produces:
```ts
// entities/upload
export type FileUploadState =
  | { stage: "idle"; file: null }
  | { stage: "picked"; file: File }
  | { stage: "uploading"; file: File; percent: number; label: string }
  | { stage: "creating"; file: File }
  | { stage: "refused"; file: null; reason: string };
useFileUpload({ sniff: (head: Uint8Array) => boolean, refusal: string, headBytes?: number }) →
  { state, pick(file), clear(), run<T>(work: (blob: FinalizedBlob, file: File) => Promise<T>): Promise<T | null>, cancel() }
  // pick sniffs the first `headBytes` (default 8) → "picked" | "refused"; run() streams through runChunkedUpload with onProgress → "uploading" (percent = bytes/total, label from the caller via a `uploadingLabel` option? no — `label` is `Uploading · 38 %`), then "creating" while `work` runs, then "idle"; cancel() aborts (the gateway DELETE is runChunkedUpload's) and returns to "picked"; a thrown work toasts messageOf and returns null.

// features/panorama-upload
usePanoramaUpload({ slug, sourceBbox: SourceBbox | null, onCreated: (p: Panorama) => void }) →
  { upload: FileUploadState, title, setTitle, useGps, setUseGps, pick, clear, cancel, submit(): Promise<void>, canSubmit }
  // submit: run(async (blob, file) => { const placed = useGps ? await exifScenePosition(file, sourceBbox) : { position: null, reason: "no-gps" }; const p = await createPanorama(slug, { title, sourceBlobHash: blob.hash, position: placed.position ?? undefined, yawOffset: 0 }); notify.success(<one of the three>); onCreated(p); })
  // while EXIF is read the label is "Reading EXIF · {percent} %"? No: EXIF is read after the bytes; the mock's "Reading EXIF · 38 %" is the upload line's wording for a panorama. Wording rule: panorama → `Reading EXIF · N %` during the upload, document → `Uploading · N %`. Pass `uploadingLabel` into useFileUpload.

// features/document-upload
useDocumentUpload({ slug, onCreated }) → { upload, title, setTitle, pick, clear, cancel, submit, canSubmit }

// widgets/upload-modal
export type UploadModalProps = {
  open: boolean; kind: "panorama" | "document"; territoryTitle: string;
  upload: FileUploadState; title: string; onTitle: (s: string) => void;
  gps?: { checked: boolean; onChange: (b: boolean) => void };      // panorama only
  canSubmit: boolean;
  onPick: (files: File[]) => void; onClear: () => void; onSubmit: () => void; onCancelUpload: () => void; onClose: () => void;
};
```

- [ ] **Step 1: `useFileUpload` — failing spec** (`vi.mock("@/entities/upload/model/run-chunked-upload")` — careful: the hook lives in the same slice, so mock `../api/upload-gateway` instead and drive `runChunkedUpload` for real over the mocked gateway, which is what `run-chunked-upload.spec.ts` already does; copy its stubs):
  - `pick(file)` with a head the sniff accepts → `picked`; rejected → `refused` with the reason;
  - `run(work)` → states `uploading` with a percent from the gateway's offsets, then `creating`, then `idle`; resolves with `work`'s value;
  - `cancel()` mid-upload → the gateway's `abortUpload` is called and the state returns to `picked`; `run` resolves null;
  - a `work` that throws → toast + null + `picked`.

- [ ] **Step 2: `useFileUpload`** — `useState<FileUploadState>`, `AbortController` in a ref, `file.slice(0, headBytes).arrayBuffer()` for the sniff, `runChunkedUpload(file, { contentType is file.type — runChunkedUpload already defaults to it; signal, onProgress })`, `uploadingLabel(percent)` option for the line.

- [ ] **Step 3: the two feature hooks — failing specs** (`vi.mock("@/entities/panorama")` / `@/entities/document` for the POSTs and `exifScenePosition`): `submit` posts the right body; the three toasts by `exifScenePosition`'s answer (`Panorama placed from GPS` / `Photo location doesn't match this territory — set position manually` / `Panorama uploaded — set its position manually`); with `useGps` false no EXIF read; `onCreated` gets the created row; `canSubmit` needs a trimmed title and a picked file; the document hook toasts `Document uploaded`.

- [ ] **Step 4: the hooks** — thin: `useFileUpload({ sniff: isEquirectImageSignature, refusal: "Please choose an equirectangular JPG or PNG image.", uploadingLabel: (p) => \`Reading EXIF · ${p} %\` })` / `{ sniff: isPdfSignature, refusal: "Please choose a PDF file.", uploadingLabel: (p) => \`Uploading · ${p} %\` }`, `useState` for the title and the GPS box (default checked), `submit` as above.

- [ ] **Step 5: `UploadModal` — failing spec** (mock states 10/11):
  - `Modal size="sm"` titled `Add a panorama to Refinery Block C` / `Add a document to …`; the close button's title `Close panorama upload` / `Close document upload` (check `Modal` for a close-button slot — it has none: the modal's `title` is a node; put the 26×26 close button into the title node via a flex row, `aria-label` = the title above);
  - idle: `DropZone` (`Drop one equirectangular photo here` / `JPG or PNG · 2:1 ratio · single file` / `Choose file`, `accept=".jpg,.jpeg,.png"`; document: `Drop one PDF here` / `PDF · single file · shown as a viewport overlay`, `.pdf`); `Title` field (placeholder `e.g. Pump house, south wall` / `e.g. Fire safety zones`); the GPS `Checkbox` `Place from the photo's GPS when present` for a panorama only; footer `Cancel` + primary `Upload panorama` / `Upload document` disabled until `canSubmit`;
  - refused: the DropZone stays and the hint line turns bad with the reason (`role="alert"`);
  - picked: an `UploadFileCard` (44×34 thumb with the `panorama`/`file` glyph, mono 11 name, mono 10 muted size `24.6 MB`) with `Replace` → `onClear`;
  - uploading: the card gains a 4 px `ProgressBar variant="thin"` and the mono 10 accent label; the footer becomes `Cancel upload` (bad text button, left) + `Cancel` + disabled primary `Uploading…`; the DropZone is gone; the title field and the checkbox are disabled;
  - creating: as uploading with the primary `Uploading…` and no `Cancel upload`.

- [ ] **Step 6: `UploadModal` + `UploadFileCard` + `copy.ts`** — implement on `Modal`, `DropZone`, `TextField`, `Checkbox`, `Button`, `ProgressBar`; the copy constants in `model/copy.ts` keyed by kind. Fixture: `panorama-idle`, `panorama-uploading` (38 %, `Reading EXIF · 38 %`, title `Pump house, south wall`, checked), `document-idle`, `refused`. Measure beside the mock (520 wide, head 16/18, body 18 gap 14, footer 13/18).

- [ ] **Step 7: gate + commit** — `feat(frontend-v2): the upload modal for panoramas and documents over a shared file-upload hook`.

---

### Task 14: per-panorama visibility — the editor and the `Visible in` block

**Files:**
- Modify: `frontend-v2/src/features/placements-editor/model/use-placements-editor.ts` + `.spec.tsx`
- Create: `frontend-v2/src/widgets/placements-panel/ui/visible-in.tsx` + `.spec.tsx`
- Modify: `frontend-v2/src/widgets/placements-panel/ui/placements-panel.tsx` + `.spec.tsx`, `model/panel-copy.ts` (+spec), `placements-panel.fixture.tsx`, `index.ts`

**Interfaces:**
- Produces:
```ts
usePlacementsEditor({ …, panoramaIds: number[] })   // create() sends visiblePanoramaIds: panoramaIds (spec §6.1)
  .setVisibility(id, panoramaIds: number[]): Promise<void>   // PUT …/visibility, optimistic swap, onChanged
PlacementsPanelProps.visibility: { panoramas: { id: number; title: string }[]; onToggle: (placementId: number, panoramaId: number, visible: boolean) => void } | null
PlacementsPanelProps.canAdd: boolean     // false inside a panorama (B-5): the Add button is not drawn
VisibleIn({ placement: { id; visiblePanoramaIds }, panoramas, pending, onToggle })
VISIBLE_IN = "Visible in"; VISIBLE_IN_NOTE = "Hidden objects stay in the 3D scene; only the panorama markers are dropped.";
```

- [ ] **Step 1: editor — failing spec**: `create` POSTs with `visiblePanoramaIds: [1, 2]` when the hook was given `panoramaIds: [1, 2]` (and `[]` when none); `setVisibility(5, [1])` PUTs through `setPlacementVisibility`, swaps the answered row in, calls `onChanged`, `pendingIds` holds 5 meanwhile; a refused PUT toasts and leaves the row.

- [ ] **Step 2: editor** — add the `panoramaIds` param and `setVisibility` (same shape as `update`); `create` passes `visiblePanoramaIds: panoramaIds`. Every caller (`use-territory-viewer.ts`, specs, fixtures) passes `panoramaIds`.

- [ ] **Step 3: `VisibleIn` — failing spec** (mock state 13): overline `Visible in` (mono 9, 0.16em, uppercase, muted); a `Checkbox` per panorama labelled by its title, checked when the id is in `visiblePanoramaIds`, `text-fg` when checked and `text-muted` when not (`labelClassName`), all disabled while `pending`; change → `onToggle(placementId, panoramaId, next)`; the note line 11/1.5 muted.

- [ ] **Step 4: `VisibleIn`** — `rounded-b-[9px] border-t border-accent-line bg-panel p-[11px] flex flex-col gap-[9px]`.

- [ ] **Step 5: panel — failing spec**: with `visibility` given and an instance selected, the `VisibleIn` block renders directly under that instance's row (inside the group's `ul`); with `visibility: null` nothing; `canAdd: false` draws no Add button even with `grants.create` (the empty state's action too).

- [ ] **Step 6: panel** — wire; fixture state `visible-in` (state 13: no delete grant, the selected row with two checkboxes, the footer `Deleting placements needs the placement:delete grant.` already exists as `NO_DELETE_FOOTER` — check).

- [ ] **Step 7: gate + commit** — `feat(frontend-v2): per-panorama visibility — the editor's PUT and the Visible in block; a new object is visible everywhere`.

---

### Task 15: the page model — pills, rail, chips, props builders, the two composite hooks

**Files:**
- Modify: `pages/territory-viewer/model/viewer-view.ts` + `.spec.ts`, `strip-and-chips.ts` + `.spec.ts`, `viewer-props.ts` + `.spec.ts`, `page-props.ts` + `.spec.ts`
- Create: `pages/territory-viewer/model/page-props-b.ts` + `.spec.ts`, `use-viewer-panoramas.ts` + `.spec.tsx`, `use-viewer-documents.ts` + `.spec.tsx`
- Modify: `use-territory-viewer.ts` + `.spec.tsx`

**Interfaces:**
- Produces (`viewer-view.ts`):
```ts
export const PANORAMA_PILL = "panorama"; EDITING_PILL = "panorama · editing anchor";
export const DOC_OPEN_META = "document overlay open"; DOC_EXPANDED_META = "document overlay expanded";
headerPills(a: { …, view: ViewerView, editing: boolean })     // accent `panorama` when inside; `panorama · editing anchor` when inside AND editing (replaces `panorama`)
export type RailTool = "reset" | "measure" | "add" | "panoramas" | "documents" | "tour";
railTools(a: { …, view: ViewerView, documentOpen: boolean })
  // order: reset, measure, add, panoramas, documents, tour (add only with create)
  // inside a panorama: panoramas active; measure and add inert; reset idle; tour idle
  // documentOpen: documents active
  // !geometry: everything inert EXCEPT panoramas and documents idle (state 6); loading: reset active, others inert EXCEPT panoramas/documents idle (state 3)
```
- (`strip-and-chips.ts`) `modeChip(a: { mode, measure, view, move, calibrating: string | null })` → inside: `{ text: "panorama · drag to look around", kbd: "P" }`; calibrating: `{ text: \`calibrating · ${title}\` }`; move: `{ text: "move points · drag a marker", kbd: "V" }`; else as today.
- (`viewer-props.ts`) `ViewerOverlaysProps` gains `onPanoramas`, `onDocuments`, `switchTo3d: (() => void) | null` (the secondary button under the chip, state 8), `document: DocumentWindowProps | null`, `collapsedPill: { name: string; onShow: () => void } | null`; `ViewerHeaderProps.meta` now carries the document meta; `ViewerPanelProps` gains `viewTab: ViewTabProps` (replacing `details`) and `placements.visibility`, `placements.canAdd`, and `scrolled: boolean` is the panel's own; `TerritoryViewerPageProps` gains `upload: UploadModalProps | null`, `panoramaTour: Tour`; `PageParts` gains `panoramas: PanoramaParts`, `documents: DocumentParts` (the two composite hooks' outputs); `PageHandlers` gains the new callbacks.
- (`page-props-b.ts`) `viewTabProps(p: PageParts): ViewTabProps`, `panoramaCanvasProps(p): Pick<ViewerCanvasProps, the Task 8 fields>`, `documentProps(p): { window, pill, meta }`, `markerLabels(groups): Record<number, string>` (via `instanceName`).
- (`use-viewer-panoramas.ts`) `useViewerPanoramas({ slug, initial, mode, grants, sourceBbox, onChanged, decode })` composes `usePanoramaList`, `usePanoramaView`, `usePanoramaCalibration` (onSave → `list.update`), `usePanoramaDrag` (onCommit → `list.update(id, { position })`), `usePanoramaTexture(active?.sourceBlobHash ?? null, decode)`, `useMarkerSwitch`, `useTerritoryLink`, `usePanoramaUpload` (onCreated → `list.add`), the two camera refs, and `uploadOpen` state → one `PanoramaParts` object.
- (`use-viewer-documents.ts`) `useViewerDocuments({ slug, initial, grants, onChanged, onOpen })` composes `useDocumentList`, `useDocumentView`, `usePipWindow`, `useDocumentUpload`, `uploadOpen` → `DocumentParts`.

- [ ] **Step 1: pure tables first — failing specs** for `headerPills` (inside → `panorama`; inside+editing → `panorama · editing anchor`; scene+editing → nothing extra), `railTools` (the six orders and states above as a table: scene/idle; inside; document open; no geometry; loading; guest), `modeChip` (the three new lines), `markerLabels` (two instances of one model → `#1`, `#2`).

- [ ] **Step 2: implement the tables** — keep each function's doc comment current; `viewer-view.ts` may need `errorCopy` moved to `error-copy.ts` to stay under the cap.

- [ ] **Step 3: `page-props-b.ts` — failing spec**: `viewTabProps` builds rows (`thumbUrl` = `assetUrl(hash)`, `active` by `view`, `calibrated` by `isCalibrated`, `canEdit` by `grants.panoramaWrite`, `editing` by `editingPanoramaId`), `calibrating` from the calibration hook, `footer` = `LOADING_FOOTER` while a level loads, `insideFooter(n)` inside a panorama (n = placements visible in it), else null; `editor` = an `AnchorCard` element when `editing` (the page builds the element here — the builder may import the widget); `documentProps` gives the window props in `pip`/`expanded`, the pill in `collapsed`, and the header meta; `panoramaCanvasProps` passes `effective ?? active` as `activePanorama`, `opacity` only while calibrating (1 otherwise).

- [ ] **Step 4: implement `page-props-b.ts`** and fold its results into `pageProps` (`page-props.ts`: `canvas: { …existing, ...panoramaCanvasProps(p) }`, `overlays: { …, onPanoramas, onDocuments, switchTo3d, document, collapsedPill }`, `panel: { …, viewTab: viewTabProps(p), placements: { …, visibility, canAdd: p.mode.view.kind === "scene" } }`, `upload`, `panoramaTour`). `page-props.ts` must stay under 200: move `selectedBlock` and `detailsOf` into `page-props-selected.ts` if needed. Header meta inside a panorama drops vertices/faces from `detailsOf` (state 8) — `detailsOf(slug, vm, inside)`.

- [ ] **Step 5: the two composite hooks — failing specs** (mock every feature hook with `vi.mock`; assert the wiring): `useViewerPanoramas` — `activate` enters the panorama and starts editing; a drag commit updates the list with the position; `calibration.save` updates with position+yaw; the upload's `onCreated` appends and closes the modal; the texture hook is called with the active hash and the injected decoder; the link hook gets the territory's url. `useViewerDocuments` — `open` calls `onOpen` (exitPanorama) and opens pip; delete removes and closes; the upload appends and closes.

- [ ] **Step 6: implement the two hooks**, then wire `use-territory-viewer.ts`:
  - grants gain `panoramaCreate`, `panoramaWrite`, `panoramaDelete`, `documentWrite`, `documentDelete`, `territoryWrite` (= `replace`);
  - `useViewerMode` gets `canMovePoints: grants.panoramaWrite`, `onCycle: panoramas.view.cycle`, `beforeEscape: documents.view.escape` — `onCycle` needs the hook created after `mode`; break the cycle with a ref (`cycleRef.current = panoramas.view.cycle` in an effect; `onCycle: () => cycleRef.current()`);
  - the editor gets `panoramaIds: panoramas.list.panoramas.map((p) => p.id)`;
  - `onPanoramas`: `panel.setTab("view"); panel.setCollapsed(false); scrollTo("panoramas")` — the scroll is a page concern: expose `panel.reveal(section)` from `useOverlaysPanel`? Simplest: `ViewTab` sections carry ids `view-tab-panoramas` / `view-tab-documents`; the handler does `document.getElementById(id)?.scrollIntoView({ block: "start" })` after a `requestAnimationFrame` (the tab may be mounting). Put that in `pages/territory-viewer/model/reveal-section.ts` with a spec (a stubbed `getElementById`).
  - `onDocuments`: the same with `documents`; when a document is open, `documents` tile click → `setWindow("pip")` if collapsed.
  - the panorama tour (Task 17) is wired here too: `useTour(PANORAMA_TOUR, PANORAMA_TOUR_STEPS, { seen: me.onboardingToursSeen.includes("panorama"), ready: inside && !viewerTour.active })` — leave the import for Task 17 but reserve the field `panoramaTour` on `PageParts` now with the viewer tour's shape.
  - `useTerritoryViewer` must stay under 200 lines: its `on:` object moves to `use-page-handlers.ts` (a hook that memoizes every callback from the hooks it is given) if needed.

- [ ] **Step 7: gate + commit** — `feat(frontend-v2): the viewer page model knows panoramas and documents — pills, rail, chips, the props builders and two composite hooks`.

---

### Task 16: the page UI — tiles, header, the scrolled strip, composition, fixtures 8–13

**Files:**
- Modify: `pages/territory-viewer/ui/viewer-overlays.tsx` + `.spec.tsx`, `viewer-header.tsx` (+spec if its props changed), `territory-viewer-page.tsx` + `.spec.tsx`, `territory-viewer-page.fixture.tsx`
- Modify: `widgets/overlays-panel/ui/overlays-panel.tsx` + `.spec.tsx` (the scrolled strip), `overlays-panel.fixture.tsx`
- Modify: `shared/ui/tool-rail/tool-rail.fixture.tsx` if the tile order changed

- [ ] **Step 1: `ViewerOverlays` — failing spec**: the six tiles in order with `◎ Panoramas` (`data-tour="panoramas"`? no anchor in the tour — none) and `▤ Documents`, `toggle: true` on both (they are modes); `switchTo3d` draws the secondary `Switch to 3D view` button under the chip; `document` draws `<DocumentWindow>`; `collapsedPill` draws the pill beside the strip (`absolute left-[…] bottom-3.5` — right of the stats strip: wrap the strip and the pill in one flex row); the keycap hints keep their rule (`hints` from the page); the chip shows `kbd` `P`/`V`.

- [ ] **Step 2: implement** — `TILES` gains `panoramas: { glyph: "◎", name: "Panoramas", toggle: true }`, `documents: { glyph: "▤", name: "Documents", toggle: true }`; handlers map; the mock's `Switch to 3D view` button (`radius 8, padding 6/12, Archivo 12, shadow` → `Button size="sm"` + `shadow-elevation`).

- [ ] **Step 3: `OverlaysPanel` scrolled strip — failing spec**: after the body scrolls (`fireEvent.scroll(body, { target: { scrollTop: 40 } })`) a strip `scrolled · metadata above` (mono 9, 0.14em, uppercase, dim, chevron-up 11 — add glyph `chevron-up` if absent) appears under the tabs; at 0 it is gone. Implement with `onScroll` + `useState`.

- [ ] **Step 4: `TerritoryViewerPage`** — `view={<ViewTab {...panel.viewTab} />}`; `<UploadModal {...upload} />` when `upload`; `<TourOverlay tour={panoramaTour} />` beside the viewer tour's (only one is ever active); the document window and pill come through `ViewerOverlays`. Spec: renders the View tab, the upload modal when given, both tour overlays.

- [ ] **Step 5: fixtures** — `territory-viewer-page.fixture.tsx` gains states built through `viewerState(edit)`: `8-panorama` (inside `Control room, north door`, two markers labelled `storage-tank-500 #1` / `valve-assembly #4` — the canvas is not rendered in Cosmos, so the labels show through the View tab's inside footer `Two placements fall …`), `9-panorama-edit` (editing, `1 of 2`, yaw `137.5°`, calibration callout and card, scrolled strip), `10-upload-panorama` (modal idle) + `10b-uploading`, `11-upload-document`, `12-document-pip` / `12-collapsed` / `12-expanded`, `13-visible-in` (write, no delete). The fixture file is already large: split the B states into `territory-viewer-page-b.fixture.tsx` (same `viewerState` helper exported from a `fixture-parts.ts`). Restart Cosmos (`pkill -f 'node_modules/.bin/cosmos'`, `yarn cosmos` in the background) after adding the file. Screenshot every state in both themes beside the mock; measure the PiP (560×400, right 14, bottom 58), the pill, the header pills.

- [ ] **Step 6: gate + commit** — `feat(frontend-v2): the viewer page draws panoramas and documents — six tiles, the scrolled strip, the window, the modals, mock states 8–13`.

---

### Task 17: the tours — fifteen viewer steps and the nine-step panorama tour

**Files:**
- Modify: `features/onboarding/model/viewer-tour-steps.ts` + `.spec.ts`
- Create: `features/onboarding/model/panorama-tour-steps.ts` + `.spec.ts`; export from `features/onboarding/index.ts`
- Modify: `pages/territory-viewer/model/use-territory-viewer.ts` (+spec) — the second `useTour`

- [ ] **Step 1: failing specs**: `VIEWER_TOUR_STEPS` has 15 ids in this exact order: `intro, catalog-link, reset-camera, measure, overlays-tabs, panorama-picker, toggle-markers, panorama-marker, move-points, external-link, add-panorama, add-document, add-object, objects-list, shortcuts`; the `view`-tab steps carry `tab: "view"`, the placements ones `tab: "placements"`; `PANORAMA_TOUR = "panorama"`, `PANORAMA_TOUR_STEPS` has the nine ids `panorama-intro, panorama-view-toggle, panorama-picker, panorama-set-from-camera, panorama-yaw, panorama-default-view, panorama-save-anchor, panorama-calibrate, panorama-delete` with `tab: "view"` on all but the intro; no two steps share an id within a list; every non-centred id has a `data-tour` in the widgets (grep assertion in the spec: read the source files? no — keep the spec to the list; the runtime skips a missing anchor).

- [ ] **Step 2: the lists** — copy the bodies from `frontend/src/onboarding/domain/viewer-tour-steps.ts` and `panorama-tour-steps.ts` (quoted in `recon-b.md` §3.6 and above in this session's recon), minus `user-menu`; the `overlays-tabs` body reads "Everything you can add to the scene lives here. View holds panoramas and documents; Placements holds the models placed on it."; `shortcuts` reads "M measure · P next panorama · V move panorama points · T move · R rotate · S scale · G snap to surface · Esc step back out. Reopen this tour any time with the ▶ button."; `move-points` targets the calibration callout? No — it targets the markers `Switch` row? The old anchor was the "Move points" button; in B move is entered with `V` or … there is no button in the mock. Add a text button `Move points` + kbd `V` next to the markers switch in `ViewTab` (`data-tour="move-points"`, `panorama:write`) — record it in the report as the mock gap it fills (the spec's §4 lists `V` only in the callout). Update the `viewer-tour-steps.ts` head comment.

- [ ] **Step 3: wiring** — the second tour in `use-territory-viewer.ts` (Task 15 reserved the field); `ready: mode.state.view.kind === "panorama" && !tour.active && me.data !== undefined`; `panel` takes `forcedTab` from whichever tour is active. Spec: entering a panorama the first time starts the panorama tour; a seen flag prevents it.

- [ ] **Step 4: gate + commit** — `feat(frontend-v2): the viewer tour is fifteen steps again, and the panorama tour starts on the first step inside`.

---

### Task 18: the live pass, the docs

**Files:**
- Modify: `.superpowers/sdd/2026-09-10-territory-viewer-v2/live.py` (section 7 `panoramas and documents`), `frontend-v2/CLAUDE.md` ("The territory viewer" section: panoramas, documents, the keys, the exemption), root `CLAUDE.md` (the "Two frontends" paragraph: nothing remains in `frontend/`), `frontend-v2/README.md` (the slice table)
- Modify: `docs/superpowers/specs/2026-09-14-territory-viewer-v2-package-b-design.md` §6 with anything the implementation had to deviate on (the `Move points` button from Task 17 at least)

- [ ] **Step 1: the live section** (`live.py`, admin on `dji-wp46-cut`, then `guest1`, `editor1`; helpers `ok`, `api`, `mutations`, `shot` exist):
  1. generate two 4096×2048 JPGs in the workspace with Pillow (`pip show pillow` — install if absent): `pano-gps.jpg` with EXIF GPS inside the territory's bbox (read `bboxMin/Max` from `/scene`; the bbox is in source units = UTM metres, y up, z = −northing; pick the centre, convert back to lat/lon with a UTM inverse — or, simpler and honest, take the mock's absence of a real GPS fixture: use a lat/lon that projects into the box: for zone 31 central meridian 3°E and the equator the easting is 500000 — only if the territory's bbox is near that. Read the bbox first; if its easting is not near a zone's projection, skip the inside-GPS case and record it), `pano-nogps.jpg` without EXIF;
  2. `◎` tile → the View tab opens on Panoramas; upload button → modal; drop `pano-nogps.jpg`, title `Live pano`, submit → `POST …/panoramas` once, toast `Panorama uploaded — set its position manually`, a row `Live pano` with `not calibrated yet`;
  3. `Edit` → the card; `Set from camera` → Pos cells change; type yaw `90`; `Save anchor` → exactly one `PUT …/panoramas/{id}` whose body has all four fields; the row loses `not calibrated yet`;
  4. `Show in this panorama` → header pill `panorama`, chip `panorama · drag to look around`, `◎` active, `↔` and `＋` inert; read the camera position through a `window.__viewerCamera`? No — the canvas is a boundary. Measure through the page: drag the canvas 200 px and confirm the stats strip and the chip are unchanged, and that `/api/assets/{hash}` of the panorama was requested once; `P` → 3D (one panorama); `Switch to 3D view` button present inside;
  5. `Calibrate (overlay)` inside → the callout `Drag panorama points on the model [V]`, opacity `50 %`; nudge X `+` once with Fine → `Save` → one PUT with `position.x` moved by 0.005;
  6. 3D view: `V` → chip `move points · drag a marker`; drag the marker button by 40 px onto the mesh → one PUT with a changed position; `Esc` leaves move;
  7. Placements tab with an object selected inside the panorama: `Visible in` checkbox `Live pano` unchecked → `PUT …/placements/{id}/visibility` with `[]`; the marker `… #N` disappears from the scene's markers (count the `[aria-label^="Open panorama"]`? No — that is the anchor marker. Count the viewport marker labels by their text); re-check → `[id]`;
  8. `▤` → Documents; upload a PDF (generate a one-page PDF with Pillow or write the minimal PDF bytes by hand) → `POST …/documents`, toast `Document uploaded`; `Open` → the dialog named by the file, `/pdfjs/web/viewer.html?file=…` answers 200 and the asset request goes out; `Expand` → header meta `document overlay expanded`; `Restore`; `Hide` → the pill; `Show`; `Esc` → closed; `Delete` → confirm → `DELETE …/documents/{id}`;
  9. `Delete panorama` → confirm → `DELETE …/panoramas/{id}`;
  10. `guest1`: no upload buttons, no `Edit`, no `Visible in`, the rows and `Show in this panorama` present; `editor1` (no `panorama:*`): the same plus `Visible in`;
  11. the panorama tour: as admin, `POST /api/auth/me/onboarding/panorama` is sent once after the first entry (reset the seen flag first through the gateway if it is already set — read `/me`; if `panorama` is already in `onboardingToursSeen`, say so and skip);
  12. every created row deleted; `[22, 23]` byte-identical.
  Print one line per check; screenshots per state in both themes.

- [ ] **Step 2: run it** (`python3 live.py` with `:3001` and the gateway up), paste the output in the report, fix what it finds (small fixes in this task; anything larger goes to the ledger as a finding for the final review).

- [ ] **Step 3: docs** — `frontend-v2/CLAUDE.md`: a "Panoramas and documents" subsection under "The territory viewer": the reducer's `view`/`move`/`editingPanoramaId`, `P`/`V`, the rig's recentre and why (no parallax), the sphere's no-op raycast, the texture decoder injection and the one exemption, the PUT-is-a-replace rule for panoramas, visibility (`create` visible everywhere), pdf.js in `public/pdfjs` and the iframe kept mounted while hidden, the upload modals over `useFileUpload`, the two tours, the `Move points` button. Root `CLAUDE.md`: "Only panoramas and documents remain in `frontend/`, until package B" → "the whole viewer is v2 now; `frontend/` is the production app until the switch". `README.md`: the new slices.

- [ ] **Step 4: gate + commit** — `docs(frontend-v2): package B — the viewer's panoramas and documents, the live pass`.

---

## Self-review

- **Spec coverage**: §1 route/modes/keys → Tasks 5, 15, 16; §2 entities → 3, 4; features → 6, 9, 11, 13; tours → 17; §3 three → 7, 8; §4 View tab → 11, 12; modals → 13; window → 2, 10; Visible in → 14; `shared/ui` → 1, 2; header/rail/chips → 15, 16; §5 gate/live → every task + 18; §6 deviations → recorded in the spec, 18 adds any new one; §7 untouched.
- **Placeholders**: none — every step names its file, its strings and its assertions; the two open measurements (the GPS fixture's projection, the renderer's camera accessor) are called out with the honest fallback.
- **Type consistency**: `ViewerView`/`move`/`editingPanoramaId` (5) are what 6, 8, 15 read; `PanoramaUpdate` (3) is what 6's `update` and 12's `onSave` send; `FileUploadState` (13) is what the modal draws; `DocumentWindowMode` (9) is what 10 and 15 use; `PipGeometry` (9) is `ViewportWindow.geometry` (2); `TextureDecoder` (6) is `decodeImageBitmap` (7); `RailTool` (15) is `TILES`' key (16); `ViewTabProps` (11) is `viewTabProps`'s return (15).
