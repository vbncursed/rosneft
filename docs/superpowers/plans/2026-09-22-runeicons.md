# Runeicons Across the Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every UI icon in the SPA is drawn from the runeicons outline set (Lucide for its gaps) at one 24-grid, 1.75 stroke, and every icon-like text character becomes an `<Icon>`.

**Architecture:** The existing `shared/ui/icon` component keeps its API and semantic names; its `GLYPHS` data is replaced by vendored path bodies, the per-glyph `box`/`width` fields go, and `Icon` draws every glyph with uniform attributes. Five call sites that print characters (tool rail tiles, measurement chip, dropdown marker, a tour sentence) switch to the component.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Vitest + Testing Library, Cosmos, yarn.

**Spec:** `docs/superpowers/specs/2026-09-22-runeicons-design.md` — read it; its Mapping tables are the source of truth for which drawing each name gets.

## Global Constraints

- yarn only, never npm. `yarn lint` (= `tsc -b --noEmit && oxlint`) is the type check; bare `tsc --noEmit` checks nothing.
- 200-line cap per source file (`frontend/CLAUDE.md`).
- Every icon: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`, round caps and joins.
- Sources: runeicons `public/normal/<path>.svg` at `github.com/Nexvyn/runeicons` (Apache-2.0); Lucide `lucide-static/icons/<name>.svg` via `cdn.jsdelivr.net/npm/lucide-static` (ISC). No new npm dependency.
- Semantic `IconName`s stay; only drawings change (spec D6). New names: `reset`, `documents`, `help`.
- A parallel session may work in `backend/`; the tree has unrelated uncommitted changes. Stage by path; never `git stash`/`checkout`/`reset`/`restore`/`add -A`; kill only processes you started.
- Branch `dev`. Commit trailers: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Crszk1NsyQ3HXF1GqCr7kp`.

---

### Task 1: Vendor the drawings and simplify `Icon`

**Files:**
- Modify: `frontend/src/shared/ui/icon/glyphs.tsx`, `frontend/src/shared/ui/icon/glyph-extras.tsx`, `frontend/src/shared/ui/icon/icon.tsx`
- Modify: `frontend/src/shared/ui/icon/glyphs.spec.ts`, `glyph-extras.spec.ts`, `icon.spec.tsx`
- Create: `frontend/src/shared/ui/icon/NOTICE`
- Keep: `icon.fixture.tsx` (iterates `ICON_NAMES`; shows the new set unchanged), `index.ts`

**Interfaces:**
- Produces: `GLYPHS: Record<IconName, { body: ReactNode }>` (no `box`, no `width`), `IconName` = the 35 existing names + `reset`, `documents`, `help`; `ICON_NAMES`; `Icon({ name, size = 20, title, ...rest })` unchanged. `rest` is spread **after** the uniform attributes, so `model-viewport.tsx`'s `strokeWidth={0.7}` override keeps working.

- [ ] **Step 1: Fetch the sources into the scratchpad**

```bash
OUT=/private/tmp/claude-501/-Users-vbncursed-programming-rosneft/04d993ad-ec52-434e-9ed2-96a16aa3b8ad/scratchpad/icons-src
mkdir -p "$OUT"
for p in tools/pencil tools/trash-2 indicators/check documents/box senses/eye senses/eye-off identity/lock \
  identity/fingerprint-pattern indicators/plus schedule/refresh-cw schedule/calendar arrows/arrow-down-to-line \
  arrows/arrow-up-from-line nature/moon nature/sun indicators/triangle-alert tools/search indicators/info \
  indicators/minus layouts/layout-grid arrows/arrow-right arrows/arrow-up arrows/chevron-left arrows/chevron-right \
  arrows/chevron-up playback/camera documents/file layouts/grip-horizontal indicators/x arrows/rotate-ccw \
  documents/file-text indicators/circle-question-mark; do
  gh api "repos/Nexvyn/runeicons/contents/public/normal/$p.svg" --jq .content | base64 -d > "$OUT/r-$(basename $p).svg"
done
for n in magnet ruler ellipsis-vertical list maximize minimize; do
  curl -sf "https://cdn.jsdelivr.net/npm/lucide-static/icons/$n.svg" -o "$OUT/l-$n.svg"
done
gh api repos/Nexvyn/runeicons/contents/LICENSE --jq .content | base64 -d > "$OUT/runeicons-LICENSE"
curl -sf https://cdn.jsdelivr.net/npm/lucide-static/LICENSE -o "$OUT/lucide-LICENSE"
ls "$OUT" | wc -l   # expect 40
```

Expected: 32 `r-*.svg`, 6 `l-*.svg`, 2 licences. Check whether runeicons ships a `NOTICE` file (`gh api repos/Nexvyn/runeicons/contents/NOTICE`); if it does, its text must be carried into ours (Apache-2.0 §4d).

- [ ] **Step 2: Write the failing tests**

`glyphs.spec.ts` — replace the name list and the box/width tests:

```ts
import { describe, expect, it } from "vitest";
import { GLYPHS, ICON_NAMES } from "./glyphs";

describe("the glyph registry", () => {
  it("lists every glyph exactly once", () => {
    expect(ICON_NAMES).toHaveLength(Object.keys(GLYPHS).length);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it("carries every name the app draws", () => {
    expect([...ICON_NAMES].sort()).toEqual([
      "arrow-right", "arrow-up", "calendar", "check", "chevron-left", "chevron-right", "chevron-up",
      "close", "cube", "documents", "download", "eye", "eye-off", "file", "grid", "grip", "help",
      "info", "kebab", "list", "lock", "magnet", "maximize", "minimize", "minus", "moon", "panorama",
      "passkey", "pencil", "plus", "refresh", "reset", "ruler", "search", "sun", "trash", "upload",
      "warning",
    ]);
  });

  it("gives every glyph a body and nothing else — grid and stroke are the component's", () => {
    for (const name of ICON_NAMES) {
      expect(Object.keys(GLYPHS[name])).toEqual(["body"]);
      expect(GLYPHS[name].body).toBeTruthy();
    }
  });
});
```

`glyph-extras.spec.ts` — its box/width/stroke assertions describe the old design-system drawings; replace the file's body with one check that every extra is part of the registry:

```ts
import { describe, expect, it } from "vitest";
import { EXTRA_GLYPHS } from "./glyph-extras";
import { GLYPHS } from "./glyphs";

describe("glyph extras", () => {
  it("are spread into the registry unchanged", () => {
    for (const name of Object.keys(EXTRA_GLYPHS) as (keyof typeof EXTRA_GLYPHS)[]) {
      expect(GLYPHS[name]).toBe(EXTRA_GLYPHS[name]);
    }
  });
});
```

`icon.spec.tsx` — replace "draws kebab filled and the stroke glyphs stroked" with:

```tsx
  it("draws every glyph on one 24 grid at one 1.75 stroke", () => {
    for (const name of ICON_NAMES) {
      const svg = render(<Icon name={name} />).container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("1.75");
    }
  });

  it("lets a caller override the stroke", () => {
    const svg = render(<Icon name="cube" strokeWidth={0.7} />).container.querySelector("svg")!;
    expect(svg.getAttribute("stroke-width")).toBe("0.7");
  });
```

and add `"reset", "documents", "help"` to the `it.each` list. Keep the aria tests.

- [ ] **Step 3: Run, expect FAIL**: `cd frontend && yarn vitest run src/shared/ui/icon` — the name list, the `["body"]` keys and the 1.75 stroke fail.

- [ ] **Step 4: Implement**

`icon.tsx`:

```tsx
import type { SVGProps } from "react";
import { GLYPHS, type IconName } from "./glyphs";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  /** Names the icon for assistive tech. Omit it and the icon is decorative. */
  title?: string;
};

// Every glyph is a runeicons / Lucide outline on the same 24 grid, so the grid
// and the stroke live here, once — see ./NOTICE for where each drawing is from.
export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {GLYPHS[name].body}
    </svg>
  );
}
```

`glyphs.tsx` / `glyph-extras.tsx`: each entry becomes `name: { body: <>…</> }` (or a single element), the body being the source SVG's child elements with `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `fill` and colour attributes removed and attribute names camelCased for JSX. Names map to files exactly as the spec's Mapping tables say (`r-` = runeicons, `l-` = Lucide). Keep the existing split (extras file spread into `GLYPHS`) and keep both files under 200 lines — balance entries between them by size, not by library. Replace the header comment of `glyphs.tsx` ("Paths lifted verbatim from the design system's Icons section…") with:

```ts
// Outline drawings from runeicons (Apache-2.0), the gaps from Lucide (ISC) —
// ./NOTICE lists which is which. Only the bodies live here: the 24 grid and the
// 1.75 stroke are the Icon component's, so every glyph is drawn alike. Names
// say what an icon means in this app (`cube`, `passkey`), not what the library
// calls it (`box`, `fingerprint-pattern`).
```

`NOTICE`:

```
Icons in this directory are adapted from two open-source sets. Only the path
data is used; stroke, grid and colour are applied by icon.tsx.

Rune Icons — https://github.com/Nexvyn/runeicons
Copyright Nexvyn. Licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0). Modified: attributes stripped,
stroke width changed to 1.75.
  arrow-right, arrow-up, calendar, check, chevron-left, chevron-right,
  chevron-up, close (x), cube (box), documents (file-text), download
  (arrow-down-to-line), eye, eye-off, file, grid (layout-grid), grip
  (grip-horizontal), help (circle-question-mark), info, lock, minus, moon,
  panorama (camera), passkey (fingerprint-pattern), pencil, plus, refresh
  (refresh-cw), reset (rotate-ccw), search, sun, trash (trash-2), upload
  (arrow-up-from-line), warning (triangle-alert)

Lucide — https://lucide.dev
Copyright (c) Lucide Contributors. Licensed under the ISC License.
  kebab (ellipsis-vertical), list, magnet, maximize, minimize, ruler
```

Then append the full text of both licences fetched in Step 1 (and runeicons' NOTICE if it has one).

- [ ] **Step 5: Run tests + lint**: `cd frontend && yarn vitest run src/shared/ui/icon && yarn lint` — PASS. Then the full suite `yarn vitest run`: any other spec that asserted an old drawing detail (e.g. a `stroke-width` of a specific icon) fails here — fix the assertion to the new uniform values, do not restore old drawings.

- [ ] **Step 6: Visual check** — skip Cosmos (it shares `node_modules/.vite/deps` with `yarn dev`, see `frontend/CLAUDE.md`). Run `yarn dev --port 3000` against the local stack, open pages dense with icons (catalog, account, a territory viewer) and screenshot both themes at 1280×800. Look for clipped glyphs, misaligned optical centres inside buttons, and anything that reads heavier/lighter than its neighbours. Save to `scratchpad/icons-t1/`.

- [ ] **Step 7: Coverage + commit**

```bash
cd frontend && yarn test:coverage
git add frontend/src/shared/ui/icon/glyphs.tsx frontend/src/shared/ui/icon/glyph-extras.tsx \
  frontend/src/shared/ui/icon/icon.tsx frontend/src/shared/ui/icon/glyphs.spec.ts \
  frontend/src/shared/ui/icon/glyph-extras.spec.ts frontend/src/shared/ui/icon/icon.spec.tsx \
  frontend/src/shared/ui/icon/NOTICE
# plus any spec fixed in Step 5, by path
git commit -m "feat(frontend): icons are runeicons outlines at one 24 grid and 1.75 stroke"
```

---

### Task 2: Replace the icon-like characters

**Files:**
- Modify: `frontend/src/pages/territory-viewer/ui/viewer-overlays.tsx` (`TILES`, lines ~25-31, and where `glyph` is rendered)
- Modify: `frontend/src/shared/ui/tool-rail/tool-rail.fixture.tsx`, `frontend/src/shared/ui/tool-rail/tool-rail.spec.tsx`
- Modify: `frontend/src/widgets/viewer-canvas/three/measurement-segment.tsx` (~line 100), `measurement-segment.spec.tsx` (~line 60)
- Modify: `frontend/src/shared/ui/dropdown/dropdown.tsx` (~line 149) and its spec
- Modify: `frontend/src/features/onboarding/model/viewer-tour-steps.ts` (`shortcuts` body) and its spec if it pins the text
- Test: `frontend/src/pages/territory-viewer/ui/viewer-overlays.spec.tsx`

**Interfaces:**
- Consumes: `Icon`, `IconName` incl. `reset`, `documents`, `help` (Task 1).
- `ToolRailItem.glyph: ReactNode` is unchanged — pass `<Icon name=… size={15} />`.

- [ ] **Step 1: Failing tests**
  - `viewer-overlays.spec.tsx`: each rail tile contains an `<svg>` and no text node among `↺ ↔ ＋ ◎ ▤ ▶`:
    ```tsx
    it("draws every rail tile with an icon, not a character", () => {
      renderOverlays(); // the file's existing render helper
      const rail = screen.getByRole("toolbar", { name: "Viewer tools" });
      for (const button of rail.querySelectorAll("button")) {
        expect(button.querySelector("svg")).not.toBeNull();
        expect(button.textContent).not.toMatch(/[↺↔＋◎▤▶]/);
      }
    });
    ```
    (Use the spec's existing helper/props for rendering; name it as the file does.)
  - `measurement-segment.spec.tsx`: the removable chip contains an `svg` and no `×` text; the non-removable chip has neither (adapt the existing `queryByText("×")` assertion at ~line 60).
  - dropdown spec: the selected option's marker is an `svg`; an unselected option's marker is an empty element of the same width class; neither contains `●`/`○`.
  - `viewer-tour-steps.spec.ts` (if the text is pinned): body ends "…with the ? button."
- [ ] **Step 2: Run, expect FAIL**: `cd frontend && yarn vitest run src/pages/territory-viewer src/shared/ui/tool-rail src/widgets/viewer-canvas src/shared/ui/dropdown src/features/onboarding`
- [ ] **Step 3: Implement**

`viewer-overlays.tsx`:

```tsx
const TILES: Record<RailTool, { icon: IconName; name: string; toggle?: boolean; dataTour?: string }> = {
  reset: { icon: "reset", name: "Reset camera", dataTour: "reset-camera" },
  measure: { icon: "ruler", name: "Measure (M)", toggle: true, dataTour: "measure" },
  add: { icon: "plus", name: "Add objects", toggle: true, dataTour: "add-object" },
  panoramas: { icon: "panorama", name: "Panoramas", toggle: true, dataTour: "panoramas" },
  documents: { icon: "documents", name: "Documents", toggle: true, dataTour: "documents" },
  tour: { icon: "help", name: "Replay guided tour" },
};
```

and where tiles become `ToolRailItem`s: `glyph: <Icon name={tile.icon} size={15} />`. Update the comment above `TILES` ("The mock's glyph…") to "The tile's icon, name and tour anchor…".

`tool-rail.fixture.tsx` / `tool-rail.spec.tsx`: same icons (`<Icon name="reset" size={15} />` etc.); the spec's assertions on names/states stay.

`measurement-segment.tsx`: `<span aria-hidden="true">×</span>` → `<Icon name="close" size={11} />` (decorative by default; the button keeps its `title`).

`dropdown.tsx`:

```tsx
<span aria-hidden="true" className="flex w-3 justify-center text-accent">
  {isSelected ? <Icon name="check" size={12} /> : null}
</span>
```

`viewer-tour-steps.ts` `shortcuts` body: `…Reopen this tour any time with the ▶ button.` → `…Reopen this tour any time with the ? button.`

- [ ] **Step 4: Tests + lint**: the Step 2 command, then `yarn lint`.
- [ ] **Step 5: Live check** (local compose stack, `yarn dev --port 3000`, root `admin`/`change-me-now`, `dji-wp46-cut`): screenshot the tool rail in both themes (each tile idle, one active), the measurement chip in measure mode, a dropdown with a selected option, and the tour's shortcuts step. Tiles: icon optically centred in the 30 px tile, same visual weight across the six. Save to `scratchpad/icons-t2/`. Kill only your dev server.
- [ ] **Step 6: Coverage + commit**

```bash
cd frontend && yarn test:coverage
git add frontend/src/pages/territory-viewer/ui/viewer-overlays.tsx frontend/src/pages/territory-viewer/ui/viewer-overlays.spec.tsx \
  frontend/src/shared/ui/tool-rail/tool-rail.fixture.tsx frontend/src/shared/ui/tool-rail/tool-rail.spec.tsx \
  frontend/src/widgets/viewer-canvas/three/measurement-segment.tsx frontend/src/widgets/viewer-canvas/three/measurement-segment.spec.tsx \
  frontend/src/shared/ui/dropdown/dropdown.tsx frontend/src/features/onboarding/model/viewer-tour-steps.ts
# plus the dropdown / tour-steps specs you changed, by path
git commit -m "feat(frontend): tool rail, measurement chip and dropdown draw icons, not characters"
```

---

### Task 3: Record the decision and verify the whole app

**Files:**
- Modify: `frontend/CLAUDE.md` (one paragraph near "Source of truth", ~line 287)

**Interfaces:** none.

- [ ] **Step 1: Docs** — add under the design-system source-of-truth section:

```markdown
**Icons do not follow `Design System.dc.html` § Icons (since 2026-09-22).** Every
glyph in `shared/ui/icon` is a runeicons outline (Apache-2.0), the six it lacks
from Lucide (ISC), all on one 24 grid at stroke 1.75 applied by `Icon` — the
glyph files hold path bodies only. Adding one: take the runeicons
`public/normal/` SVG (Lucide only if runeicons has none), strip its stroke/fill
attributes, add it under a name that says what it means here, and list it in
`shared/ui/icon/NOTICE`. Spec: `docs/superpowers/specs/2026-09-22-runeicons-design.md`.
Do not "restore" an icon to the mock.
```

- [ ] **Step 2: Full live pass** — both themes, 1280×800, local stack: home, catalog (grid and list view), model detail, account (security, passkeys), console (users, roles, audit), territory viewer (tool rail, Overlays panel both tabs, PDF window maximised/minimised, measurement chip, tour replay tile), upload modal (panorama and document cards). Screenshot each to `scratchpad/icons-t3/` and build one contact sheet per theme. Look at every screen for: a missing icon (empty box), a clipped glyph, an icon whose weight or size is off next to its text, and any remaining character-icon.
- [ ] **Step 3: Gate**: `cd frontend && yarn lint && yarn test:coverage`.
- [ ] **Step 4: Commit**

```bash
git add frontend/CLAUDE.md
git commit -m "docs(frontend): icons follow runeicons, not the design system's Icons section"
```
