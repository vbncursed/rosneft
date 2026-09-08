# Territory Conversion v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend-v2` takes over `/territories/{slug}` and shows the mock's
conversion-pending page — live progress over SSE with the jobs poll as the
fallback, the seven-step pipeline in the worker's real order, the worker's
message on failure, and an automatic leave to the viewer when the artifacts
land while the page is open.

**Architecture:** Two small `shared/ui` extensions (`ProgressBar size="lg"`,
`Callout title/mono/size="note"`), one new entity component (`Pipeline`) with
its pure step model, one SSE gateway plus hook in `entities/conversion`, and
one page slice (`pages/territory-conversion`) whose container hook mirrors
`useModelDetail` — three queries plus the stream, merged into one job, one
phase, one decision to leave. The route joins the catalog shell; four
`leaveTo` calls become router navigation.

**Tech Stack:** React 19 + TypeScript 7 + Tailwind 4 (Feature-Sliced),
TanStack Router/Query, Vitest + jsdom + Testing Library, react-cosmos 7
(UI on :5100, renderer on :5050), Python Playwright for measurements.

**Spec:** `docs/superpowers/specs/2026-09-08-territory-conversion-v2-design.md`
— read it first; every ruling this plan leans on is argued there.

**Mock digest:** `.superpowers/sdd/2026-09-08-territory-conversion-v2/mock-digest.md`
— every measurement, token and string. Build from it, not from memory.

## Global Constraints

- **Skills first.** Every implementer and reviewer starts by loading, through
  the Skill tool: `ponytail:ponytail`, `clean-code`,
  `superpowers:test-driven-development`, `react-best-practices`,
  `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`.
  The user checks the transcript.
- **Package manager is yarn, never npm.** Version lookups too (`yarn info <pkg> version`).
- **Commit by path.** `git add frontend-v2` (or `git add docs/...`). **Never**
  stage `.claude/settings.json` or `backend/go.work.sum` — both are dirty from
  a parallel session and belong to it. After every commit verify the file list
  with `git show --numstat --format="" HEAD | awk '{print $3}'` — no
  `backend/`, no `.claude/` path.
- **Frontend-only commits** use `--no-verify` and carry the line
  `Frontend-only; the backend gate is skipped — no Go code changed.`
- **Every commit ends with:**
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- **Do not push and do not touch PR #38.** The user does that.
- **Break → red → restore → green.** Every task's report shows four outputs:
  the new test failing against a deliberately broken implementation, then
  passing against the restored one. A test that never went red is not a test.
- **200 lines per file**, hand-enforced (skip blanks and comments). Split
  rather than grow.
- **`clsx` does not merge classes.** One CSS property, one place. Never pass a
  `className` that re-sets a property a variant already sets; add a variant.
- **Every non-barrel source file needs a sibling `*.spec.ts(x)`; every slice
  directory containing `.tsx` needs a `*.fixture.tsx`.** `architecture.spec.ts`
  and `fixtures.spec.tsx` fail the suite otherwise.
- **Import boundary:** `shared → entities → features → widgets → pages → app`,
  never past a sibling slice's `index.ts`.
- **jsdom computes no styles.** Geometry is verified in Cosmos or the live
  app by `getComputedStyle`, never by asserting a class name. Say which
  surface you measured.
- **Page fixtures wrap in `CatalogShell`.** A bare one sits flush against the
  viewport and misreports every gap.
- **`unanswered`, never `isError`**, for "unavailable".
- **Coverage thresholds stay 90/85/90/90** (`yarn test:coverage`). Run the
  full suite on a quiet tree — a run during another agent's edits gives false
  failures.
- Local stack: gateway `:8080`, `yarn dev` `:3001`, Cosmos `:5100` (its Vite
  renderer `:5050`). Root `admin` / `change-me-now`; Company Owner `cotest`
  / `Passw0rd!2026`. The login field in JSON is `identifier`. Real failed
  job for `cotest`: territory `tenant-a-scene`, id
  `89ef61f236ceaeda7760c1d53e302c31`, no `stage`, no `progress`, message
  `fetch/extract source: blob get: blobstore: blob not found`.

### Measuring a fixture in Cosmos (used by Tasks 1–3, 7)

Cosmos may already be up (`lsof -nP -iTCP:5100 -sTCP:LISTEN`); if not,
`cd frontend-v2 && yarn cosmos` in the background and wait for
`See you at http://localhost:5100`. Kill with
`pkill -f 'node_modules/.bin/cosmos'`, never the wrapper alone. The renderer
answers on **:5050**, and this URL shape is verified to work:

```python
# $CLAUDE_JOB_DIR/tmp/measure.py — python3, Playwright is installed
import json, sys, urllib.parse
from playwright.sync_api import sync_playwright

path, name, selector, props = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(",")
fx = {"path": path, **({"name": name} if name else {})}
url = "http://localhost:5050/?fixtureId=" + urllib.parse.quote(json.dumps(fx))
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1100, "height": 900})
    for theme in ("dark", "light"):
        pg.goto(url)
        pg.wait_for_load_state("networkidle")
        pg.evaluate(f"document.documentElement.dataset.theme='{theme}'")
        for i, el in enumerate(pg.locator(selector).element_handles()):
            print(theme, i, el.evaluate("(e, ps) => Object.fromEntries(ps.map(p => [p, getComputedStyle(e)[p]]))", props))
        pg.screenshot(path=f"{name or 'default'}-{theme}.png", full_page=True)
    b.close()
```

`python3 measure.py src/shared/ui/progress-bar/progress-bar.fixture.tsx "" '[role=progressbar]' height,borderTopWidth`
prints one line per element per theme and drops two screenshots beside the
script. Named fixture exports pass their key as the second argument.

---

## File map

| File | Responsibility |
|---|---|
| `shared/ui/progress-bar/progress-bar.tsx` (+spec, +fixture) | `size="lg"`: 8 px framed track, caption above, no track without a value |
| `shared/ui/callout/callout.tsx` (+spec, +fixture) | `title`, `mono`, `size="note"` |
| `app/styles/theme.css` | `--animate-breathe` + keyframes |
| `entities/conversion/model/status.ts` (+spec) | `StageState` gains `failed` |
| `entities/conversion/model/pipeline.ts` (+spec) | the seven steps, `stepIndexOf`, `pipelineSteps`, `pipelineMeta` |
| `entities/conversion/ui/pipeline.tsx` (+spec) | the step cards |
| `entities/conversion/conversion.fixture.tsx` | + pipeline states |
| `entities/conversion/api/job-stream.ts` (+spec) | `openJobStream` over `EventSource` |
| `entities/conversion/model/use-job-stream.ts` (+spec) | `useJobStream(jobId, slug)` |
| `entities/conversion/index.ts` | new exports |
| `pages/territory-conversion/model/conversion-view.ts` (+spec) | `Phase`, `phaseOf`, `shouldLeave`, `ledeOf`, `STATUS_PILL`, `progressCard`, page props type |
| `pages/territory-conversion/model/use-territory-conversion.ts` (+spec) | the container hook |
| `pages/territory-conversion/ui/territory-conversion-page.tsx` (+spec) | props-only page |
| `pages/territory-conversion/ui/conversion-actions.tsx` (+spec) | the failed/ready action rows |
| `pages/territory-conversion/ui/territory-conversion-screen.tsx` (+spec) | params, search, phases → page |
| `pages/territory-conversion/territory-conversion-page.fixture.tsx` | seven states in `CatalogShell` |
| `pages/territory-conversion/index.ts` | barrel |
| `app/router/catalog-routes.tsx`, `router.tsx` | the route |
| `app/router/guard.ts` (+spec) | `TERRITORY_PAGE` |
| `pages/upload-territory/model/use-upload-territory.ts` (+spec) | navigate instead of leave |
| `pages/replace-source/model/use-replace-source.ts` (+spec) | navigate instead of leave |
| `pages/territory-catalog/ui/territory-catalog-screen.tsx` (+spec) | navigate instead of leave |
| `pages/content/ui/content-screen.tsx` (+spec) | navigate instead of leave |
| `frontend-v2/CLAUDE.md`, `CLAUDE.md`, `frontend-v2/README.md` | docs |

---

### Task 1: `ProgressBar size="lg"`

**Files:**
- Modify: `frontend-v2/src/shared/ui/progress-bar/progress-bar.tsx`
- Modify: `frontend-v2/src/shared/ui/progress-bar/progress-bar.spec.tsx`
- Modify: `frontend-v2/src/shared/ui/progress-bar/progress-bar.fixture.tsx`

**Interfaces:**
- Produces: `ProgressBarProps.size?: "md" | "lg"` (default `"md"`). Under
  `lg`: caption `<p>` **above** the track — `label` 13 px/600 `text-fg`,
  `detail` mono 11 px, `text-accent` with a value and `text-muted` without;
  track `h-2 border border-line bg-panel-2 rounded-full`; **no track at all**
  when `value` is `undefined`.

- [ ] **Step 1: Write the failing tests** — append to `progress-bar.spec.tsx`:

```tsx
describe("ProgressBar · lg", () => {
  it("draws the mock's 8px framed track with the caption above it", () => {
    const { container } = render(
      <ProgressBar size="lg" value={58} label="Building LOD 1" detail="58%" />,
    );
    const track = screen.getByRole("progressbar", { name: "Building LOD 1" });
    expect(track).toHaveAttribute("aria-valuenow", "58");
    expect(track.className).toContain("h-2");
    expect(track.className).toContain("border-line");
    const caption = container.querySelector("p")!;
    // The caption precedes the track in the DOM — the mock's row sits above the bar.
    expect(caption.compareDocumentPosition(track) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("58%").className).toContain("text-accent");
    expect(screen.getByText("Building LOD 1").className).toContain("font-semibold");
  });

  it("draws the caption alone, muted, when there is no value to show", () => {
    render(<ProgressBar size="lg" label="Waiting for a worker" detail="no progress reported" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("no progress reported").className).toContain("text-muted");
    expect(screen.getByText("Waiting for a worker")).toBeInTheDocument();
  });

  it("leaves md exactly as it was", () => {
    render(<ProgressBar value={64} label="Uploading chunks" detail="64%" />);
    expect(screen.getByRole("progressbar").className).toContain("h-1.5");
    expect(screen.getByText("64%").parentElement!.className).toContain("mt-[7px]");
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `cd frontend-v2 && yarn vitest run src/shared/ui/progress-bar`
Expected: the first two new cases FAIL (`size` is not a prop; the track renders).

- [ ] **Step 3: Implement** — in `progress-bar.tsx` add the prop and an early
  `lg` branch. The `md` path below it stays byte-for-byte:

```tsx
export type ProgressBarProps = {
  /** 0–100. Omit it for the indeterminate "waiting to start" bar (md), or for a caption with no track (lg). */
  value?: number;
  tone?: ProgressTone;
  label?: ReactNode;
  /** Right-aligned readout, usually the percentage. */
  detail?: ReactNode;
  ariaLabel?: string;
  /** thin is the frameless 5px meter the role cards and inspector use. */
  variant?: "framed" | "thin";
  /** lg is the conversion page's 8px card bar with its caption above the track. */
  size?: "md" | "lg";
  className?: string;
};
```

```tsx
export function ProgressBar({
  value,
  tone = "accent",
  label,
  detail,
  ariaLabel,
  variant = "framed",
  size = "md",
  className,
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, value));
  const name = ariaLabel ?? (typeof label === "string" ? label : undefined);

  if (size === "lg") {
    return (
      <div className={className}>
        {label || detail ? (
          <p
            className={cx(
              "m-0 flex flex-wrap items-baseline justify-between gap-3",
              // The mock's queued card is the caption alone — nothing to space from.
              indeterminate ? undefined : "mb-3.5",
            )}
          >
            {label ? <span className="text-[13px] font-semibold text-fg">{label}</span> : null}
            {detail ? (
              <span className={cx("font-mono text-[11px]", indeterminate ? "text-muted" : "text-accent")}>
                {detail}
              </span>
            ) : null}
          </p>
        ) : null}
        {indeterminate ? null : (
          <div
            role="progressbar"
            aria-label={name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full border border-line bg-panel-2"
          >
            <div
              className={cx("h-full transition-[width] duration-300", FILL[tone])}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    /* the existing md render, unchanged, using `name` for aria-label */
  );
}
```

Replace the existing `aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}` in the md path with `aria-label={name}` — that is the only edit there.

- [ ] **Step 4: Run to verify green**

Run: `yarn vitest run src/shared/ui/progress-bar` — Expected: all PASS.
Then break it (delete `mb-3.5` → the first case still passes; delete the
`indeterminate ? null :` guard → the second case fails) and show the red,
restore, show green.

- [ ] **Step 5: Fixture** — add to `progress-bar.fixture.tsx` a second block
under the existing one:

```tsx
export default {
  md: (
    <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
      {/* the four existing bars */}
    </div>
  ),
  lg: (
    <div className="flex max-w-xl flex-col gap-4 p-6">
      <div className="rounded-card border border-accent-line bg-panel px-[22px] py-5">
        <ProgressBar size="lg" value={58} label="Building LOD 1" detail="58%" />
      </div>
      <div className="rounded-card border border-line bg-panel px-[22px] py-5">
        <ProgressBar size="lg" label="Waiting for a worker" detail="no progress reported" />
      </div>
    </div>
  ),
};
```

- [ ] **Step 6: Measure in Cosmos** (both themes):

```
python3 measure.py src/shared/ui/progress-bar/progress-bar.fixture.tsx lg '[role=progressbar]' height,borderTopWidth,borderRadius
python3 measure.py src/shared/ui/progress-bar/progress-bar.fixture.tsx lg 'p' marginBottom,fontSize
```
Expected: track `8px` / `1px`; first caption `marginBottom: 14px`, second `0px`.
Paste the lines into the report.

- [ ] **Step 7: Lint and commit**

```bash
cd frontend-v2 && yarn lint
cd .. && git add frontend-v2 && git commit --no-verify -F - <<'EOF'
feat(frontend-v2): ProgressBar size="lg" — the conversion card's 8px bar with its caption above

Frontend-only; the backend gate is skipped — no Go code changed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git show --numstat --format="" HEAD | awk '{print $3}'
```

---

### Task 2: `Callout` — `title`, `mono`, `size="note"`

**Files:**
- Modify: `frontend-v2/src/shared/ui/callout/callout.tsx`
- Modify: `frontend-v2/src/shared/ui/callout/callout.spec.tsx`
- Modify: `frontend-v2/src/shared/ui/callout/callout.fixture.tsx`

**Interfaces:**
- Produces: `CalloutProps.title?: string` (mono 9 px uppercase overline in
  the tone, above the body), `mono?: boolean` (body in
  `font-mono leading-[1.55] break-words select-text`),
  `size?: "md" | "lg" | "note"` — `note` is the conversion page's waiting
  callout: `items-start gap-[9px] rounded-control-lg px-[13px] py-[11px]`,
  icon 14 px. (The spec said "pass the exact values through `className`";
  that re-sets padding and radius that `md` already sets — the `clsx`
  collision — so it is a size instead.)

- [ ] **Step 1: Write the failing tests** — append to `callout.spec.tsx`:

```tsx
describe("Callout · title and mono", () => {
  it("prints an overline above a mono body, both in the tone", () => {
    render(
      <Callout tone="bad" size="lg" title="Worker message" mono>
        ktx2: unsupported pixel format
      </Callout>,
    );
    const overline = screen.getByText("Worker message");
    const body = screen.getByText("ktx2: unsupported pixel format");
    expect(overline.tagName).toBe("P");
    expect(body.tagName).toBe("P");
    expect(overline.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overline.className).toContain("uppercase");
    expect(body.className).toContain("font-mono");
    expect(screen.getByRole("alert").className).toContain("text-bad");
  });

  it("keeps a plain callout one paragraph in the sans face", () => {
    const { container } = render(<Callout tone="warn">Only this.</Callout>);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByText("Only this.").className).not.toContain("font-mono");
  });

  it("has a note size with the smaller glyph", () => {
    const { container } = render(
      <Callout tone="warn" icon="info" size="note">
        Closing the tab does not stop the job.
      </Callout>,
    );
    expect(container.firstElementChild!.className).toContain("rounded-control-lg");
    expect(container.querySelector("svg")).toHaveAttribute("width", "14");
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `yarn vitest run src/shared/ui/callout` — Expected: three new FAILs.

- [ ] **Step 3: Implement** — `callout.tsx`:

```tsx
export type CalloutProps = {
  tone: CalloutTone;
  children: ReactNode;
  /** Defaults to the warning triangle; pass another glyph where it fits. */
  icon?: IconName;
  /** md the single-line inline notice; lg the start-aligned block, e.g. Replace Source's warning; note the conversion page's 10px-radius aside. */
  size?: "md" | "lg" | "note";
  /** A mono overline above the body — the failure box's "Worker message". */
  title?: string;
  /** Sets the body in the mono face, for text the server wrote. */
  mono?: boolean;
  className?: string;
};

const SIZE: Record<NonNullable<CalloutProps["size"]>, string> = {
  md: "items-center gap-2 rounded-[9px] px-3 py-2.5",
  lg: "items-start gap-2.5 rounded-card px-4 py-3.5",
  note: "items-start gap-[9px] rounded-control-lg px-[13px] py-[11px]",
};

const GLYPH: Record<NonNullable<CalloutProps["size"]>, number> = { md: 15, lg: 15, note: 14 };

const MONO = "font-mono leading-[1.55] break-words select-text";

export function Callout({ tone, children, icon = "warning", size = "md", title, mono, className }: CalloutProps) {
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={cx("flex border", SIZE[size], SKIN[tone], className)}
    >
      <Icon name={icon} size={GLYPH[size]} className="shrink-0" />
      {title ? (
        <div className="min-w-0 flex-1">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em]">{title}</p>
          <p className={cx("mt-[7px] mb-0 text-xs", mono && MONO)}>{children}</p>
        </div>
      ) : (
        <p className={cx("m-0 text-xs", mono && MONO)}>{children}</p>
      )}
    </div>
  );
}
```

Keep the existing `role` comment block. `Icon`'s `size` prop sets the
`width` and `height` attributes (`shared/ui/icon/icon.tsx:17-18`), which is
what the third case asserts.

- [ ] **Step 4: Run to verify green**, then break (drop `GLYPH`, use 15 → third case red; drop the `title` branch → first case red), restore, green.

- [ ] **Step 5: Fixture** — add two entries to the existing fixture's column:

```tsx
    <Callout tone="bad" size="lg" title="Worker message" mono>
      ktx2: unsupported pixel format in tank_albedo_04.tga
    </Callout>
    <Callout tone="warn" icon="info" size="note">
      This page opens the viewer by itself once the artifacts land — no need to reload. Closing the tab does not stop the job.
    </Callout>
```

- [ ] **Step 6: Measure in Cosmos** (both themes):

```
python3 measure.py src/shared/ui/callout/callout.fixture.tsx "" '[role=alert]' paddingTop,paddingLeft,borderRadius
python3 measure.py src/shared/ui/callout/callout.fixture.tsx "" 'p' fontSize,letterSpacing,marginTop
```
Expected: the titled box `14px / 16px / 12px`; its overline `9px`,
`1.8px`, its body `marginTop: 7px`; the note box (`div.rounded-control-lg`)
`11px / 13px / 10px` — add that selector to a third run.

- [ ] **Step 7: Lint and commit** (`feat(frontend-v2): Callout title, mono body and the note size`), file list checked.

---

### Task 3: `StageState.failed`, the pipeline model, `Pipeline`

**Files:**
- Modify: `frontend-v2/src/entities/conversion/model/status.ts` (+ `status.spec.ts`)
- Create: `frontend-v2/src/entities/conversion/model/pipeline.ts` (+ `pipeline.spec.ts`)
- Create: `frontend-v2/src/entities/conversion/ui/pipeline.tsx` (+ `pipeline.spec.tsx`)
- Modify: `frontend-v2/src/entities/conversion/conversion.fixture.tsx`
- Modify: `frontend-v2/src/entities/conversion/index.ts`
- Modify: `frontend-v2/src/app/styles/theme.css`

**Interfaces:**
- Produces:
  - `type StageState = "done" | "active" | "failed" | "pending"`; `STAGE_DOT.failed = "bg-bad"`, `STAGE_TEXT.failed = "text-bad"`.
  - `type PipelinePhase = "queued" | "running" | "failed" | "ready"`
  - `type PipelineStep = { label: string; token: string; state: StageState }`
  - `PIPELINE: readonly { token: string; label: string }[]` (7 entries)
  - `stepIndexOf(stage: string | null): number` (−1 when unknown)
  - `pipelineSteps(stage: string | null, phase: PipelinePhase): PipelineStep[]`
  - `pipelineMeta(stage: string | null, phase: PipelinePhase): string`
  - `Pipeline({ steps, label?, className? })`
  - Tailwind utility `animate-breathe`.

- [ ] **Step 1: `status.ts`** — widen the type and the two records; add to
`status.spec.ts`:

```ts
it("tones a failed stage bad, dot and text alike", () => {
  expect(toneClasses("failed")).toEqual({ dot: "bg-bad", text: "text-bad" });
});
```

Run `yarn vitest run src/entities/conversion/model/status` → red (type error /
undefined), then edit `status.ts`:

```ts
/** One step of the pipeline, as the inspector and the conversion page list them. */
export type StageState = "done" | "active" | "failed" | "pending";

export const STAGE_DOT: Record<StageState, string> = {
  done: "bg-ok",
  active: "bg-warn",
  failed: "bg-bad",
  pending: "bg-line-2",
};

export const STAGE_TEXT: Record<StageState, string> = {
  done: "text-fg",
  active: "text-warn",
  failed: "text-bad",
  pending: "text-dim",
};
```

→ green. Run `yarn lint`: any other exhaustive `Record<StageState, …>` in the
tree now fails to type-check — add the `failed` key there too (there should
be none besides these two; report what you found).

- [ ] **Step 2: `pipeline.spec.ts`** (red first):

```ts
import { describe, expect, it } from "vitest";
import { PIPELINE, pipelineMeta, pipelineSteps, stepIndexOf } from "./pipeline";

const TOKENS = ["fetching", "extracting", "parsing", "encoding", "compressing", "lod-0", "lod-1", "lod-2", "lod-7", "registering"];

describe("stepIndexOf", () => {
  it("maps every worker token onto its step, every lod-N onto the LOD step", () => {
    expect(TOKENS.map(stepIndexOf)).toEqual([0, 1, 2, 3, 4, 5, 5, 5, 5, 6]);
  });

  it("answers -1 for nothing reported or a token it does not know", () => {
    expect(stepIndexOf(null)).toBe(-1);
    expect(stepIndexOf("polishing")).toBe(-1);
  });
});

describe("pipelineSteps", () => {
  const states = (stage: string | null, phase: Parameters<typeof pipelineSteps>[1]) =>
    pipelineSteps(stage, phase).map((s) => s.state);

  it("queued: nothing started, whatever the stage says", () => {
    expect(states(null, "queued")).toEqual(Array(7).fill("pending"));
    expect(states("fetching", "queued")).toEqual(Array(7).fill("pending"));
  });

  it("running at a known stage: done before it, active at it, pending after", () => {
    expect(states("encoding", "running")).toEqual(["done", "done", "done", "active", "pending", "pending", "pending"]);
  });

  it("running with nothing reported: all pending", () => {
    expect(states(null, "running")).toEqual(Array(7).fill("pending"));
  });

  it("failed at a known stage marks that step failed", () => {
    expect(states("lod-1", "failed")).toEqual(["done", "done", "done", "done", "done", "failed", "pending"]);
  });

  it("failed with no stage marks nothing — the live shape of tenant-a-scene", () => {
    expect(states(null, "failed")).toEqual(Array(7).fill("pending"));
  });

  it("ready: every step done", () => {
    expect(states(null, "ready")).toEqual(Array(7).fill("done"));
  });

  it("carries the label and the shown token", () => {
    expect(PIPELINE).toHaveLength(7);
    expect(pipelineSteps(null, "queued")[5]).toEqual({ token: "lod-N", label: "Building LODs", state: "pending" });
    expect(pipelineSteps(null, "queued")[0].label).toBe("Fetching the archive");
  });
});

describe("pipelineMeta", () => {
  it("names where the pipeline has got to", () => {
    expect(pipelineMeta(null, "queued")).toBe("7 steps · none started");
    expect(pipelineMeta("encoding", "running")).toBe("step 4 of 7");
    expect(pipelineMeta(null, "running")).toBe("7 steps · stage not reported");
    expect(pipelineMeta("compressing", "failed")).toBe("stopped at step 5 of 7");
    expect(pipelineMeta(null, "failed")).toBe("stopped before the first report");
    expect(pipelineMeta("registering", "ready")).toBe("7 steps · finished");
  });
});
```

- [ ] **Step 3: `pipeline.ts`**:

```ts
import type { StageState } from "./status";

export type PipelinePhase = "queued" | "running" | "failed" | "ready";

export type PipelineStep = { label: string; token: string; state: StageState };

/**
 * The worker's seven steps in the order it reports them
 * (mesh-service process_job.go + converter/*): the LOD pass comes after
 * encoding and compressing and is reported as lod-N twice — once per
 * simplified level, once per registered one — so every lod-N is one step.
 * `registering` arrives only with `succeeded`, so it is never active on
 * screen; it is listed because the mock lists it and the worker sends it.
 */
export const PIPELINE: readonly { token: string; label: string }[] = [
  { token: "fetching", label: "Fetching the archive" },
  { token: "extracting", label: "Extracting files" },
  { token: "parsing", label: "Parsing OBJ + MTL" },
  { token: "encoding", label: "Encoding geometry" },
  { token: "compressing", label: "Compressing textures" },
  { token: "lod-N", label: "Building LODs" },
  { token: "registering", label: "Registering artifacts" },
];

const LOD_STEP = 5;
const LOD = /^lod-\d+$/;

/** The step a worker token belongs to; -1 for nothing reported or a token this list does not know. */
export function stepIndexOf(stage: string | null): number {
  if (stage === null) return -1;
  if (LOD.test(stage)) return LOD_STEP;
  return PIPELINE.findIndex((s) => s.token === stage);
}

const stateAt = (i: number, at: number, phase: PipelinePhase): StageState => {
  if (phase === "ready") return "done";
  if (at < 0 || i > at) return "pending";
  if (i < at) return "done";
  return phase === "failed" ? "failed" : "active";
};

export function pipelineSteps(stage: string | null, phase: PipelinePhase): PipelineStep[] {
  // A queued job has done nothing, whatever stale token a requeue may carry.
  const at = phase === "queued" ? -1 : stepIndexOf(stage);
  return PIPELINE.map((s, i) => ({ ...s, state: stateAt(i, at, phase) }));
}

export function pipelineMeta(stage: string | null, phase: PipelinePhase): string {
  const n = PIPELINE.length;
  if (phase === "ready") return `${n} steps · finished`;
  if (phase === "queued") return `${n} steps · none started`;
  const at = stepIndexOf(stage);
  if (phase === "failed") return at < 0 ? "stopped before the first report" : `stopped at step ${at + 1} of ${n}`;
  return at < 0 ? `${n} steps · stage not reported` : `step ${at + 1} of ${n}`;
}
```

Run → green. Break (`LOD_STEP = 4`) → red → restore → green.

- [ ] **Step 4: `theme.css`** — beside `--animate-indeterminate`:

```css
  /* The pipeline's active dot, per the mock's om-breathe. */
  --animate-breathe: breathe 1.8s ease-in-out infinite;
```

and after the `indeterminate` keyframes:

```css
@keyframes breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
```

- [ ] **Step 5: `pipeline.spec.tsx`** (red first):

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pipelineSteps } from "../model/pipeline";
import { Pipeline } from "./pipeline";

describe("Pipeline", () => {
  it("is a labelled ordered list of every step, label and token", () => {
    render(<Pipeline steps={pipelineSteps("compressing", "running")} />);
    const list = screen.getByRole("list", { name: "Conversion pipeline" });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[4]).toHaveTextContent("Compressing textures");
    expect(items[4]).toHaveTextContent("compressing");
    expect(items[5]).toHaveTextContent("lod-N");
  });

  it("says each step's state in words — visibly while running or failed, off-screen otherwise", () => {
    render(<Pipeline steps={pipelineSteps("compressing", "running")} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[4]).getByText("running").className).not.toContain("sr-only");
    expect(within(items[0]).getByText("done").className).toContain("sr-only");
    expect(within(items[6]).getByText("not started").className).toContain("sr-only");
  });

  it("tones the failed step bad and stops the breathing", () => {
    const { container } = render(<Pipeline steps={pipelineSteps("lod-1", "failed")} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[5]).getByText("failed").className).toContain("text-bad");
    expect(items[5].className).toContain("border-bad");
    expect(container.querySelectorAll(".animate-breathe")).toHaveLength(0);
  });

  it("breathes on exactly the active dot, and mutes a pending label", () => {
    const { container } = render(<Pipeline steps={pipelineSteps("encoding", "running")} />);
    expect(container.querySelectorAll(".animate-breathe")).toHaveLength(1);
    expect(screen.getByText("Registering artifacts").className).toContain("text-muted");
    expect(screen.getByText("Fetching the archive").className).toContain("text-fg");
  });

  it("takes its own name", () => {
    render(<Pipeline steps={pipelineSteps(null, "queued")} label="Steps" />);
    expect(screen.getByRole("list", { name: "Steps" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: `pipeline.tsx`**:

```tsx
import { clsx as cx } from "clsx";
import type { PipelineStep } from "../model/pipeline";
import type { StageState } from "../model/status";

export type PipelineProps = {
  steps: PipelineStep[];
  /** Names the list for assistive tech. */
  label?: string;
  className?: string;
};

const CARD: Record<StageState, string> = {
  done: "border-line bg-panel",
  active: "border-warn bg-warn-soft",
  failed: "border-bad bg-bad-soft",
  pending: "border-line bg-panel",
};

const TONE: Record<StageState, string> = {
  done: "bg-ok",
  active: "bg-warn",
  failed: "bg-bad",
  pending: "bg-line-2",
};

const BADGE: Partial<Record<StageState, string>> = {
  active: "border-warn text-warn",
  failed: "border-bad text-bad",
};

/** The state as a word — the badge prints it for the two loud states, the rest is read out only. */
const WORD: Record<StageState, string> = {
  done: "done",
  active: "running",
  failed: "failed",
  pending: "not started",
};

/** The conversion pipeline as the mock's step cards: a rail, a dot, the label, the state, the token. */
export function Pipeline({ steps, label = "Conversion pipeline", className }: PipelineProps) {
  return (
    <ol aria-label={label} className={cx("m-0 flex list-none flex-col gap-[9px] p-0", className)}>
      {steps.map((step) => {
        const badge = BADGE[step.state];
        return (
          <li
            key={step.token}
            className={cx(
              "relative flex items-start gap-3 overflow-hidden rounded-[11px] border py-3.5 pr-4 pl-[19px]",
              CARD[step.state],
            )}
          >
            <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-[3px]", TONE[step.state])} />
            <span
              aria-hidden="true"
              className={cx(
                "mt-[5px] size-2 shrink-0 rounded-full",
                TONE[step.state],
                step.state === "active" && "animate-breathe motion-reduce:animate-none",
              )}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[9px]">
              <p className={cx("m-0 text-[13px]", step.state === "pending" ? "text-muted" : "text-fg")}>
                {step.label}
              </p>
              {badge ? (
                <span
                  className={cx(
                    "rounded-[5px] border px-[7px] py-px font-mono text-[9px] uppercase leading-[1.6] tracking-[0.12em] whitespace-nowrap",
                    badge,
                  )}
                >
                  {WORD[step.state]}
                </span>
              ) : (
                <span className="sr-only">{WORD[step.state]}</span>
              )}
            </div>
            <span className="shrink-0 font-mono text-[10px] whitespace-nowrap text-muted">{step.token}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

Run → green. Break (`TONE.failed = "bg-warn"`… no, the spec checks the badge:
set `BADGE.failed = "border-bad text-warn"`) → red → restore → green.

- [ ] **Step 7: Barrel and fixture.** `index.ts` adds:

```ts
export { PIPELINE, pipelineMeta, pipelineSteps, stepIndexOf, type PipelinePhase, type PipelineStep } from "./model/pipeline";
export { Pipeline, type PipelineProps } from "./ui/pipeline";
```

`conversion.fixture.tsx` gains four entries (keep the two existing; the
fixture sits at the slice root, so it imports `./model/pipeline` and
`./ui/pipeline` relatively):

```tsx
import { pipelineSteps, type PipelinePhase } from "./model/pipeline";
import { Pipeline } from "./ui/pipeline";

const pipeline = (stage: string | null, phase: PipelinePhase) => (
  <div className="max-w-[760px] p-6">
    <Pipeline steps={pipelineSteps(stage, phase)} />
  </div>
);

export default {
  badges: /* existing */,
  stages: /* existing */,
  "pipeline queued": pipeline(null, "queued"),
  "pipeline running": pipeline("encoding", "running"),
  "pipeline failed": pipeline("compressing", "failed"),
  "pipeline failed, no stage": pipeline(null, "failed"),
};
```

- [ ] **Step 8: Measure in Cosmos** (both themes):

```
python3 measure.py src/entities/conversion/conversion.fixture.tsx "pipeline running" 'li' paddingTop,paddingRight,paddingBottom,paddingLeft,borderRadius,borderTopColor
python3 measure.py src/entities/conversion/conversion.fixture.tsx "pipeline running" 'li > span:first-child' width
python3 measure.py src/entities/conversion/conversion.fixture.tsx "pipeline running" 'li > span:nth-child(2)' width,height,animationName
python3 measure.py src/entities/conversion/conversion.fixture.tsx "pipeline running" 'li span.rounded-\[5px\]' paddingTop,paddingLeft,fontSize
```
Expected: cards `14/16/14/19`, radius `11px`, item 3 border in the warn
colour; rail `3px`; dot `8px × 8px`, `animationName: breathe` on item 3
only, `none` elsewhere; badge `1px / 7px / 9px`. Screenshots of the four
states beside the mock's pipeline block.

- [ ] **Step 9: Lint, full slice tests, commit** (`feat(frontend-v2): the conversion pipeline cards, and a failed stage state`).

---

### Task 4: `openJobStream` and `useJobStream`

**Files:**
- Create: `frontend-v2/src/entities/conversion/api/job-stream.ts` (+ `job-stream.spec.ts`)
- Create: `frontend-v2/src/entities/conversion/model/use-job-stream.ts` (+ `use-job-stream.spec.tsx`)
- Modify: `frontend-v2/src/entities/conversion/index.ts`

**Interfaces:**
- Consumes: `toTargetJob` (`api/to-target-job.ts`), `isLive`, `TargetJob`.
- Produces:
  - `type StreamEnd = "finished" | "lost"`
  - `openJobStream(id: string, handlers: { onJob(job: TargetJob): void; onEnd(why: StreamEnd): void }): () => void`
  - `useJobStream(jobId: string | null, slug: string): TargetJob | null`

Note: **jsdom and this Node (24) have no `EventSource`** — `typeof
EventSource` is `undefined` in the suite. The gateway reads it off
`globalThis` and answers a no-op closer without one; the spec stubs it.

- [ ] **Step 1: `job-stream.spec.ts`** (red first):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openJobStream } from "./job-stream";

class FakeSource {
  static instances: FakeSource[] = [];
  listeners = new Map<string, (e: Event) => void>();
  closed = false;
  constructor(public url: string) {
    FakeSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.closed = true;
  }
  frame(type: string, data: string) {
    this.listeners.get(type)?.(new MessageEvent(type, { data }));
  }
  drop() {
    this.listeners.get("error")?.(new Event("error"));
  }
}

const RUNNING = JSON.stringify({ id: "j1", kind: "territory", slug: "t", status: "running", progress: 0.58, stage: "lod-1" });
const FAILED = JSON.stringify({ id: "j1", kind: "territory", slug: "t", status: "failed", errorMessage: "boom" });

const last = () => FakeSource.instances.at(-1)!;

describe("openJobStream", () => {
  beforeEach(() => {
    FakeSource.instances = [];
    vi.stubGlobal("EventSource", FakeSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("subscribes to the job's channel and maps each frame to a TargetJob", () => {
    const onJob = vi.fn();
    openJobStream("j 1", { onJob, onEnd: vi.fn() });
    expect(last().url).toBe("/api/jobs/j%201/events");
    last().frame("job", RUNNING);
    expect(onJob).toHaveBeenCalledWith({ kind: "territory", slug: "t", status: "running", progress: 0.58, stage: "lod-1", errorMessage: null });
  });

  it("closes itself after a terminal frame, reporting finished", () => {
    const onEnd = vi.fn();
    openJobStream("j1", { onJob: vi.fn(), onEnd });
    last().frame("job", FAILED);
    expect(last().closed).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("finished");
  });

  it("reports lost on the gateway's error frame and on a dropped connection, and stays quiet afterwards", () => {
    const onEnd = vi.fn();
    openJobStream("j1", { onJob: vi.fn(), onEnd });
    last().frame("error", JSON.stringify({ code: "not_found", message: "job not found" }));
    expect(last().closed).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("lost");
    last().drop();
    expect(onEnd).toHaveBeenCalledTimes(1);

    openJobStream("j2", { onJob: vi.fn(), onEnd });
    last().drop();
    expect(onEnd).toHaveBeenLastCalledWith("lost");
  });

  it("ignores a malformed frame", () => {
    const onJob = vi.fn();
    const onEnd = vi.fn();
    openJobStream("j1", { onJob, onEnd });
    last().frame("job", "{not json");
    expect(onJob).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(last().closed).toBe(false);
  });

  it("closes without reporting when the caller closes it", () => {
    const onEnd = vi.fn();
    const close = openJobStream("j1", { onJob: vi.fn(), onEnd });
    close();
    expect(last().closed).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("answers a no-op closer where the platform has no EventSource", () => {
    vi.stubGlobal("EventSource", undefined);
    const close = openJobStream("j1", { onJob: vi.fn(), onEnd: vi.fn() });
    expect(() => close()).not.toThrow();
    expect(FakeSource.instances).toHaveLength(0);
  });
});
```

- [ ] **Step 2: `job-stream.ts`**:

```ts
import type { components } from "@/shared/api/dto";
import { isLive, type TargetJob } from "../model/target-job";
import { toTargetJob } from "./to-target-job";

type JobDto = components["schemas"]["Job"];

/** Why a stream stopped: the job reached a terminal state, or the channel went away. */
export type StreamEnd = "finished" | "lost";

export type JobStreamHandlers = {
  onJob: (job: TargetJob) => void;
  onEnd: (why: StreamEnd) => void;
};

const API_BASE = import.meta.env.VITE_API_URL;

/**
 * Subscribes to one job's SSE channel and returns the closer.
 *
 * /api/jobs/{id}/events requires a session. EventSource can carry no header
 * at all, so this works only because the URL is same-origin — VITE_API_URL
 * is empty in dev and prod alike — and the browser attaches the httpOnly
 * session cookie on its own.
 *
 * A platform without EventSource (jsdom, an old webview) gets a no-op closer
 * and never a frame; the caller's poll is the whole story there.
 */
export function openJobStream(id: string, handlers: JobStreamHandlers): () => void {
  const Source = globalThis.EventSource;
  if (typeof Source === "undefined") return () => {};
  const source = new Source(`${API_BASE}/api/jobs/${encodeURIComponent(id)}/events`);
  let open = true;
  const end = (why: StreamEnd) => {
    if (!open) return;
    open = false;
    source.close();
    handlers.onEnd(why);
  };
  source.addEventListener("job", (event) => {
    let job: TargetJob;
    try {
      job = toTargetJob(JSON.parse((event as MessageEvent<string>).data) as JobDto);
    } catch {
      return; // a malformed frame is not a reason to drop the channel
    }
    handlers.onJob(job);
    if (!isLive(job)) end("finished");
  });
  // Two things arrive as "error": the gateway's own `event: error` frame (an
  // unknown or foreign id — it carries data) and the browser's connection
  // error (no data). Neither will ever deliver a job; the poll takes over.
  source.addEventListener("error", () => end("lost"));
  return () => {
    open = false;
    source.close();
  };
}
```

Run → green. Break (remove the `if (!isLive(job)) end("finished")` line) →
red → restore → green.

- [ ] **Step 3: `use-job-stream.spec.tsx`** (red first):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStreamHandlers } from "../api/job-stream";
import { useJobStream } from "./use-job-stream";

const { openJobStream, close } = vi.hoisted(() => ({ openJobStream: vi.fn(), close: vi.fn() }));
vi.mock("../api/job-stream", () => ({ openJobStream }));

let handlers: JobStreamHandlers;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const job = (over: object = {}) => ({
  kind: "territory" as const,
  slug: "t",
  status: "running" as const,
  progress: 0.5,
  stage: "encoding",
  errorMessage: null,
  ...over,
});

describe("useJobStream", () => {
  beforeEach(() => {
    client = new QueryClient();
    openJobStream.mockReset().mockImplementation((_id: string, h: JobStreamHandlers) => {
      handlers = h;
      return close;
    });
    close.mockReset();
  });

  it("subscribes only with an id, and closes on unmount", () => {
    const { unmount, rerender } = renderHook(({ id }) => useJobStream(id, "t"), {
      wrapper,
      initialProps: { id: null as string | null },
    });
    expect(openJobStream).not.toHaveBeenCalled();
    rerender({ id: "j1" });
    expect(openJobStream).toHaveBeenCalledWith("j1", expect.any(Object));
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it("hands back the latest frame for this territory and drops another's", () => {
    const { result } = renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job({ slug: "other" })));
    expect(result.current).toBeNull();
    act(() => handlers.onJob(job({ kind: "model", slug: "t" })));
    expect(result.current).toBeNull();
    act(() => handlers.onJob(job()));
    expect(result.current).toEqual(job());
  });

  it("re-reads the artifacts and the jobs list on a terminal frame", () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job()));
    expect(spy).not.toHaveBeenCalled();
    act(() => handlers.onJob(job({ status: "succeeded" })));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["artifacts", "territory", "t"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });

  it("forgets its frame when the channel is lost, so the poll's row wins again", () => {
    const { result } = renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job()));
    expect(result.current).not.toBeNull();
    act(() => handlers.onEnd("lost"));
    expect(result.current).toBeNull();
  });

  it("keeps a finished frame", () => {
    const { result } = renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job({ status: "failed", errorMessage: "boom" })));
    act(() => handlers.onEnd("finished"));
    expect(result.current?.status).toBe("failed");
  });
});
```

- [ ] **Step 4: `use-job-stream.ts`**:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { openJobStream } from "../api/job-stream";
import { isLive, type TargetJob } from "./target-job";

/**
 * The latest frame of one territory's conversion job over SSE, or null —
 * before the first frame, without an id, or after the channel is lost. A
 * frame for another target is dropped: a stale or pasted id must not repaint
 * this territory's page with someone else's job.
 */
export function useJobStream(jobId: string | null, slug: string): TargetJob | null {
  const client = useQueryClient();
  const [job, setJob] = useState<TargetJob | null>(null);

  useEffect(() => {
    if (jobId === null) return;
    return openJobStream(jobId, {
      onJob: (next) => {
        if (next.kind !== "territory" || next.slug !== slug) return;
        setJob(next);
        if (!isLive(next)) {
          void client.invalidateQueries({ queryKey: ["artifacts", "territory", slug] });
          void client.invalidateQueries({ queryKey: ["jobs"] });
        }
      },
      // A channel that went away leaves no frame to trust: the poll's row must win again.
      onEnd: (why) => {
        if (why === "lost") setJob(null);
      },
    });
  }, [jobId, slug, client]);

  return job;
}
```

Run → green. Break (drop the `kind`/`slug` guard) → red → restore → green.

- [ ] **Step 5: Barrel**: `index.ts` adds

```ts
export { openJobStream, type JobStreamHandlers, type StreamEnd } from "./api/job-stream";
export { useJobStream } from "./model/use-job-stream";
```

Run `yarn vitest run src/entities/conversion src/architecture.spec.ts`, then
`yarn lint`, commit (`feat(frontend-v2): a job's SSE channel — openJobStream and useJobStream`).

---

### Task 5: `conversion-view.ts` — the page's decisions

**Files:**
- Create: `frontend-v2/src/pages/territory-conversion/model/conversion-view.ts` (+ `conversion-view.spec.ts`)

**Interfaces:**
- Consumes: `conversionStatusOf` (`@/entities/content`), `stageLabel`, `TargetJob` (`@/entities/conversion`), `Territory` (`@/entities/territory`).
- Produces:
  - `type Phase = "queued" | "running" | "failed" | "ready"`
  - `phaseOf(hasLod0: boolean, job: TargetJob | undefined): Phase`
  - `shouldLeave(prev: Phase | null, next: Phase): boolean`
  - `ledeOf(phase: Phase, facts: { hasJob: boolean; hasLod0: boolean }): string`
  - `STATUS_PILL: Record<Phase, { tone: "neutral" | "warn" | "bad" | "ok"; fill: "outline" | "soft"; label: string }>`
  - `progressCard(phase: "queued" | "running", job: TargetJob | null): { title: string; detail: string; value?: number }`
  - `type TerritoryConversionPageProps = { territory: Territory; phase: Phase; job: TargetJob | null; hasLod0: boolean; onOpenViewer: () => void }`

- [ ] **Step 1: The spec** (red first):

```ts
import { describe, expect, it } from "vitest";
import type { TargetJob } from "@/entities/conversion";
import { ledeOf, phaseOf, progressCard, shouldLeave, STATUS_PILL } from "./conversion-view";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory",
  slug: "t",
  status: "running",
  progress: 0.58,
  stage: "lod-1",
  errorMessage: null,
  ...over,
});

describe("phaseOf", () => {
  it("lets the job outrank the artifacts, then reads queued/running off its status", () => {
    expect(phaseOf(true, job({ status: "failed" }))).toBe("failed");
    expect(phaseOf(false, job({ status: "failed" }))).toBe("failed");
    expect(phaseOf(true, job({ status: "running" }))).toBe("running");
    expect(phaseOf(false, job({ status: "pending" }))).toBe("queued");
  });

  it("falls back to the artifacts with no live job", () => {
    expect(phaseOf(true, undefined)).toBe("ready");
    expect(phaseOf(false, undefined)).toBe("queued");
    expect(phaseOf(true, job({ status: "succeeded" }))).toBe("ready");
    expect(phaseOf(false, job({ status: "succeeded" }))).toBe("queued");
  });
});

describe("shouldLeave", () => {
  it("leaves only on a finish watched from this page", () => {
    expect(shouldLeave("running", "ready")).toBe(true);
    expect(shouldLeave("queued", "ready")).toBe(true);
    expect(shouldLeave(null, "ready")).toBe(false);
    expect(shouldLeave("failed", "ready")).toBe(false);
    expect(shouldLeave("ready", "ready")).toBe(false);
    expect(shouldLeave("running", "failed")).toBe(false);
  });
});

describe("ledeOf", () => {
  it("has a sentence for each of the six rows", () => {
    expect(ledeOf("queued", { hasJob: true, hasLod0: false })).toMatch(/in the queue/);
    expect(ledeOf("queued", { hasJob: false, hasLod0: false })).toMatch(/no job has been recorded/);
    expect(ledeOf("running", { hasJob: true, hasLod0: false })).toMatch(/Heavy work happens on the server/);
    expect(ledeOf("failed", { hasJob: true, hasLod0: false })).toBe("Conversion stopped, so the viewer has nothing to open.");
    expect(ledeOf("failed", { hasJob: true, hasLod0: true })).toMatch(/previous revision of this territory stays live/);
    expect(ledeOf("ready", { hasJob: false, hasLod0: true })).toMatch(/leaves this page/);
  });
});

describe("STATUS_PILL", () => {
  it("prints the mock's four words in the mock's tones", () => {
    expect(STATUS_PILL.queued).toEqual({ tone: "neutral", fill: "outline", label: "queued" });
    expect(STATUS_PILL.running).toEqual({ tone: "warn", fill: "soft", label: "converting" });
    expect(STATUS_PILL.failed).toEqual({ tone: "bad", fill: "soft", label: "failed" });
    expect(STATUS_PILL.ready).toEqual({ tone: "ok", fill: "soft", label: "ready" });
  });
});

describe("progressCard", () => {
  it("names the stage and the percent while running", () => {
    expect(progressCard("running", job())).toEqual({ title: "Building LOD 1", detail: "58%", value: 58 });
  });

  it("keeps the stage but drops the bar when progress is unreported", () => {
    expect(progressCard("running", job({ progress: null }))).toEqual({ title: "Building LOD 1", detail: "no progress reported" });
    expect(progressCard("running", job({ progress: null, stage: null })).title).toBe("Starting");
  });

  it("waits for a worker while queued, with or without a record", () => {
    const waiting = { title: "Waiting for a worker", detail: "no progress reported" };
    expect(progressCard("queued", job({ status: "pending", progress: null, stage: null }))).toEqual(waiting);
    expect(progressCard("queued", null)).toEqual(waiting);
  });
});
```

- [ ] **Step 2: The module**:

```ts
import { conversionStatusOf } from "@/entities/content";
import { stageLabel, type TargetJob } from "@/entities/conversion";
import type { Territory } from "@/entities/territory";

export type Phase = "queued" | "running" | "failed" | "ready";

/** What the page needs, whatever loaded it — the hook's ready state, or a fixture. */
export type TerritoryConversionPageProps = {
  territory: Territory;
  phase: Phase;
  /** The job on record, or null when nothing has been recorded for this territory. */
  job: TargetJob | null;
  hasLod0: boolean;
  /** Leaves for the viewer — the old app, for now. */
  onOpenViewer: () => void;
};

/** The catalogs' rule, then queued/running read off the job itself. */
export function phaseOf(hasLod0: boolean, job: TargetJob | undefined): Phase {
  const status = conversionStatusOf(hasLod0, job);
  if (status === "failed") return "failed";
  if (status === "converting") return job?.status === "running" ? "running" : "queued";
  return status === "ready" ? "ready" : "queued";
}

/** Only a finish watched from this page leaves for the viewer — never a mount that is already ready. */
export const shouldLeave = (prev: Phase | null, next: Phase): boolean =>
  next === "ready" && (prev === "queued" || prev === "running");

export function ledeOf(phase: Phase, { hasJob, hasLod0 }: { hasJob: boolean; hasLod0: boolean }): string {
  switch (phase) {
    case "queued":
      return hasJob
        ? "The archive is uploaded and the job is in the queue. Nothing has been reported yet, so there is no progress to show."
        : "The archive is uploaded, but no job has been recorded for it yet. The worker picks such territories up on its own within a few minutes.";
    case "running":
      return "The worker is turning your archive into the compact format the viewer loads. Heavy work happens on the server, not in this tab.";
    case "failed":
      return hasLod0
        ? "Conversion stopped, so the viewer has nothing new to open. The previous revision of this territory stays live."
        : "Conversion stopped, so the viewer has nothing to open.";
    case "ready":
      return "The artifacts are in place. The viewer is still the previous app, so opening it leaves this page.";
  }
}

export type StatusPill = { tone: "neutral" | "warn" | "bad" | "ok"; fill: "outline" | "soft"; label: string };

export const STATUS_PILL: Record<Phase, StatusPill> = {
  queued: { tone: "neutral", fill: "outline", label: "queued" },
  running: { tone: "warn", fill: "soft", label: "converting" },
  failed: { tone: "bad", fill: "soft", label: "failed" },
  ready: { tone: "ok", fill: "soft", label: "ready" },
};

export type ProgressCard = { title: string; detail: string; value?: number };

const WAITING: ProgressCard = { title: "Waiting for a worker", detail: "no progress reported" };

/** The progress card's row: the stage and the percent, or what is missing. */
export function progressCard(phase: "queued" | "running", job: TargetJob | null): ProgressCard {
  if (phase === "queued" || job === null) return WAITING;
  const title = job.stage === null ? "Starting" : stageLabel(job.stage);
  if (job.progress === null) return { title, detail: "no progress reported" };
  const value = Math.round(job.progress * 100);
  return { title, detail: `${value}%`, value };
}
```

Run → green. Break (`shouldLeave` returns `next === "ready"`) → red (the
`null → ready` case) → restore → green.

- [ ] **Step 3: Commit** (`feat(frontend-v2): the conversion page's decisions — phase, lede, pill, progress card, when to leave`). The slice has no `.tsx` yet, so no fixture is due; `architecture.spec.ts` is satisfied by the spec beside the module.

---

### Task 6: `useTerritoryConversion`

**Files:**
- Create: `frontend-v2/src/pages/territory-conversion/model/use-territory-conversion.ts` (+ `use-territory-conversion.spec.tsx`)

**Interfaces:**
- Consumes: Task 4's `useJobStream`, Task 5's `phaseOf`/`shouldLeave`/`TerritoryConversionPageProps`; `territoryQuery`, `getTerritory`, `territoryPath` (`@/entities/territory`); `artifactsQuery`, `listArtifacts` (`@/entities/content`); `jobsQuery`, `listJobs`, `finishedSince` (`@/entities/conversion`); `HttpError`, `messageOf` (`@/shared/api`); `leaveTo`; `unanswered`.
- Produces: `useTerritoryConversion(slug: string, jobId: string | null): TerritoryConversionState`, where
  `TerritoryConversionState = { status: "loading" } | { status: "missing" } | { status: "unavailable"; error: string } | ({ status: "ready" } & TerritoryConversionPageProps)`.

- [ ] **Step 1: The spec** (red first). The mocking shape is
`pages/model-detail/model/use-model-detail.spec.tsx`'s: hoisted `vi.fn`s,
entity barrels mocked with `importOriginal` spread.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { useTerritoryConversion } from "./use-territory-conversion";

const { getTerritory, listArtifacts, listJobs, useJobStream, leaveTo } = vi.hoisted(() => ({
  getTerritory: vi.fn(),
  listArtifacts: vi.fn(),
  listJobs: vi.fn(),
  useJobStream: vi.fn(),
  leaveTo: vi.fn(),
}));
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTerritory,
}));
vi.mock("@/entities/content", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listArtifacts,
}));
vi.mock("@/entities/conversion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listJobs,
  useJobStream,
}));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));

const TERRITORY = { slug: "t", title: "Tenant A", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const LOD0 = { lod: 0, hash: "h0", size: 1, faces: 1, vertices: 1, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 1, z: 1 } };
const RUNNING = { kind: "territory", slug: "t", status: "running", progress: 0.4, stage: "parsing", errorMessage: null };
const FAILED = { kind: "territory", slug: "t", status: "failed", progress: null, stage: null, errorMessage: "blob not found" };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const render = (jobId: string | null = null) => renderHook(() => useTerritoryConversion("t", jobId), { wrapper });
const ready = async (r: ReturnType<typeof render>) => {
  await waitFor(() => expect(r.result.current.status).toBe("ready"));
  const s = r.result.current;
  if (s.status !== "ready") throw new Error("not ready");
  return s;
};

describe("useTerritoryConversion", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getTerritory.mockReset().mockResolvedValue(TERRITORY);
    listArtifacts.mockReset().mockResolvedValue([]);
    listJobs.mockReset().mockResolvedValue([]);
    useJobStream.mockReset().mockReturnValue(null);
    leaveTo.mockReset();
  });

  it("is loading until all three have answered, then queued with no record and no artifacts", async () => {
    const r = render();
    expect(r.result.current.status).toBe("loading");
    const s = await ready(r);
    expect(s.phase).toBe("queued");
    expect(s.job).toBeNull();
    expect(s.hasLod0).toBe(false);
    expect(s.territory).toEqual(TERRITORY);
  });

  it("is missing on a 404, unavailable on any other first failure", async () => {
    getTerritory.mockRejectedValue(new HttpError(404, null, "Territory not found"));
    const r = render();
    await waitFor(() => expect(r.result.current.status).toBe("missing"));

    getTerritory.mockResolvedValue(TERRITORY);
    listJobs.mockRejectedValue(new Error("jobs down"));
    const r2 = render();
    await waitFor(() => expect(r2.result.current).toEqual({ status: "unavailable", error: "jobs down" }));
  });

  it("reads the phase off the polled row: running, and failed with the worker's message", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    expect((await ready(render())).phase).toBe("running");

    listJobs.mockResolvedValue([FAILED]);
    listArtifacts.mockResolvedValue([LOD0]);
    const s = await ready(render());
    expect(s.phase).toBe("failed");
    expect(s.job?.errorMessage).toBe("blob not found");
    expect(s.hasLod0).toBe(true);
  });

  it("lets the stream outrank the poll once it has answered", async () => {
    listJobs.mockResolvedValue([{ ...RUNNING, progress: 0.1 }]);
    useJobStream.mockReturnValue({ ...RUNNING, progress: 0.9 });
    const s = await ready(render("j1"));
    expect(useJobStream).toHaveBeenCalledWith("j1", "t");
    expect(s.job?.progress).toBe(0.9);
  });

  it("does not leave on a mount that is already ready", async () => {
    listArtifacts.mockResolvedValue([LOD0]);
    const s = await ready(render());
    expect(s.phase).toBe("ready");
    expect(leaveTo).not.toHaveBeenCalled();
    s.onOpenViewer();
    expect(leaveTo).toHaveBeenCalledWith("/territories/t");
  });

  it("leaves for the viewer when a running conversion finishes on this page", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render();
    expect((await ready(r)).phase).toBe("running");

    listJobs.mockResolvedValue([]);
    listArtifacts.mockResolvedValue([LOD0]);
    await client.refetchQueries({ queryKey: ["jobs"] });
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/territories/t"));
    expect(listArtifacts).toHaveBeenCalledTimes(2); // finishedSince re-read the artifacts
  });

  it("keeps the page when a background refetch fails", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render();
    await ready(r);
    listJobs.mockRejectedValue(new Error("blip"));
    await client.refetchQueries({ queryKey: ["jobs"] });
    expect(r.result.current.status).toBe("ready");
  });
});
```

- [ ] **Step 2: The hook**:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { artifactsQuery, listArtifacts } from "@/entities/content";
import { finishedSince, jobsQuery, listJobs, useJobStream, type TargetJob } from "@/entities/conversion";
import { getTerritory, territoryPath, territoryQuery } from "@/entities/territory";
import { HttpError, messageOf } from "@/shared/api";
import { leaveTo } from "@/shared/lib/leave";
import { unanswered } from "@/shared/lib/unanswered";
import { phaseOf, shouldLeave, type Phase, type TerritoryConversionPageProps } from "./conversion-view";

export type { TerritoryConversionPageProps };

export type TerritoryConversionState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & TerritoryConversionPageProps);

/**
 * The conversion page's data: the territory, its artifacts, the job on
 * record (from the SSE channel when a jobId is known and answering,
 * otherwise the jobs poll), and the one decision to leave. Mirrors
 * useModelDetail — ready once every query has answered, missing only on a
 * genuine 404, and a background refetch failure never blanks the page.
 */
export function useTerritoryConversion(slug: string, jobId: string | null): TerritoryConversionState {
  const client = useQueryClient();
  // queryFn stays a direct import so a spec's vi.mock of the barrel reaches the fetch.
  const territory = useQuery({ ...territoryQuery(slug), queryFn: () => getTerritory(slug) });
  const artifacts = useQuery({ ...artifactsQuery("territory", slug), queryFn: () => listArtifacts("territory", slug) });
  const jobs = useQuery({ ...jobsQuery, queryFn: listJobs });
  const streamed = useJobStream(jobId, slug);

  // A target whose job just left the list has new artifacts (or, after a
  // failure, the same old ones): re-read them so the phase catches up.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug: targetSlug } of finishedSince(previousJobs.current, jobs.data)) {
      void client.invalidateQueries({ queryKey: ["artifacts", kind, targetSlug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);

  const polled = jobs.data?.find((j) => j.kind === "territory" && j.slug === slug);
  // The stream, once it has answered, is up to four seconds fresher than the poll.
  const job = streamed ?? polled;
  const hasLod0 = artifacts.data?.some((a) => a.lod === 0) ?? false;
  const phase: Phase | null = artifacts.data && jobs.data ? phaseOf(hasLod0, job) : null;

  const previousPhase = useRef<Phase | null>(null);
  useEffect(() => {
    if (phase === null) return;
    if (shouldLeave(previousPhase.current, phase)) leaveTo(territoryPath(slug));
    previousPhase.current = phase;
  }, [phase, slug]);

  const loading = territory.isPending || artifacts.isPending || jobs.isPending;
  const territoryError = unanswered(territory);
  if (loading) return { status: "loading" };
  if (territoryError instanceof HttpError && territoryError.status === 404) return { status: "missing" };
  const otherError = territoryError ?? unanswered(artifacts) ?? unanswered(jobs);
  if (otherError) return { status: "unavailable", error: messageOf(otherError) };

  return {
    status: "ready",
    territory: territory.data!,
    phase: phase!,
    job: job ?? null,
    hasLod0,
    onOpenViewer: () => leaveTo(territoryPath(slug)),
  };
}
```

(`HttpError` is `(status, body | null, message)` — `shared/api/http-error.ts:10`.)

Run → green. Break (replace `shouldLeave(previousPhase.current, phase)` with
`phase === "ready"`) → the "does not leave on a mount" case red → restore →
green.

- [ ] **Step 3: Commit** (`feat(frontend-v2): useTerritoryConversion — three queries, one stream, one decision to leave`).

---

### Task 7: The page, the actions, the screen, the fixture

**Files:**
- Create: `frontend-v2/src/pages/territory-conversion/ui/territory-conversion-page.tsx` (+ `.spec.tsx`)
- Create: `frontend-v2/src/pages/territory-conversion/ui/conversion-actions.tsx` (+ `.spec.tsx`)
- Create: `frontend-v2/src/pages/territory-conversion/ui/territory-conversion-screen.tsx` (+ `.spec.tsx`)
- Create: `frontend-v2/src/pages/territory-conversion/territory-conversion-page.fixture.tsx`
- Create: `frontend-v2/src/pages/territory-conversion/index.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`ProgressBar size="lg"`, `Callout title/mono/note`, `Pipeline`, `pipelineSteps`, `pipelineMeta`), Task 5 (`ledeOf`, `STATUS_PILL`, `progressCard`, `TerritoryConversionPageProps`), Task 6 (`useTerritoryConversion`), `PageHeader` (`@/widgets/page-header`), `ThemeToggle` (`@/features/theme-toggle`), `Badge`, `Skeleton`, `EmptyState` (`@/shared/ui/card`), `CatalogShell` (`@/widgets/catalog-shell`, fixture only).
- Produces: `TerritoryConversionPage(props: TerritoryConversionPageProps)`, `ConversionActions({ phase, slug, hasLod0, onOpenViewer })`, `TerritoryConversionScreen()`; barrel exports the screen, the page and the props type.

- [ ] **Step 1: `conversion-actions.spec.tsx`** (red first):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversionActions, FAILED_NOTE } from "./conversion-actions";

describe("ConversionActions", () => {
  it("offers a new source and the catalog after a failure, plus the viewer only when one exists", async () => {
    const onOpenViewer = vi.fn();
    const { rerender } = render(<ConversionActions phase="failed" slug="a b" hasLod0={false} onOpenViewer={onOpenViewer} />);
    expect(screen.getByRole("link", { name: "Upload a new source" })).toHaveAttribute("href", "/territories/a%20b/replace");
    expect(screen.getByRole("link", { name: "Back to catalog" })).toHaveAttribute("href", "/territories");
    expect(screen.queryByRole("button", { name: "Open the current viewer" })).not.toBeInTheDocument();
    expect(screen.getByText(FAILED_NOTE)).toBeInTheDocument();

    rerender(<ConversionActions phase="failed" slug="a b" hasLod0 onOpenViewer={onOpenViewer} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the current viewer" }));
    expect(onOpenViewer).toHaveBeenCalledTimes(1);
  });

  it("offers the viewer and the catalog once ready", async () => {
    const onOpenViewer = vi.fn();
    render(<ConversionActions phase="ready" slug="t" hasLod0 onOpenViewer={onOpenViewer} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the viewer" }));
    expect(onOpenViewer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to catalog" })).toBeInTheDocument();
    expect(screen.queryByText(FAILED_NOTE)).not.toBeInTheDocument();
  });

  it("draws nothing while waiting", () => {
    const { container } = render(<ConversionActions phase="running" slug="t" hasLod0={false} onOpenViewer={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: `conversion-actions.tsx`**. Hand-built controls in the mock's
geometry, the pattern Model Detail's Download GLB uses — `Button` takes no
`href`, and its own geometry is a filed follow-up; the three controls on one
row must match each other. A `<button>`, not an `<a>`, for the viewer: the
shell's click delegate would route a `/territories/{slug}` anchor straight
back into this page.

```tsx
import type { Phase } from "../model/conversion-view";

export type ConversionActionsProps = {
  phase: Phase;
  slug: string;
  hasLod0: boolean;
  onOpenViewer: () => void;
};

export const FAILED_NOTE =
  "A failed job cannot be restarted on its own — conversion begins again when a new archive is uploaded for this territory.";

const CONTROL = "inline-flex cursor-pointer items-center rounded-control border px-[18px] py-2.5 text-[13px] no-underline";
const PRIMARY = `${CONTROL} border-accent bg-accent font-semibold text-accent-fg`;
const SECONDARY = `${CONTROL} border-line-2 bg-panel-2 font-medium text-fg`;

/** The way forward after a failure or a finish; nothing while the job is still going. */
export function ConversionActions({ phase, slug, hasLod0, onOpenViewer }: ConversionActionsProps) {
  if (phase === "failed") {
    return (
      <>
        <div className="flex flex-wrap gap-[9px]">
          <a href={`/territories/${encodeURIComponent(slug)}/replace`} className={PRIMARY}>
            Upload a new source
          </a>
          <a href="/territories" className={SECONDARY}>
            Back to catalog
          </a>
          {hasLod0 ? (
            <button type="button" onClick={onOpenViewer} className={SECONDARY}>
              Open the current viewer
            </button>
          ) : null}
        </div>
        <p className="m-0 max-w-[60ch] text-[11px] leading-[1.55] text-muted">{FAILED_NOTE}</p>
      </>
    );
  }
  if (phase === "ready") {
    return (
      <div className="flex flex-wrap gap-[9px]">
        <button type="button" onClick={onOpenViewer} className={PRIMARY}>
          Open the viewer
        </button>
        <a href="/territories" className={SECONDARY}>
          Back to catalog
        </a>
      </div>
    );
  }
  return null;
}
```

Run → green; break (drop the `hasLod0` guard) → red → restore → green.

- [ ] **Step 3: `territory-conversion-page.spec.tsx`** (red first):

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TargetJob } from "@/entities/conversion";
import type { TerritoryConversionPageProps } from "../model/conversion-view";
import { TerritoryConversionPage, WAITING_NOTE } from "./territory-conversion-page";

const TERRITORY = { slug: "refinery-block-c", title: "Refinery Block C", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory", slug: "refinery-block-c", status: "running", progress: 0.58, stage: "lod-1", errorMessage: null, ...over,
});
const props = (over: Partial<TerritoryConversionPageProps> = {}): TerritoryConversionPageProps => ({
  territory: TERRITORY, phase: "running", job: job(), hasLod0: false, onOpenViewer: vi.fn(), ...over,
});

describe("TerritoryConversionPage", () => {
  it("draws the header: back link, eyebrow, title, the state pill, the meta line", () => {
    render(<TerritoryConversionPage {...props()} />);
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute("href", "/territories");
    expect(screen.getByText("Converting")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Refinery Block C" })).toBeInTheDocument();
    expect(screen.getByText("converting")).toBeInTheDocument();
    expect(screen.getByText("territory · refinery-block-c")).toBeInTheDocument();
  });

  it("running: the stage and percent over the bar, the pipeline at step 6, the waiting note", () => {
    render(<TerritoryConversionPage {...props()} />);
    expect(screen.getByRole("progressbar", { name: "Conversion progress" })).toHaveAttribute("aria-valuenow", "58");
    expect(screen.getByText("Building LOD 1")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("step 6 of 7")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Conversion pipeline" })).getAllByRole("listitem");
    expect(within(items[5]).getByText("running")).toBeInTheDocument();
    expect(screen.getByText(WAITING_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("queued: no bar, the waiting card, and the honest lede for a territory with no record", () => {
    render(<TerritoryConversionPage {...props({ phase: "queued", job: null })} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for a worker")).toBeInTheDocument();
    expect(screen.getByText("no progress reported")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.getByText(/no job has been recorded/)).toBeInTheDocument();
    expect(screen.getByText("7 steps · none started")).toBeInTheDocument();
  });

  it("failed: the worker's message as an alert, the stopped step, the actions, no waiting note", () => {
    render(
      <TerritoryConversionPage
        {...props({ phase: "failed", job: job({ status: "failed", stage: "compressing", progress: null, errorMessage: "ktx2: bad" }) })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Worker message")).toBeInTheDocument();
    expect(within(alert).getByText("ktx2: bad")).toBeInTheDocument();
    expect(screen.getByText("stopped at step 5 of 7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a new source" })).toBeInTheDocument();
    expect(screen.queryByText(WAITING_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("failed with no message and no stage — the live shape", () => {
    render(
      <TerritoryConversionPage
        {...props({ phase: "failed", job: job({ status: "failed", stage: null, progress: null, errorMessage: null }) })}
      />,
    );
    expect(screen.getByText("The worker reported no message.")).toBeInTheDocument();
    expect(screen.getByText("stopped before the first report")).toBeInTheDocument();
  });

  it("ready: the ok pill, a finished pipeline, the viewer button", () => {
    render(<TerritoryConversionPage {...props({ phase: "ready", job: null, hasLod0: true })} />);
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("7 steps · finished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the viewer" })).toBeInTheDocument();
    expect(screen.queryByText(WAITING_NOTE)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: `territory-conversion-page.tsx`**:

```tsx
import { clsx as cx } from "clsx";
import { Pipeline, pipelineMeta, pipelineSteps, type TargetJob } from "@/entities/conversion";
import { ThemeToggle } from "@/features/theme-toggle";
import { Badge } from "@/shared/ui/badge";
import { Callout } from "@/shared/ui/callout";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { PageHeader } from "@/widgets/page-header";
import { ledeOf, progressCard, STATUS_PILL, type TerritoryConversionPageProps } from "../model/conversion-view";
import { ConversionActions } from "./conversion-actions";

export const WAITING_NOTE =
  "This page opens the viewer by itself once the artifacts land — no need to reload. Closing the tab does not stop the job.";

/** The mock's progress card: the stage and the percent over the bar, or the waiting row alone. */
function ProgressPanel({ phase, job }: { phase: "queued" | "running"; job: TargetJob | null }) {
  const card = progressCard(phase, job);
  return (
    <div
      className={cx(
        "rounded-card border bg-panel px-[22px] py-5",
        phase === "running" ? "border-accent-line" : "border-line",
      )}
    >
      <ProgressBar
        size="lg"
        label={card.title}
        detail={card.detail}
        ariaLabel="Conversion progress"
        {...(card.value === undefined ? {} : { value: card.value })}
      />
    </div>
  );
}

/** The conversion page: header, lede, the failure box or the progress card, the pipeline, the way forward. */
export function TerritoryConversionPage({ territory, phase, job, hasLod0, onOpenViewer }: TerritoryConversionPageProps) {
  const pill = STATUS_PILL[phase];
  const waiting = phase === "queued" || phase === "running";
  const stage = job?.stage ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <PageHeader
        size="lg"
        eyebrow="Converting"
        title={territory.title}
        back={{ label: "← Territory catalog", href: "/territories" }}
        titleBadge={
          <Badge tone={pill.tone} fill={pill.fill} size="sm">
            {pill.label}
          </Badge>
        }
        meta={`territory · ${territory.slug}`}
        action={<ThemeToggle variant="compact" />}
      />
      <p className="m-0 max-w-[60ch] text-[13px] leading-[1.6] text-muted">
        {ledeOf(phase, { hasJob: job !== null, hasLod0 })}
      </p>
      {phase === "failed" ? (
        <Callout tone="bad" size="lg" title="Worker message" mono>
          {job?.errorMessage ?? "The worker reported no message."}
        </Callout>
      ) : null}
      {phase === "queued" || phase === "running" ? <ProgressPanel phase={phase} job={job} /> : null}
      <section aria-label="Pipeline">
        <div className="flex items-center gap-3 pt-0.5 pb-3">
          <span className="text-[13px] font-semibold">Pipeline</span>
          <span className="font-mono text-[10px] text-muted">{pipelineMeta(stage, phase)}</span>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>
        <Pipeline steps={pipelineSteps(stage, phase)} />
      </section>
      <ConversionActions phase={phase} slug={territory.slug} hasLod0={hasLod0} onOpenViewer={onOpenViewer} />
      {waiting ? (
        <Callout tone="warn" icon="info" size="note">
          {WAITING_NOTE}
        </Callout>
      ) : null}
    </div>
  );
}
```

(The `ProgressPanel` condition is spelled out inline rather than through
`waiting` so TypeScript narrows `phase` to `"queued" | "running"`.)

Run → green; break (drop the `job?.errorMessage ??` fallback) → red → restore → green.

- [ ] **Step 5: `territory-conversion-screen.spec.tsx`** (red first),
mocking as `model-detail-screen.spec.tsx` does:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerritoryConversionState } from "../model/use-territory-conversion";
import { TerritoryConversionScreen } from "./territory-conversion-screen";

const { useTerritoryConversion, useParams, useSearch } = vi.hoisted(() => ({
  useTerritoryConversion: vi.fn(),
  useParams: vi.fn(),
  useSearch: vi.fn(),
}));
vi.mock("../model/use-territory-conversion", () => ({ useTerritoryConversion }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => useParams(), useSearch: () => useSearch() }));

const TERRITORY = { slug: "t", title: "Tenant A", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const READY: TerritoryConversionState = { status: "ready", territory: TERRITORY, phase: "queued", job: null, hasLod0: false, onOpenViewer: vi.fn() };

describe("TerritoryConversionScreen", () => {
  it("hands the slug and the jobId from the URL to the hook", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSearch.mockReturnValue({ jobId: "j1" });
    useTerritoryConversion.mockReturnValue(READY);
    render(<TerritoryConversionScreen />);
    expect(useTerritoryConversion).toHaveBeenCalledWith("t", "j1");

    useSearch.mockReturnValue({});
    render(<TerritoryConversionScreen />);
    expect(useTerritoryConversion).toHaveBeenLastCalledWith("t", null);
  });

  it("shows a loading status, a not-found state with a way back, and an unavailable alert", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSearch.mockReturnValue({});
    useTerritoryConversion.mockReturnValue({ status: "loading" });
    const { rerender } = render(<TerritoryConversionScreen />);
    expect(screen.getByRole("status", { name: "Loading territory" })).toBeInTheDocument();

    useTerritoryConversion.mockReturnValue({ status: "missing" });
    rerender(<TerritoryConversionScreen />);
    expect(screen.getByText("Territory not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute("href", "/territories");

    useTerritoryConversion.mockReturnValue({ status: "unavailable", error: "gateway down" });
    rerender(<TerritoryConversionScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("Territory unavailable: gateway down");
  });

  it("renders the page once ready", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSearch.mockReturnValue({});
    useTerritoryConversion.mockReturnValue(READY);
    render(<TerritoryConversionScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Tenant A" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: `territory-conversion-screen.tsx`**:

```tsx
import { useParams, useSearch } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useTerritoryConversion } from "../model/use-territory-conversion";
import { TerritoryConversionPage } from "./territory-conversion-page";

/** Maps the container onto the page — loading skeleton, not-found, unavailable, or the page. */
export function TerritoryConversionScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { jobId } = useSearch({ strict: false }) as { jobId?: string };
  const s = useTerritoryConversion(slug, jobId ?? null);

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading territory" className="flex flex-col gap-3">
        <Skeleton height="34px" width="30%" />
        <Skeleton height="200px" />
      </div>
    );
  }

  if (s.status === "missing") {
    return (
      <EmptyState
        title="Territory not found"
        action={
          <a href="/territories" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg">
            ← Territory catalog
          </a>
        }
      />
    );
  }

  if (s.status === "unavailable") {
    return <Callout tone="bad">Territory unavailable: {s.error}</Callout>;
  }

  return (
    <TerritoryConversionPage
      territory={s.territory}
      phase={s.phase}
      job={s.job}
      hasLod0={s.hasLod0}
      onOpenViewer={s.onOpenViewer}
    />
  );
}
```

- [ ] **Step 7: Barrel and fixture.**

`index.ts`:

```ts
export { TerritoryConversionPage, type TerritoryConversionPageProps } from "./ui/territory-conversion-page";
export { TerritoryConversionScreen } from "./ui/territory-conversion-screen";
```

(`territory-conversion-page.tsx` must `export type { TerritoryConversionPageProps }` re-exported from the model — add that line to the page file.)

`territory-conversion-page.fixture.tsx` — every state in the shell, and the
failed row copied from the live gateway:

```tsx
import type { TargetJob } from "@/entities/conversion";
import { CatalogShell } from "@/widgets/catalog-shell";
import type { Phase } from "./model/conversion-view";
import { TerritoryConversionPage } from "./ui/territory-conversion-page";

const TERRITORY = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: `9f1c${"0".repeat(56)}82ab`,
  placementCount: 0,
};

const running: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "running", progress: 0.58, stage: "lod-1", errorMessage: null };
const queued: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "pending", progress: null, stage: null, errorMessage: null };
const failed: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "failed", progress: null, stage: "compressing", errorMessage: "ktx2: unsupported pixel format in tank_albedo_04.tga" };
// GET /api/jobs for cotest on 2026-09-07 — no stage, no progress, only the message.
const failedLive: TargetJob = { kind: "territory", slug: TERRITORY.slug, status: "failed", progress: null, stage: null, errorMessage: "fetch/extract source: blob get: blobstore: blob not found" };

const noop = () => {};

const page = (phase: Phase, job: TargetJob | null, hasLod0 = false) => (
  <CatalogShell>
    <TerritoryConversionPage territory={TERRITORY} phase={phase} job={job} hasLod0={hasLod0} onOpenViewer={noop} />
  </CatalogShell>
);

export default {
  running: page("running", running),
  queued: page("queued", queued),
  "queued, no record": page("queued", null),
  failed: page("failed", failed),
  "failed, previous revision live": page("failed", failed, true),
  "failed, no stage (live shape)": page("failed", failedLive),
  ready: page("ready", null, true),
};
```

- [ ] **Step 8: Suite and Cosmos.** `yarn vitest run src/pages/territory-conversion src/fixtures.spec.tsx src/architecture.spec.ts` green. Measure in Cosmos, both themes, `running` and `failed`:

```
python3 measure.py src/pages/territory-conversion/territory-conversion-page.fixture.tsx running 'main > div' maxWidth,rowGap
python3 measure.py src/pages/territory-conversion/territory-conversion-page.fixture.tsx running '[role=progressbar]' height
python3 measure.py src/pages/territory-conversion/territory-conversion-page.fixture.tsx running 'h1' fontSize,marginTop
python3 measure.py src/pages/territory-conversion/territory-conversion-page.fixture.tsx failed '[role=alert]' paddingTop,paddingLeft,borderRadius
python3 measure.py src/pages/territory-conversion/territory-conversion-page.fixture.tsx failed 'a.rounded-control,button.rounded-control' paddingTop,paddingLeft,borderRadius,fontSize,fontWeight
```
Expected: column `760px` / `20px`; bar `8px`; h1 `34px` (the accepted
deviation), `margin-top 10px`; alert `14/16/12`; controls `10/18/8`, 13 px,
600 then 500. Screenshots of all seven states beside the mock; the h1
top-offset inside `<main>` must be the same `97px` the sibling pages show.

- [ ] **Step 9: Lint and commit** (`feat(frontend-v2): the territory conversion page — header, progress, pipeline, the way forward`).

---

### Task 8: The route, the guard, four navigations, a live smoke

**Files:**
- Modify: `frontend-v2/src/app/router/catalog-routes.tsx`, `router.tsx`
- Modify: `frontend-v2/src/app/router/guard.ts` (+ `guard.spec.ts`)
- Modify: `frontend-v2/src/pages/upload-territory/model/use-upload-territory.ts` (+ `.spec.tsx`)
- Modify: `frontend-v2/src/pages/replace-source/model/use-replace-source.ts` (+ `.spec.tsx`)
- Modify: `frontend-v2/src/pages/territory-catalog/ui/territory-catalog-screen.tsx` (+ `.spec.tsx`)
- Modify: `frontend-v2/src/pages/content/ui/content-screen.tsx` (+ `.spec.tsx`)

**Interfaces:**
- Consumes: Task 7's `TerritoryConversionScreen`.
- Produces: `territoryRoute` (`/territories/$slug`, search `{ jobId?: string }`); `isCatalogHref("/territories/<slug>")` → `true`.

- [ ] **Step 1: `guard.spec.ts`** — flip and extend the existing case (red first):

```ts
  // A model page, a territory's replace form and the territory's own conversion page are all v2.
  it("matches a model page, a territory's replace form and a territory page", () => {
    expect(isCatalogHref("/models/pump")).toBe(true);
    expect(isCatalogHref("/models/pump?from=library")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge/replace")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge?jobId=abc")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge/other")).toBe(false);
    expect(isCatalogHref("/models/pump/extra")).toBe(false);
  });
```

`guard.ts`:

```ts
const MODEL_PAGE = /^\/models\/[^/]+$/;
const TERRITORY_PAGE = /^\/territories\/[^/]+$/;
const REPLACE_FORM = /^\/territories\/[^/]+\/replace$/;

/**
 * A catalog screen href, query string included: the four list/upload routes,
 * the account page and its two-factor wizard, a model's page, a territory's
 * replace form and a territory's own page — the conversion screen; a ready
 * territory's viewer is still the old SPA, and that page leaves for it itself.
 */
export const isCatalogHref = (href: string): boolean => {
  const path = href.split("?")[0];
  return (
    (CATALOG_PATHS as readonly string[]).includes(path) ||
    MODEL_PAGE.test(path) ||
    TERRITORY_PAGE.test(path) ||
    REPLACE_FORM.test(path)
  );
};
```

→ green.

- [ ] **Step 2: The route.** `catalog-routes.tsx` — import
`TerritoryConversionScreen` from `@/pages/territory-conversion` and add,
after `territoryNewRoute` (TanStack ranks by specificity; `/territories/new`
still wins over `$slug`):

```ts
// The upload and replace flows arrive with the job they just created, so the
// page can open its SSE channel at once; without one it reads the poll.
export const territoryRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/territories/$slug",
  validateSearch: (search: Record<string, unknown>): { jobId?: string } =>
    typeof search.jobId === "string" && search.jobId !== "" ? { jobId: search.jobId } : {},
  component: TerritoryConversionScreen,
});
```

`router.tsx`: add `territoryRoute` to the `catalogRoute.addChildren([...])`
list and to the import. Both files are exempt from the spec rule.

- [ ] **Step 3: The four navigations.** Each hook/screen spec currently mocks
`@/shared/lib/leave`; change the assertion to the router and keep a negative
assertion that `leaveTo` is not called.

`use-upload-territory.ts`: add `import { useNavigate } from "@tanstack/react-router";`, `const navigate = useNavigate();` at the top of the hook, remove the `leaveTo` import, and replace line 100:

```ts
      .then(({ territory, job }) =>
        navigate({ href: `/territories/${encodeURIComponent(territory.slug)}?jobId=${job.id}` }),
      )
```

Docblock: `-> creating -> (navigates to the territory's conversion page)`.
Spec: add `navigate` to the hoisted mocks, `vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))`, and at the three `leaveTo` assertions:

```ts
await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: "/territories/refinery-block-c?jobId=job-1" }));
expect(leaveTo).not.toHaveBeenCalled();
```

`use-replace-source.ts`: the same — `useNavigate`, and after the two invalidations:

```ts
        void navigate({ href: `/territories/${encodeURIComponent(replaced.slug)}?jobId=${job.id}` });
```

Spec line 114 becomes the `navigate` assertion plus `expect(leaveTo).not.toHaveBeenCalled()`.

`territory-catalog-screen.tsx:51`:

```tsx
        onOpen={(slug) => void navigate({ href: territoryPath(slug) })}
```

Spec: the `onOpen` case asserts `navigate` with `{ href: "/territories/<slug>" }` and `leaveTo` not called; if no other `leaveTo` remains in the file, delete its import and its mock.

`content-screen.tsx` — v2 now owns every href this screen builds, so all four `leaveTo` calls in it become `navigate`:

```tsx
            onSelect: () => void navigate({ href: contentPath(item) }),
          ...(href ? [{ label: "Replace source", onSelect: () => void navigate({ href }) }] : []),
        onReplaceSource={replace ? () => void navigate({ href: replace }) : undefined}
        onOpenInViewer={() => selected && void navigate({ href: contentPath(selected) })}
```

Delete the `leaveTo` import; spec assertions move to `navigate` with the
same hrefs. The "Artifacts, not status" comments stay — the conversion page
handles a converting or failed territory itself now, so `openable` may
simply become `!!selected`; make that change **only if** the existing spec
has a case for it to flip, and say so in the report either way.

Run each spec → green; break one (put `leaveTo` back in `use-upload-territory.ts`) → red → restore → green.

- [ ] **Step 4: Full gate on a quiet tree**

```
cd frontend-v2 && yarn lint && yarn test:coverage && yarn build
```
Coverage within 90/85/90/90. Paste the summary line.

- [ ] **Step 5: Live smoke** on the dev server (`yarn dev` on :3001 is normally up; check with `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/`). Python Playwright, headless, both themes:

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1100, "height": 900})
    pg.goto("http://localhost:3001/login"); pg.wait_for_load_state("networkidle")
    pg.get_by_label("Username or email").fill("cotest")   # read the real label off the form
    pg.get_by_label("Password").fill("Passw0rd!2026")
    pg.get_by_role("button", name="Sign in").click()
    pg.wait_for_url("**/territories**")
    pg.goto("http://localhost:3001/territories/tenant-a-scene"); pg.wait_for_load_state("networkidle")
    for theme in ("dark", "light"):
        pg.evaluate(f"document.documentElement.dataset.theme='{theme}'")
        print(theme, pg.get_by_role("alert").inner_text())
        print(theme, pg.get_by_text("stopped before the first report").count())
        print(theme, pg.locator("h1").evaluate("e => [getComputedStyle(e).fontSize, e.getBoundingClientRect().top]"))
        pg.screenshot(path=f"live-failed-{theme}.png", full_page=True)
    # The catalog card now stays in the SPA: no full navigation.
    pg.goto("http://localhost:3001/territories"); pg.wait_for_load_state("networkidle")
    pg.once("framenavigated", lambda f: print("FULL NAVIGATION", f.url))
    pg.get_by_role("link", name="tenant-a-scene").first.click()
    pg.wait_for_url("**/territories/tenant-a-scene")
    print("in-app", pg.url)
    b.close()
```

Expected: the alert reads `Worker message` + the real blob-not-found text;
the meta line is present; h1 `34px` at top `97px`; no `FULL NAVIGATION`
line. Adjust the login selectors to the real form labels — read them, do
not guess. Report the printed lines.

- [ ] **Step 6: Commit** (`feat(frontend-v2): /territories/{slug} is v2 — the route, the guard, and four navigations that no longer leave`).

---

### Task 9: Docs

**Files:**
- Modify: `frontend-v2/CLAUDE.md`
- Modify: `CLAUDE.md` (root, the "Two frontends" paragraph)
- Modify: `frontend-v2/README.md` (wherever it lists routes or `leaveTo`)

- [ ] **Step 1: `frontend-v2/CLAUDE.md`.**
  - In the **Routes** paragraph, add `/territories/$slug` (search `?jobId=`, validated by the route) to the catalog-shell list, and rewrite the sentence "`/territories/<slug>` alone still leaves — the territory viewer stays in the old SPA" to: "`/territories/<slug>` is the conversion page now; a ready territory's viewer is still the old SPA, and only that page leaves for it, through `leaveTo`, on a finish it watched or on its own button."
  - Add a paragraph to **What is wired**, after Model Detail / Replace Source:

    > **Territory conversion** (`/territories/{slug}`) is three queries plus one stream: the territory, its artifacts, `GET /api/jobs`, and — with `?jobId=` — the job's SSE channel (`openJobStream`/`useJobStream` in `entities/conversion`). The stream, once it has answered, outranks the polled row; when the channel is lost (the gateway's `event: error` for an unknown or foreign id, or a dropped connection) the hook forgets its frame so the poll wins again. **A page that mounts already ready does not leave** — `shouldLeave(prev, next)` fires only on `queued|running → ready` watched on this page, because in dev a `location.assign` to the same URL reloads v2 and would loop. The pipeline is the worker's real order (`entities/conversion/model/pipeline.ts`), not the mock's: `lod-N` comes after encoding and compressing and arrives twice, and `registering` only with `succeeded`. **A failed job may carry no stage and no progress** — `tenant-a-scene`'s live row is exactly that — so the meta line has a `stopped before the first report` form and no step is marked. Upload Territory and Replace Source navigate here instead of leaving; `leaveTo` has one caller left, this page.
  - In **Not done yet**, the viewer line stays; add that `useJobStream` is the only `EventSource` in v2 and that jsdom has none (the gateway answers a no-op closer).
- [ ] **Step 2: root `CLAUDE.md`** — in the "Two frontends" paragraph, after the `/account` sentence: "`/territories/{slug}` is the conversion-pending page (SSE by `jobId`, the jobs poll as the fallback); the 3D viewer at that URL is still `frontend/`." And in the "Backend gateway endpoints" list, under `GET /api/jobs/{id}/events`: "An unknown or foreign id answers one `event: error` frame and closes; v2 treats it as 'use the poll'."
- [ ] **Step 3: `frontend-v2/README.md`** — `grep -n "two-factor\|leaveTo\|territories" README.md`; add the route to any table that lists the others.
- [ ] **Step 4: Commit** (`docs: the territory conversion page, the stream-over-poll rule, and why a ready mount never leaves`) by path: `git add frontend-v2/CLAUDE.md frontend-v2/README.md CLAUDE.md`.

---

## Self-review against the spec

- §1 route/navigation → Task 8. §2 stream, merge (folded into the hook as
  `streamed ?? polled`, tested as "the stream outranks the poll"), pipeline
  model, `StageState.failed`, the hook → Tasks 3, 4, 6. §3 `ProgressBar lg`,
  `Callout`, `Pipeline`, page layout → Tasks 1, 2, 3, 7. §4 copy → Task 5
  (lede, pill, card), Task 7 (notes, header, missing/unavailable). §5 out
  of scope — nothing planned for it. §6 testing → every task; the live
  review with a running job is the final reviewer's, on top of Task 8's
  smoke against the real failed job.
- Deviations from the spec's letter, each argued in its task: the waiting
  callout's exact geometry is `size="note"` rather than a `className`
  (clsx); `mergeJob` is one `??` in the hook rather than a module.
- Names used across tasks: `openJobStream`/`useJobStream`/`StreamEnd`
  (4 → 6), `pipelineSteps`/`pipelineMeta`/`PipelinePhase` (3 → 7),
  `phaseOf`/`shouldLeave`/`ledeOf`/`STATUS_PILL`/`progressCard`/
  `TerritoryConversionPageProps` (5 → 6, 7), `TerritoryConversionState`
  (6 → 7), `TerritoryConversionScreen` (7 → 8). `Phase` and
  `PipelinePhase` are the same four words; the page passes its `Phase`
  straight into `pipelineSteps`.
