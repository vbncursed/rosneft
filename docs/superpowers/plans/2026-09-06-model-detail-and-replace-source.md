# Model Detail and Replace Source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The model page (`/models/{slug}`) and the territory replace-source form (`/territories/{slug}/replace`) exist in frontend-v2, built to their v2 mocks in the catalog shell against the real gateway, frontend-only.

**Architecture:** One task adds the one missing `shared/ui` piece (`ArtifactRow`) and two `PageHeader` props. One task adds the entity getters/mutations (`getModel`, `updateModel`, `getTerritory`, `replaceTerritorySource`), widens `Artifact`, adds `assetUrl`/`assetSize`, and lifts `UploadProgressPanel` + `progressFor` into `entities/upload`. One task teaches the guard the two new hrefs, splits the catalog routes out of `routes.tsx`, and turns the two catalogs' old-SPA links into router navigations. Two page tasks then follow the established shape (pure model + hook + props-only page + screen + fixture) and land their own route entries. A docs task closes it.

**Tech Stack:** frontend-v2 React 19 + TypeScript + TanStack Router/Query + Tailwind v4 + vitest/Testing Library + Cosmos. No backend changes.

**Spec:** `docs/superpowers/specs/2026-09-06-model-detail-and-replace-source-design.md` — the mocks' measurements are in `.superpowers/sdd/2026-09-06-model-detail-and-replace-source/mocks/*.md` (working copies; the originals are in the Claude Design project).

## Global Constraints

- Branch `feat/frontend-v2-design-system`. Stage by path only: `git add frontend-v2` (and `docs/…` for the docs task). **Never stage `.claude/settings.json` or `backend/go.work.sum`.** A parallel session may work in `backend/`.
- `yarn`, never `npm`; from `frontend-v2/`: `yarn lint` (`tsc -b --noEmit && oxlint`) and `yarn test:coverage` (90/85/90/90) green before every commit; `git commit --no-verify` with the body line "Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes." 200-line cap hand-checked (skip blanks/comments). `src/architecture.spec.ts`: spec per module, one Cosmos fixture per JSX slice (`<slice>.fixture.tsx` at the slice root), imports inward only (`shared → entities → features → widgets → pages → app`), never past another slice's `index.ts`. `src/fixtures.spec.tsx` renders every fixture. Wiring modules go in `frontend-v2/exempt-modules.ts`.
- Design tokens only (`bg, panel, panel-2, line, line-2, fg, muted, dim, accent, accent-fg, accent-soft, accent-line, ok/warn/bad(+-soft), grid, elevation`); `font-sans`/`font-mono`; `rounded-card` = 12px. Measurements from the mock summaries, verbatim where given.
- **clsx does not merge.** Two utilities on one CSS property in one `cx(...)` are resolved by the compiled stylesheet's order, not the string's: a conditional utility on a property the base also sets must be a ternary (`over ? "border-accent" : "border-line"`), never `"border-line", over && "border-accent"`.
- Accessible names unique on a screen; state never by colour alone; specs assert roles/labels/values, not classes (except a deliberate token test). Visual fixes are verified in Cosmos (port 5100) with Playwright computed style (`--hide-scrollbars`), never in jsdom.
- Copy verbatim from the mock summaries and the spec (ledes, stage labels, checklist items, callout text, button labels).
- Live check for every page task against the compose stack (gateway :8080, `yarn dev` :3001, Root `admin` / `change-me-now`, Company Owner `cotest` / `Passw0rd!2026`, login JSON field `identifier`, label "Email or username"), both themes, screenshot beside the mock, `console`/`pageerror` listeners clean. Throwaway territories/models are deleted afterwards.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef
  ```
- Skills each implementer and reviewer loads first via the Skill tool: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`.

---

## File map

**Task 1 (shared/ui, widgets):** new `shared/ui/artifact-row/{index.ts, artifact-row.tsx, artifact-row.spec.tsx, artifact-row.fixture.tsx}`; `widgets/page-header/ui/page-header.tsx` (+ spec), `widgets/page-header/page-header.fixture.tsx`.

**Task 2 (entities):** `entities/model/api/models-gateway.ts` (+ spec), new `entities/model/api/model-query.ts` (+ spec), `entities/model/index.ts`; `entities/territory/api/territories-gateway.ts` (+ spec), new `entities/territory/api/territory-query.ts` (+ spec), `entities/territory/index.ts`; `entities/content/model/artifact.ts`, `entities/content/api/artifacts-gateway.ts` (+ spec), new `entities/content/api/assets.ts` (+ spec), `entities/content/index.ts`; `shared/api/client.ts` (+ spec, `httpHead`), `shared/api/index.ts`; new `entities/upload/ui/upload-progress-panel.tsx` (+ spec), new `entities/upload/model/progress-line.ts` (+ spec), `entities/upload/upload.fixture.tsx`, `entities/upload/index.ts`; `pages/upload-territory/model/upload-form.ts` (+ spec), `pages/upload-territory/ui/upload-territory-page.tsx`, delete `pages/upload-territory/ui/upload-progress.{tsx,spec.tsx}`.

**Task 3 (guard, routes, links):** `app/router/guard.ts` (+ spec), new `app/router/catalog-routes.tsx`, `app/router/routes.tsx`, `app/router/router.tsx` (the tree), `exempt-modules.ts`; `pages/model-library/ui/model-library-screen.tsx` (+ spec); `pages/territory-catalog/ui/territory-catalog-screen.tsx` (+ spec).

**Task 4 (Model Detail):** new `pages/model-detail/{index.ts, model/detail.ts (+spec), model/use-model-detail.ts (+spec), ui/model-detail-page.tsx (+spec), ui/model-viewport.tsx (+spec), ui/model-aside.tsx (+spec), ui/model-detail-screen.tsx (+spec), model-detail-page.fixture.tsx}`; route leaf in `catalog-routes.tsx`.

**Task 5 (Replace Source):** new `pages/replace-source/{index.ts, model/replace-form.ts (+spec), model/use-replace-source.ts (+spec), ui/replace-source-page.tsx (+spec), ui/source-pair.tsx (+spec), ui/replace-aside.tsx (+spec), ui/replace-source-screen.tsx (+spec), replace-source-page.fixture.tsx}`; route leaf in `catalog-routes.tsx`.

**Task 6 (docs):** `frontend-v2/CLAUDE.md`, root `CLAUDE.md`, the spec's order-of-work ticks.

---

### Task 1: `ArtifactRow` and the `PageHeader` badge + meta

**Files:**
- Create: `frontend-v2/src/shared/ui/artifact-row/index.ts`, `artifact-row.tsx`, `artifact-row.spec.tsx`, `artifact-row.fixture.tsx`
- Modify: `frontend-v2/src/widgets/page-header/ui/page-header.tsx`, `page-header.spec.tsx`, `frontend-v2/src/widgets/page-header/page-header.fixture.tsx`

**Interfaces:**
- Produces:
  ```ts
  // shared/ui/artifact-row
  export type ArtifactRowProps = {
    tag: string;      // "LOD 0"
    file: string;     // "valve-assembly-lod0.glb"
    meta: string;     // "18 412 tris · full detail"
    size: string;     // "9.8 MB"
    /** When given the row is a download link (`download` attr = `file`). */
    href?: string;
    className?: string;
  };
  export function ArtifactRow(props: ArtifactRowProps): JSX.Element;
  // widgets/page-header — two new props
  titleBadge?: ReactNode;  // rendered beside the h1
  meta?: string;           // mono 11px muted line 8px under the title
  ```

- [x] **Step 1: Write the failing ArtifactRow spec**

`frontend-v2/src/shared/ui/artifact-row/artifact-row.spec.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactRow } from "./artifact-row";

const props = { tag: "LOD 1", file: "valve-lod1.glb", meta: "6 140 tris · mid range", size: "2.1 MB" };

describe("ArtifactRow", () => {
  it("prints the tag, file, meta and size", () => {
    render(<ArtifactRow {...props} />);
    expect(screen.getByText("LOD 1")).toBeInTheDocument();
    expect(screen.getByText("valve-lod1.glb")).toBeInTheDocument();
    expect(screen.getByText("6 140 tris · mid range")).toBeInTheDocument();
    expect(screen.getByText("2.1 MB")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is a download link named by its file when given an href", () => {
    render(<ArtifactRow {...props} href="/api/assets/abc" />);
    const link = screen.getByRole("link", { name: /valve-lod1\.glb/ });
    expect(link).toHaveAttribute("href", "/api/assets/abc");
    expect(link).toHaveAttribute("download", "valve-lod1.glb");
  });

  it("truncates a long file name rather than wrapping it", () => {
    render(<ArtifactRow {...props} file="a-very-long-file-name-that-does-not-fit-lod1.glb" />);
    expect(screen.getByText(/a-very-long/)).toHaveClass("truncate");
  });
});
```

- [x] **Step 2: Run it — expect FAIL (module not found)**

`cd frontend-v2 && yarn vitest run src/shared/ui/artifact-row`

- [x] **Step 3: Implement**

`artifact-row.tsx`:
```tsx
import { clsx as cx } from "clsx";

export type ArtifactRowProps = {
  tag: string;
  file: string;
  meta: string;
  size: string;
  /** When given the row is a download link; the `download` attribute is the file name. */
  href?: string;
  className?: string;
};

const ROW =
  "flex items-center gap-[11px] rounded-[9px] border bg-panel-2 px-3 py-2.5 text-fg no-underline";

/** One converted LOD as the gallery's "Artifact row" draws it — a tag, the file, a meta line and its size. */
export function ArtifactRow({ tag, file, meta, size, href, className }: ArtifactRowProps) {
  const body = (
    <>
      <span className="shrink-0 rounded-[5px] border border-line-2 px-[7px] py-0.5 font-mono text-[9px] tracking-[0.1em] text-muted">
        {tag}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px]">{file}</span>
        <span className="mt-[3px] block font-mono text-[10px] text-muted">{meta}</span>
      </span>
      <span className="whitespace-nowrap font-mono text-[10px] text-muted">{size}</span>
    </>
  );
  // One property, one branch: the hover border is a ternary against the base
  // border rather than a second utility beside it (clsx does not merge).
  if (href) {
    return (
      <a
        href={href}
        download={file}
        className={cx(
          ROW,
          "border-line hover:border-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
      >
        {body}
      </a>
    );
  }
  return <div className={cx(ROW, "border-line", className)}>{body}</div>;
}
```
`index.ts`: `export { ArtifactRow, type ArtifactRowProps } from "./artifact-row";`

`artifact-row.fixture.tsx`:
```tsx
import { ArtifactRow } from "./artifact-row";

export default (
  <div className="flex max-w-[360px] flex-col gap-2 p-6">
    <ArtifactRow tag="LOD 0" file="valve-assembly-lod0.glb" meta="18 412 tris · full detail" size="9.8 MB" href="#" />
    <ArtifactRow tag="LOD 1" file="valve-assembly-lod1.glb" meta="6 140 tris · mid range" size="2.1 MB" href="#" />
    <ArtifactRow
      tag="LOD 2"
      file="a-much-longer-model-name-than-fits-in-the-column-lod2.glb"
      meta="1 320 tris · far range"
      size="412 KB"
    />
  </div>
);
```

- [x] **Step 4: Run the spec — expect PASS**

- [x] **Step 5: Write the failing PageHeader spec additions**

Append to `page-header.spec.tsx`:
```tsx
  it("draws a badge beside the title and a meta line under it", () => {
    render(
      <PageHeader
        eyebrow="Model"
        title="Valve Assembly"
        titleBadge={<span>ready</span>}
        meta="valve-assembly · 3 LODs · 12 MB"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Valve Assembly" })).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("valve-assembly · 3 LODs · 12 MB")).toBeInTheDocument();
  });
```

- [x] **Step 6: Run it — expect FAIL (badge/meta not rendered)**

- [x] **Step 7: Implement in `page-header.tsx`**

Add to `PageHeaderProps`:
```ts
  /** A status pill beside the title, e.g. the model page's ready/converting/failed. */
  titleBadge?: ReactNode;
  /** The mono line under the title: slug, counts, dates. */
  meta?: string;
```
Replace the `<h1 …>{title}</h1>` line with:
```tsx
        {titleBadge ? (
          <div className="flex flex-wrap items-center gap-[11px]">
            <h1 className={cx("m-0 font-bold", TITLE[size])}>{title}</h1>
            {titleBadge}
          </div>
        ) : (
          <h1 className={cx("m-0 font-bold", TITLE[size])}>{title}</h1>
        )}
        {meta ? <p className="m-0 mt-2 font-mono text-[11px] text-muted">{meta}</p> : null}
```
(`mt-2` = 8px per the mock.) Destructure `titleBadge, meta` in the signature. Add a fixture state:
```tsx
    <PageHeader
      back={{ label: "← Model library", href: "#" }}
      eyebrow="Model"
      title="Valve Assembly"
      titleBadge={<Badge tone="ok" size="sm">ready</Badge>}
      meta="valve-assembly · 3 LODs · 12 MB · created 02.09"
      action={<Button>Download GLB</Button>}
    />
```
(import `Badge` from `@/shared/ui/badge`).

- [x] **Step 8: Run all page-header specs, then Cosmos check**

`yarn vitest run src/widgets/page-header src/shared/ui/artifact-row src/fixtures.spec.tsx src/architecture.spec.ts` — PASS.
Start Cosmos (`yarn cosmos`, port 5100, already `lazy:false`), open the artifact-row fixture with Playwright (`--hide-scrollbars`) and assert computed style of the first row: `border-radius: 9px`, `padding: 10px 12px`, the tag `font-size: 9px`, the file `font-size: 11px`, the size `font-size: 10px`; screenshot both themes into `.superpowers/sdd/2026-09-06-model-detail-and-replace-source/shots-task1/`.

- [x] **Step 9: Lint, coverage, commit**

```bash
cd frontend-v2 && yarn lint && yarn test:coverage
cd .. && git add frontend-v2 && git commit --no-verify -m "feat(frontend-v2): the artifact row, and a page header that carries a badge and a meta line

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 2: Entities — getters, mutations, artifact fields, asset helpers, the lifted progress panel

**Files:**
- Modify: `frontend-v2/src/shared/api/client.ts`, `client.spec.ts`, `index.ts`
- Modify: `frontend-v2/src/entities/model/api/models-gateway.ts` (+ spec), `entities/model/index.ts`; Create: `entities/model/api/model-query.ts` (+ spec)
- Modify: `frontend-v2/src/entities/territory/api/territories-gateway.ts` (+ spec), `entities/territory/index.ts`; Create: `entities/territory/api/territory-query.ts` (+ spec)
- Modify: `frontend-v2/src/entities/content/model/artifact.ts`, `entities/content/api/artifacts-gateway.ts` (+ spec), `entities/content/index.ts`; Create: `entities/content/api/assets.ts` (+ spec)
- Create: `frontend-v2/src/entities/upload/ui/upload-progress-panel.tsx` (+ spec), `entities/upload/model/progress-line.ts` (+ spec), `entities/upload/upload.fixture.tsx`; Modify: `entities/upload/index.ts`
- Modify: `frontend-v2/src/pages/upload-territory/model/upload-form.ts` (+ spec), `pages/upload-territory/ui/upload-territory-page.tsx`; Delete: `pages/upload-territory/ui/upload-progress.tsx`, `upload-progress.spec.tsx`

**Interfaces:**
- Produces:
  ```ts
  // shared/api
  export function httpHead(path: string): Promise<Headers>;
  // entities/model
  export const getModel: (slug: string) => Promise<Model>;                       // GET /api/models/{slug}
  export const updateModel: (slug: string, patch: { thumbnailBlobHash: string }) => Promise<Model>; // PATCH
  export const modelQuery: (slug: string) => QueryOptions;                      // key ["model", slug]
  // entities/territory
  export const getTerritory: (slug: string) => Promise<Territory>;              // GET /api/territories/{slug}
  export const replaceTerritorySource: (slug: string, sourceBlobHash: string) => Promise<{ territory: Territory; job: { id: string } }>;
  export const territoryQuery: (slug: string) => QueryOptions;                  // key ["territory", slug]
  // entities/content
  export type Artifact = { lod: number; hash: string; size: number; faces: number; vertices: number;
                           bboxMin: { x: number; y: number; z: number }; bboxMax: { x: number; y: number; z: number } };
  export const assetUrl: (hash: string) => string;                              // `/api/assets/${hash}`
  export const assetSize: (hash: string) => Promise<number | null>;             // HEAD Content-Length, null on any failure
  // entities/upload
  export type UploadProgressView = { value: number; header: string; stats: string[] };
  export function progressLine(p: UploadProgress, stats: { bytesPerSecond: number | null; etaSeconds: number | null }): { header: string; stats: string[] };
  export function progressFor(busy: boolean, progress: UploadProgress | null, samples: UploadSample[]): UploadProgressView | undefined;
  export type UploadProgressPanelProps = { busy: boolean; progress?: UploadProgressView; canSubmit: boolean; submitLabel: string; busyLabel?: string; cancelLabel?: string; onSubmit: () => void; onCancel: () => void };
  export function UploadProgressPanel(props: UploadProgressPanelProps): JSX.Element;
  ```
  `progressFor`'s first argument is `busy` (true while uploading/finalizing) — the page decides which phases count, the entity no longer knows the phase union.

- [x] **Step 1: `httpHead` — failing spec in `client.spec.ts`**

```ts
  it("HEADs a path and hands back the response headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Length": "1234" } }));
    const headers = await httpHead("/api/assets/abc");
    expect(headers.get("Content-Length")).toBe("1234");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assets/abc");
    expect(init.method).toBe("HEAD");
    expect(new Headers(init.headers)).not.toHaveProperty("X-CSRF-Token");
  });
```
(Use the file's existing `fetchMock` fixture and import `httpHead` from `./client`.)

- [x] **Step 2: Implement `httpHead` in `client.ts`**

```ts
/** The response headers of a HEAD — a blob's `Content-Length` without its bytes. */
export async function httpHead(path: string): Promise<Headers> {
  const res = await fetch(`${API_BASE}${path}`, { method: "HEAD" });
  if (!res.ok) throw new HttpError(res.status, null, res.statusText || `Request failed (${res.status})`);
  return res.headers;
}
```
Export it from `shared/api/index.ts`. (Not through `send`: there is no body to parse, and a 401 on an asset HEAD must not bounce the page — `assetSize` swallows it.)

- [x] **Step 3: Model gateway — failing specs**

Append to `models-gateway.spec.ts`:
```ts
  it("gets one model by slug, encoded", async () => {
    fetchMock.mockResolvedValueOnce(json(model));
    const out = await getModel("m 1");
    expect(request()).toEqual({ url: "/api/models/m%201", method: "GET" });
    expect(out.slug).toBe("m-1");
  });

  it("patches the thumbnail hash and maps the answer", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...model, thumbnailBlobHash: "t".repeat(64) }));
    const out = await updateModel("m-1", { thumbnailBlobHash: "t".repeat(64) });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/models/m-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ thumbnailBlobHash: "t".repeat(64) });
    expect(out.thumbnailBlobHash).toBe("t".repeat(64));
  });
```

- [x] **Step 4: Implement in `models-gateway.ts`**

```ts
export const getModel = async (slug: string): Promise<Model> =>
  toModel(await httpGet<ModelDto>(`/api/models/${encodeURIComponent(slug)}`));

export type ModelPatch = components["schemas"]["ModelUpdate"];

/** The only mutable field the gateway takes: the thumbnail; `""` removes it. */
export const updateModel = async (slug: string, patch: ModelPatch): Promise<Model> =>
  toModel(await httpPatch<ModelDto>(`/api/models/${encodeURIComponent(slug)}`, patch));
```
`model-query.ts`:
```ts
import { queryOptions } from "@tanstack/react-query";
import { getModel } from "./models-gateway";

export const modelQuery = (slug: string) =>
  queryOptions({ queryKey: ["model", slug], queryFn: () => getModel(slug) });
```
Spec `model-query.spec.ts`: key is `["model", "x"]` and `queryFn` calls `getModel("x")` (mock the gateway with `vi.mock("./models-gateway")`). Export `getModel, updateModel, type ModelPatch` and `modelQuery` from `entities/model/index.ts`.

- [x] **Step 5: Territory gateway — failing specs, then implement**

Spec additions (`territories-gateway.spec.ts`, same fixture shape as the models spec):
```ts
  it("gets one territory by slug, encoded", async () => {
    fetchMock.mockResolvedValueOnce(json(territory));
    const out = await getTerritory("t 1");
    expect(request()).toEqual({ url: "/api/territories/t%201", method: "GET" });
    expect(out.slug).toBe("t-1");
  });

  it("replaces the source and maps the territory and the job id", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ territory, job: { id: "j-9", kind: "territory", slug: "t-1", status: "queued" } }, 202),
    );
    const out = await replaceTerritorySource("t-1", "d".repeat(64));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/territories/t-1/source");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sourceBlobHash: "d".repeat(64) });
    expect(out).toEqual({ territory: expect.objectContaining({ slug: "t-1" }), job: { id: "j-9" } });
  });
```
Implementation:
```ts
export const getTerritory = async (slug: string): Promise<Territory> =>
  toTerritory(await httpGet<TerritoryDto>(`/api/territories/${encodeURIComponent(slug)}`));

/** Swaps the source archive; the territory keeps its slug and placements, and a new conversion job starts. */
export async function replaceTerritorySource(
  slug: string,
  sourceBlobHash: string,
): Promise<{ territory: Territory; job: { id: string } }> {
  const r = await httpPost<TerritoryCreatedDto>(`/api/territories/${encodeURIComponent(slug)}/source`, {
    sourceBlobHash,
  });
  return { territory: toTerritory(r.territory), job: { id: r.job.id } };
}
```
`territory-query.ts` mirrors `model-query.ts` (key `["territory", slug]`). Export from the barrel.

- [x] **Step 6: Artifact widening — failing spec, then implement**

Replace the artifacts gateway spec's expectation:
```ts
  it("asks the owner's route and maps every field the pages read", async () => {
    fetchMock.mockResolvedValueOnce(
      json([{ slug: "t", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 300, vertices: 12, faces: 4,
              bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 2, z: 3 } }]),
    );
    await expect(listArtifacts("territory", "t 1")).resolves.toEqual([
      { lod: 0, hash: "h", size: 300, vertices: 12, faces: 4, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 2, z: 3 } },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/territories/t%201/artifacts");
  });
```
Check `components["schemas"]["Artifact"]` in `shared/api/dto.ts` for the exact field names/optionality of `vertices`, `faces`, `bboxMin`, `bboxMax`; default a missing number to `0` and a missing vector to `{x:0,y:0,z:0}` in the mapper. `artifact.ts`:
```ts
export type Vec3 = { x: number; y: number; z: number };

/** One converted LOD: what the catalogs, the model page and the artifact rows read. */
export type Artifact = {
  lod: number;
  hash: string;
  size: number;
  vertices: number;
  faces: number;
  bboxMin: Vec3;
  bboxMax: Vec3;
};
```
`lodLabel`/`totalSize` unchanged. Fix any fixture/spec that builds an `Artifact` literal (`grep -rn "lod: 0, size" src`) — add the new fields there.

- [x] **Step 7: `assets.ts` — failing spec, then implement**

`assets.spec.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetSize, assetUrl } from "./assets";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("assets", () => {
  it("addresses a blob by hash", () => {
    expect(assetUrl("abc")).toBe("/api/assets/abc");
  });

  it("reads a blob's size off a HEAD", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Length": "2048" } }));
    await expect(assetSize("abc")).resolves.toBe(2048);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("HEAD");
  });

  it("answers null when the header is missing or the request fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(assetSize("abc")).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(assetSize("abc")).resolves.toBeNull();
  });
});
```
`assets.ts`:
```ts
import { httpHead } from "@/shared/api";

export const assetUrl = (hash: string) => `/api/assets/${encodeURIComponent(hash)}`;

/**
 * A blob's byte size without its bytes, or null: the API carries no source
 * size, and a size line that cannot be read prints "—" rather than failing
 * the page.
 */
export async function assetSize(hash: string): Promise<number | null> {
  try {
    const length = (await httpHead(assetUrl(hash))).get("Content-Length");
    const n = length === null ? NaN : Number(length);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
```
Export `assetSize, assetUrl` and `type Vec3` from `entities/content/index.ts`.

- [x] **Step 8: Lift `progressLine`/`progressFor` into `entities/upload/model/progress-line.ts`**

Move the two functions out of `pages/upload-territory/model/upload-form.ts` verbatim, except `progressFor`'s signature becomes `(busy: boolean, progress, samples)` with `if (!progress || !busy) return undefined;`. Move their tests from `upload-form.spec.ts` into `progress-line.spec.ts` (adjust the first argument: `true`/`false` instead of a phase). `upload-form.ts` keeps `canSubmit`, `fileMeta`, `stagesFor`, `ARCHIVE_CHECKLIST`, `UploadPhase`, `UploadForm`. Export `progressFor, progressLine, type UploadProgressView` from `entities/upload/index.ts`.

- [x] **Step 9: Lift the panel into `entities/upload/ui/upload-progress-panel.tsx`**

```tsx
import { Button } from "@/shared/ui/button";
import { ProgressBar } from "@/shared/ui/progress-bar";
import type { UploadProgressView } from "../model/progress-line";

export type UploadProgressPanelProps = {
  /** Bytes are moving (or the server is finalizing/creating): the submit shows its busy label and Cancel appears. */
  busy: boolean;
  progress?: UploadProgressView;
  /** Whether the idle submit may be pressed — irrelevant while busy. */
  canSubmit: boolean;
  submitLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  onSubmit: () => void;
  onCancel: () => void;
};

/** The bar-and-stats panel while bytes are moving, plus the submit/cancel row underneath. */
export function UploadProgressPanel({
  busy, progress, canSubmit, submitLabel, busyLabel = "Uploading…", cancelLabel = "Cancel", onSubmit, onCancel,
}: UploadProgressPanelProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {progress ? (
        <div className="flex flex-col gap-3.5 rounded-card border border-accent-line bg-panel px-[22px] py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[13px] font-semibold">Uploading</p>
            <p className="m-0 font-mono text-[11px] text-accent">{progress.header}</p>
          </div>
          <ProgressBar value={progress.value} tone="accent" ariaLabel="Upload progress" />
          <div className="flex flex-wrap gap-[18px] font-mono text-[10px] text-muted">
            {progress.stats.map((s) => <span key={s}>{s}</span>)}
          </div>
        </div>
      ) : null}
      <div className="flex gap-2.5">
        <Button variant="primary" loading={busy} disabled={!busy && !canSubmit} onClick={onSubmit}>
          {busy ? busyLabel : submitLabel}
        </Button>
        {busy ? <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button> : null}
      </div>
    </div>
  );
}
```
Move `pages/upload-territory/ui/upload-progress.spec.tsx` beside it as `upload-progress-panel.spec.tsx` (rewrite `phase="uploading"` → `busy`, add one case: `cancelLabel="Cancel upload"` renders that button name). Add `entities/upload/upload.fixture.tsx` (the slice now renders JSX, so architecture.spec demands a fixture): the panel idle with `submitLabel="Replace source"`, and busy at 41 % with the mock's stats `["chunk 71 / 175", "8 MB chunks", "24.6 MB/s", "~4 min left"]`. Export `UploadProgressPanel, type UploadProgressPanelProps` from the barrel. Delete the old panel files.

- [x] **Step 10: Re-point Upload Territory**

`upload-territory-page.tsx`: import `UploadProgressPanel` from `@/entities/upload`, pass `busy={phase === "uploading" || phase === "finalizing" || phase === "creating"}` and `submitLabel="Upload territory"`. `use-upload-territory.ts`: `progressFor(phase === "uploading" || phase === "finalizing", progress, samples)` imported from `@/entities/upload`. Run the whole `pages/upload-territory` suite — PASS unchanged.

- [x] **Step 11: Lint, coverage, commit**

```bash
cd frontend-v2 && yarn lint && yarn test:coverage
cd .. && git add frontend-v2 && git commit --no-verify -m "feat(frontend-v2): the model and territory getters, the replace-source and thumbnail mutations, artifact facts, asset size, and the upload panel lifted into the entity

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 3: Guard, catalog routes split, in-app links

**Files:**
- Modify: `frontend-v2/src/app/router/guard.ts:110-121`, `guard.spec.ts:171-185`
- Create: `frontend-v2/src/app/router/catalog-routes.tsx`; Modify: `app/router/routes.tsx`, `app/router/router.tsx`, `frontend-v2/exempt-modules.ts`
- Modify: `frontend-v2/src/pages/model-library/ui/model-library-screen.tsx` (+ spec), `pages/territory-catalog/ui/territory-catalog-screen.tsx` (+ spec)

**Interfaces:**
- Produces: `isCatalogHref` true for `/models/<slug>` (slug ≠ `new`) and `/territories/<slug>/replace`; `catalogRoute`, `territoriesRoute`, `territoryNewRoute`, `modelsRoute`, `modelNewRoute` exported from `catalog-routes.tsx` (Tasks 4 and 5 add `modelDetailRoute` and `territoryReplaceRoute` there and to the tree in `router.tsx`).

- [x] **Step 1: Failing guard spec**

Replace the "does not match a territory or model detail route" test with:
```ts
  // A model page and a replace form are v2 now; a territory's viewer still leaves.
  it("matches a model page and a territory's replace form, not the viewer", () => {
    expect(isCatalogHref("/models/pump")).toBe(true);
    expect(isCatalogHref("/models/pump?from=library")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge/replace")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge")).toBe(false);
    expect(isCatalogHref("/territories/north-ridge/other")).toBe(false);
    expect(isCatalogHref("/models/pump/extra")).toBe(false);
  });
```

- [x] **Step 2: Implement in `guard.ts`**

```ts
/** The catalog shell's exact routes — no sidebar, unlike the console. */
export const CATALOG_PATHS = ["/territories", "/territories/new", "/models", "/models/new"] as const;

const MODEL_PAGE = /^\/models\/[^/]+$/;
const REPLACE_FORM = /^\/territories\/[^/]+\/replace$/;

/**
 * A catalog screen href, query string included: the four list/upload routes,
 * a model's page and a territory's replace form. Deliberately not
 * `/territories/<slug>` — the viewer still leaves to the old SPA, so a click
 * on one must fall through to a real navigation.
 */
export const isCatalogHref = (href: string): boolean => {
  const path = href.split("?")[0];
  return (CATALOG_PATHS as readonly string[]).includes(path) || MODEL_PAGE.test(path) || REPLACE_FORM.test(path);
};
```
(`/models/new` is caught by the exact list first; the regex would match it too, which is harmless.) Run `guard.spec.ts` — PASS.

- [x] **Step 3: Split the catalog routes**

Create `app/router/catalog-routes.tsx` and move `catalogRoute`, `territoriesRoute`, `territoryNewRoute`, `modelsRoute`, `modelNewRoute` there verbatim (imports: `createRoute`, `redirect`, `meQuery`, `isAuthed`, the four screens, `CatalogShellRoute`, `redirectTarget`, and `rootRoute` from `./routes`). Update `router.tsx`'s tree imports to the new module. Add `"src/app/router/catalog-routes.tsx"` to `EXEMPT_MODULES` with the comment `// Wiring: the catalog subtree, split from routes.tsx at the 200-line cap; its decisions are in guard.ts.` Check `routes.tsx` no longer imports the four catalog screens.

- [x] **Step 4: In-app navigation from the two catalogs — failing specs**

`model-library-screen.spec.tsx`: find the test that expects `leaveTo("/models/…")` on open (grep `leaveTo`) and rewrite it to expect the mocked `useNavigate` to be called with `{ to: "/models/$slug", params: { slug: "pump-jack-unit" } }`; the spec already mocks `@tanstack/react-router` for `onUpload` — reuse that mock. `territory-catalog-screen.spec.tsx`: the replace test expects `navigate({ to: "/territories/$slug/replace", params: { slug } })`; `onOpen` keeps `leaveTo(territoryPath(slug))`.

- [x] **Step 5: Implement**

`model-library-screen.tsx`: `onOpen={(slug) => void navigate({ to: "/models/$slug", params: { slug } })}`; drop the `leaveTo`/`modelPath` imports if now unused. `territory-catalog-screen.tsx`: `onReplace={(slug) => void navigate({ to: "/territories/$slug/replace", params: { slug } })}`. Typed routes: until Tasks 4/5 register them the `to` literal is not in the route tree — TanStack's `navigate` typing then rejects it. Use `navigate({ href: \`/models/${encodeURIComponent(slug)}\` })` in both screens instead (the same shape `CatalogShellRoute` uses); spec expectations match on `href`.

- [x] **Step 6: Lint, coverage, commit**

```bash
cd frontend-v2 && yarn lint && yarn test:coverage
cd .. && git add frontend-v2 && git commit --no-verify -m "feat(frontend-v2): the guard knows a model page and a replace form, the catalog routes get their own module, and the catalogs stay in the app

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```
(Until Task 4 lands, a click on a model card navigates to an unregistered route and TanStack renders its not-found fallback. Tasks 3 and 4 are committed in sequence, so this window is only between commits.)

---

### Task 4: Model Detail page — `/models/$slug`

**Files:**
- Create: `frontend-v2/src/pages/model-detail/{index.ts, model/detail.ts, model/detail.spec.ts, model/use-model-detail.ts, model/use-model-detail.spec.tsx, ui/model-detail-page.tsx, ui/model-detail-page.spec.tsx, ui/model-viewport.tsx, ui/model-viewport.spec.tsx, ui/model-aside.tsx, ui/model-aside.spec.tsx, ui/model-detail-screen.tsx, ui/model-detail-screen.spec.tsx, model-detail-page.fixture.tsx}`
- Modify: `frontend-v2/src/app/router/catalog-routes.tsx`, `app/router/router.tsx`

**Interfaces:**
- Consumes: `getModel/modelQuery/updateModel/deleteModel` (entities/model), `artifactsQuery/assetUrl/conversionStatusOf/type Artifact` (entities/content), `jobsQuery/finishedSince/isLive/type TargetJob` (entities/conversion), `runChunkedUpload` (entities/upload), `meQuery` (entities/user), `ArtifactRow`, `PageHeader titleBadge/meta`, `formatSize/groupDigits` (widgets/viewer-panel), `formatBytes`, `shortDate`, `can`.
- Produces (`model/detail.ts`):
  ```ts
  export type DetailRowsInput = { model: Model; artifacts: Artifact[] };
  export const shortHash = (hash: string) => `sha256:${hash.slice(0, 4)}…${hash.slice(-4)}`;
  export const lod0 = (artifacts: Artifact[]) => artifacts.find((a) => a.lod === 0);
  export const artifactFile = (slug: string, lod: number) => `${slug}-lod${lod}.glb`;
  export const lodRange = (lod: number) => lod === 0 ? "full detail" : lod === 1 ? "mid range" : "far range";
  export function headerMeta(model: Model, artifacts: Artifact[]): string;
  // "valve-assembly · 3 LODs · 12 MB · created 02.09" — LOD/size segments only with artifacts, date only when createdAt parses
  export function aboutRows(model: Model, artifacts: Artifact[]): Detail[];
  // slug(accent), triangles(LOD0 faces, groupDigits) + bounds(formatSize(max-min)) when LOD 0 exists, hash(muted), placed
  export function artifactRows(slug: string, artifacts: Artifact[]): ArtifactRowProps[];   // sorted by lod, href = assetUrl(hash)
  export type ModelDetailPageProps = {
    model: Model; status: ConversionStatus; artifacts: Artifact[]; jobError: string | null;
    canDelete: boolean; canWrite: boolean; thumbnailBusy: boolean;
    onDelete: () => void; onThumbnail: (file: File) => void; onRemoveThumbnail: () => void;
  };
  ```

- [x] **Step 1: `detail.ts` — failing spec**

`detail.spec.ts` (representative cases; write all of them):
```ts
import { describe, expect, it } from "vitest";
import { aboutRows, artifactFile, artifactRows, headerMeta, lodRange, shortHash } from "./detail";

const model = { slug: "valve", title: "Valve", sourceBlobHash: "9f1c" + "0".repeat(56) + "82ab", usageCount: 2, createdAt: "2026-09-02T10:00:00Z" };
const art = (lod: number, faces = 100, size = 1024) => ({
  lod, hash: `h${lod}`, size, faces, vertices: faces * 2,
  bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1.2, y: 1.8, z: 0.9 },
});

describe("model detail facts", () => {
  it("shortens a hash to its ends", () => {
    expect(shortHash(model.sourceBlobHash)).toBe("sha256:9f1c…82ab");
  });

  it("names artifact files and ranges by lod", () => {
    expect(artifactFile("valve", 1)).toBe("valve-lod1.glb");
    expect([0, 1, 2, 3].map(lodRange)).toEqual(["full detail", "mid range", "far range", "far range"]);
  });

  it("builds the header meta from what exists", () => {
    expect(headerMeta(model, [art(0), art(1), art(2)])).toBe("valve · 3 LODs · 3 KB · created 02.09");
    expect(headerMeta({ ...model, createdAt: undefined }, [])).toBe("valve");
  });

  it("lists the about rows, with triangles and bounds only when LOD 0 exists", () => {
    const rows = aboutRows(model, [art(0, 18412)]);
    expect(rows.map((r) => r.label)).toEqual(["slug", "triangles", "bounds", "hash", "placed"]);
    expect(rows[1].value).toBe("18 412");
    expect(rows[2].value).toBe("1 / 2 / 1");
    expect(rows[4]).toEqual({ label: "placed", value: "in 2 territories", tone: "fg" });
    expect(aboutRows({ ...model, usageCount: 0 }, []).map((r) => r.label)).toEqual(["slug", "hash", "placed"]);
    expect(aboutRows({ ...model, usageCount: 0 }, []).at(-1)).toMatchObject({ value: "unused", tone: "muted" });
  });

  it("turns artifacts into download rows sorted by lod", () => {
    const rows = artifactRows("valve", [art(2), art(0, 18412, 9.8 * 1024 * 1024)]);
    expect(rows.map((r) => r.tag)).toEqual(["LOD 0", "LOD 2"]);
    expect(rows[0]).toMatchObject({ file: "valve-lod0.glb", meta: "18 412 tris · full detail", size: "9.8 MB", href: "/api/assets/h0" });
  });
});
```
`DetailTone` has no accent, so the slug row's value is a `<span className="text-accent">` (a `Detail.value` is a ReactNode) — assert its `label` only. `usageCount: 1` prints `in 1 territory`; add a test line for it. The module contains JSX: name it `detail.tsx` / `detail.spec.tsx`.

- [x] **Step 2: Implement `detail.ts`**

```ts
import { assetUrl, totalSize, type Artifact } from "@/entities/content";
import type { Model } from "@/entities/model";
import { formatBytes } from "@/shared/lib/format-bytes";
import { shortDate } from "@/shared/lib/short-date";
import type { ArtifactRowProps } from "@/shared/ui/artifact-row";
import type { Detail } from "@/shared/ui/detail-list";
import { formatSize, groupDigits } from "@/widgets/viewer-panel";

export const shortHash = (hash: string) => `sha256:${hash.slice(0, 4)}…${hash.slice(-4)}`;
export const lod0 = (artifacts: Artifact[]) => artifacts.find((a) => a.lod === 0);
export const artifactFile = (slug: string, lod: number) => `${slug}-lod${lod}.glb`;
export const lodRange = (lod: number) => (lod === 0 ? "full detail" : lod === 1 ? "mid range" : "far range");

/** "valve-assembly · 3 LODs · 12 MB · created 02.09" — only the segments that exist. */
export function headerMeta(model: Model, artifacts: Artifact[]): string {
  const date = shortDate(model.createdAt);
  return [
    model.slug,
    ...(artifacts.length ? [`${artifacts.length} LODs`, formatBytes(totalSize(artifacts))] : []),
    ...(date ? [`created ${date}`] : []),
  ].join(" · ");
}

const bounds = (a: Artifact) =>
  formatSize({ x: a.bboxMax.x - a.bboxMin.x, y: a.bboxMax.y - a.bboxMin.y, z: a.bboxMax.z - a.bboxMin.z });

export function aboutRows(model: Model, artifacts: Artifact[]): Detail[] {
  const base = lod0(artifacts);
  return [
    { label: "slug", value: <span className="text-accent">{model.slug}</span> },
    ...(base ? [{ label: "triangles", value: groupDigits(base.faces) }, { label: "bounds", value: bounds(base) }] : []),
    { label: "hash", value: shortHash(model.sourceBlobHash), tone: "muted" },
    model.usageCount > 0
      ? { label: "placed", value: `in ${model.usageCount} ${model.usageCount === 1 ? "territory" : "territories"}`, tone: "fg" }
      : { label: "placed", value: "unused", tone: "muted" },
  ];
}

export function artifactRows(slug: string, artifacts: Artifact[]): ArtifactRowProps[] {
  return [...artifacts]
    .sort((a, b) => a.lod - b.lod)
    .map((a) => ({
      tag: `LOD ${a.lod}`,
      file: artifactFile(slug, a.lod),
      meta: `${groupDigits(a.faces)} tris · ${lodRange(a.lod)}`,
      size: formatBytes(a.size),
      href: assetUrl(a.hash),
    }));
}
```
(Bounds print `"1 / 2 / 1"` because `formatSize` rounds — the same helper the territory inspector uses.)

- [x] **Step 3: Hook — failing spec**

`use-model-detail.spec.tsx` (mock pattern from `pages/upload-territory/model/use-upload-territory.spec.tsx`; `vi.mock` `@/entities/model` for `getModel/updateModel/deleteModel`, `@/entities/content` for `listArtifacts`, `@/entities/conversion` for `listJobs`, `@/entities/upload` for `runChunkedUpload`, `@tanstack/react-router` for `useNavigate`). Cases:
1. resolves `status: "ready"`, `model`, `artifacts`, `conversion: "ready"` once the three queries answer;
2. a live model job for the slug → `conversion: "converting"`, a failed one → `"failed"` with `jobError`;
3. a 404 from `getModel` → `status: "missing"`;
4. `onDelete` → `ask` sets `pending`, `confirm` calls `deleteModel(slug)`, then `navigate({ to: "/models" })` and `["models"]` invalidated;
5. `onThumbnail(file)` → `runChunkedUpload(file)` resolves `{ hash }` → `updateModel(slug, { thumbnailBlobHash: hash })` → `["model", slug]` and `["models"]` invalidated; `thumbnailBusy` true meanwhile;
6. `onRemoveThumbnail` → `updateModel(slug, { thumbnailBlobHash: "" })`;
7. a rejected `updateModel` toasts (`useNotices` shows an error) and clears `thumbnailBusy`;
8. `canDelete`/`canWrite` follow `model:delete`/`model:write` on the principal.

- [x] **Step 4: Implement `use-model-detail.ts`**

```ts
export type ModelDetailState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & ModelDetailPageProps & {
      pending: boolean; confirm: () => void; dismiss: () => void; deleteBusy: boolean;
    });

export function useModelDetail(slug: string): ModelDetailState
```
Body: `meQuery`, `modelQuery(slug)`, `artifactsQuery("model", slug)`, `jobsQuery`; `job = jobs.data?.find(j => j.kind === "model" && j.slug === slug)`; `conversion = conversionStatusOf(artifacts.length > 0, job)`; the `finishedSince` effect from `use-model-library.ts` copied (invalidate `["artifacts", kind, slug]`); `missing` when `unanswered(model)` is an `HttpError` with `status === 404`; `unavailable` on any other unanswered error; `useMutation`s for delete (`onSuccess`: `notify.success("Model deleted")`, invalidate `["models"]`, `navigate({ to: "/models" })`) and thumbnail (`mutationFn: async (file: File | null) => updateModel(slug, { thumbnailBlobHash: file ? (await runChunkedUpload(file, {})).hash : "" })`, `onSuccess`: invalidate `["model", slug]` and `["models"]`, `onError`: `notify.error(messageOf(err))`); `pending` is a `useState<boolean>` for the confirm dialog. Keep under 200 lines; if it grows, move the two mutations into `model/use-model-mutations.ts` (+ spec).

- [x] **Step 5: Page and parts — failing specs**

`model-viewport.spec.tsx`: with `thumbnailUrl` renders `<img alt={title}>`; without renders the text `no image`.
`model-aside.spec.tsx`: About shows the description or `No description.`; the `DetailList` rows by label; Artifacts heading `Artifacts` with `3 LODs` and three links named by file; no artifacts + `conversion: "pending"` → `Not converted yet`; `"failed"` → `Conversion failed` and the job error text; Thumbnail card: `replace`/`remove` buttons only with `canWrite` and a thumbnail, `upload` when none, `uploading…` disabled while busy; `remove` calls `onRemoveThumbnail`; choosing a file through the hidden input calls `onThumbnail(file)`.
`model-detail-page.spec.tsx`: h1 = title; badge text = status; meta line; `← Model library` link → `/models`; `Download GLB` link `href="/api/assets/h0"` + `download="valve-lod0.glb"`, absent without LOD 0; `Delete model` button present only with `canDelete`, disabled with `title="In use on 2 territories"` when `usageCount > 0`, calls `onDelete`.
`model-detail-screen.spec.tsx`: loading → `role="status"` skeleton; `missing` → `Model not found` + link `← Model library`; `unavailable` → bad Callout; ready → the page + `ConfirmDialog` when `pending`.

- [x] **Step 6: Implement the UI**

`model-viewport.tsx`:
```tsx
import { Icon } from "@/shared/ui/icon";

export type ModelViewportProps = { title: string; thumbnailUrl: string | null };

const GRID = {
  backgroundImage:
    "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

/** The mock's 560px viewport, holding the thumbnail: v2 has no 3D yet, and the model page never had one. */
export function ModelViewport({ title, thumbnailUrl }: ModelViewportProps) {
  return (
    <section
      aria-label="Preview"
      style={GRID}
      className="flex h-[560px] items-center justify-center overflow-hidden rounded-[14px] border border-line bg-panel-2"
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={title} className="size-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-3 text-line-2">
          <Icon name="cube" size={150} strokeWidth={0.7} />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">no image</span>
        </div>
      )}
    </section>
  );
}
```
(`Icon` spreads `...rest` onto the svg after `strokeWidth`, so a `strokeWidth` prop overrides the glyph's.)

`model-aside.tsx`: three `Card`-like panels (`rounded-card border border-line bg-panel p-[18px] flex flex-col gap-*`), overlines `font-mono text-[9px] uppercase tracking-[0.2em] text-muted`; About (`gap-3.5`, description `text-[13px] leading-[1.6]`, `<DetailList items={aboutRows(model, artifacts)} />`); Artifacts (`gap-3`; header row `flex items-baseline justify-between`; rows via `artifactRows(model.slug, artifacts).map((r) => <ArtifactRow key={r.tag} {...r} />)`; empty via `EmptyState layout="row" icon="cube" title="Not converted yet" description="Artifacts appear when the conversion finishes."`, failed via `title="Conversion failed" description={jobError ?? "The worker rejected the archive."}`); Thumbnail (`gap-3`; header action buttons are `<button type="button" className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent …">`; body `flex items-center gap-[13px]`: 62px square `rounded-[10px] border border-line-2 bg-panel-2` with `<img className="size-full rounded-[10px] object-cover" alt="">` or `<Icon name="cube" size={24} className="text-dim" />`; caption `text-[11px] leading-[1.45] text-muted`). The hidden `<input type="file" accept="image/*" className="sr-only" aria-label="Thumbnail file">` is clicked by the replace/upload button via a ref; `onChange` calls `onThumbnail(files[0])` and resets `value`. Split the thumbnail card into `ui/thumbnail-card.tsx` (+ spec) if `model-aside.tsx` passes 200 lines.

`model-detail-page.tsx`:
```tsx
<PageHeader
  eyebrow="Model"
  title={model.title}
  titleBadge={<Badge tone={BADGE_TONE[status]} size="sm">{status}</Badge>}
  meta={headerMeta(model, artifacts)}
  back={{ label: "← Model library", href: "/models" }}
  action={
    <div className="flex shrink-0 items-center gap-[9px]">
      <ThemeToggle variant="compact" />
      {base ? (
        <a href={assetUrl(base.hash)} download={artifactFile(model.slug, 0)}
           className="inline-flex items-center gap-[7px] rounded-control border border-line-2 bg-panel-2 px-3.5 py-2 text-[13px] text-fg no-underline hover:border-accent-line">
          <Icon name="download" size={14} />Download GLB
        </a>
      ) : null}
      {canDelete ? (
        <Button shape="icon" variant="danger" aria-label="Delete model"
                disabled={model.usageCount > 0}
                title={model.usageCount > 0 ? `In use on ${model.usageCount} territories` : undefined}
                onClick={onDelete}>
          <Icon name="trash" size={14} />
        </Button>
      ) : null}
    </div>
  }
/>
<div className="grid items-start gap-4 lg:grid-cols-[minmax(420px,1fr)_minmax(300px,360px)]">
  <ModelViewport title={model.title} thumbnailUrl={thumbnailUrl(model)} />
  <ModelAside … />
</div>
```
with `BADGE_TONE: Record<ConversionStatus, "ok" | "warn" | "bad" | "dim"> = { ready: "ok", converting: "warn", failed: "bad", pending: "dim" }` (pending shows `pending` in dim).

`model-detail-screen.tsx`: `const { slug } = useParams({ strict: false }) as { slug: string }` → `useModelDetail(slug)`; states as in the spec; `ConfirmDialog open title={\`Delete ${model.title}?\`} description="This cannot be undone." confirmLabel="Delete" tone="danger"`.

`model-detail-page.fixture.tsx`: export a map `{ ready, converting, noImage }` with an inline data-URI thumbnail (copy `PLACEHOLDER_THUMB` from the catalog-card fixture) and the mock's numbers (Valve Assembly, 18 412 / 6 140 / 1 320 tris, 9.8 MB / 2.1 MB / 412 KB, `usageCount: 2`).

- [x] **Step 7: Route leaf**

In `catalog-routes.tsx`:
```ts
export const modelDetailRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/models/$slug",
  component: ModelDetailScreen,
});
```
Add it to the tree in `router.tsx` beside `modelNewRoute`. `pages/model-detail/index.ts` exports `ModelDetailScreen`, `ModelDetailPage`, `type ModelDetailPageProps`.

- [x] **Step 8: Run everything, live check, commit**

`yarn lint && yarn test:coverage`. Live (dev stack): open `/models/<a ready slug>` from the library by click (no reload — watch the Network panel for a document request), both themes, screenshot beside `mocks/model-detail-v2.md`; Download GLB saves `<slug>-lod0.glb`; upload a thumbnail (any PNG), see the viewport and the library card update, remove it; open a converting model if one exists (or upload a throwaway via `/models/new` and open it while it converts — its badge must flip to `ready` without a reload); delete the throwaway from its page and land on `/models`. Screenshots to `.superpowers/sdd/2026-09-06-model-detail-and-replace-source/shots-task4/`.

```bash
git add frontend-v2 && git commit --no-verify -m "feat(frontend-v2): the Model page, live

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 5: Replace Source page — `/territories/$slug/replace`

**Files:**
- Create: `frontend-v2/src/pages/replace-source/{index.ts, model/replace-form.tsx, model/replace-form.spec.tsx, model/use-replace-source.ts, model/use-replace-source.spec.tsx, ui/replace-source-page.tsx, ui/replace-source-page.spec.tsx, ui/source-pair.tsx, ui/source-pair.spec.tsx, ui/replace-aside.tsx, ui/replace-aside.spec.tsx, ui/replace-source-screen.tsx, ui/replace-source-screen.spec.tsx, replace-source-page.fixture.tsx}`
- Modify: `frontend-v2/src/app/router/catalog-routes.tsx`, `app/router/router.tsx`

**Interfaces:**
- Consumes: `territoryQuery/replaceTerritorySource` (entities/territory), `assetSize` (entities/content), `runChunkedUpload/progressFor/UploadProgressPanel/type UploadProgress/type UploadSample` (entities/upload), `StageList/type ConversionStage/type StageState` (entities/conversion), `meQuery`, `DropZone`, `FileCard`, `Checklist`, `Callout`, `DetailList`, `PageHeader`, `leaveTo`, `notify`, `formatBytes`, `shortDate`, `can`.
- Produces (`model/replace-form.tsx` — it returns a ReactNode in `newRows`):
  ```ts
  export type ReplacePhase = "idle" | "picked" | "uploading" | "finalizing" | "replacing";
  export const isBusy = (phase: ReplacePhase) => phase === "uploading" || phase === "finalizing" || phase === "replacing";
  export const fileMeta = (file: File) => `${formatBytes(file.size)} · ZIP`;
  export function stagesFor(phase: ReplacePhase, percent: number | null): (ConversionStage & { hint: string })[];
  export function currentRows(territory: Territory, size: number | null): Detail[];        // size ("—" when null), uploaded (shortDate or "—")
  export function newRows(file: File, currentSize: number | null): Detail[];               // size, selected "just now", delta (omitted when currentSize null)
  export const PRESERVED: ChecklistItem[];
  export type ReplaceSourcePageProps = {
    territory: Territory; currentSize: number | null; phase: ReplacePhase; file: File | null;
    progress?: UploadProgressView; onFiles: (files: File[]) => void; onReplace: () => void;
    onSubmit: () => void; onCancel: () => void; canReplace: boolean;
    stages: (ConversionStage & { hint: string })[];
  };
  ```

- [x] **Step 1: `replace-form.ts` — failing spec**

```ts
import { describe, expect, it } from "vitest";
import { currentRows, isBusy, newRows, PRESERVED, stagesFor } from "./replace-form";

const territory = { slug: "t", title: "T", sourceBlobHash: "5b81" + "0".repeat(56) + "c40e", placementCount: 0, createdAt: "2026-09-02T00:00:00Z" };
const file = (bytes: number) => new File([new Uint8Array(bytes)], "rev4.zip");

describe("replace form", () => {
  it("is busy from the first byte to the gateway's answer", () => {
    expect(["idle", "picked"].map(isBusy)).toEqual([false, false]);
    expect(["uploading", "finalizing", "replacing"].map(isBusy)).toEqual([true, true, true]);
  });

  it("describes the current source, with a dash where the size is unknown", () => {
    expect(currentRows(territory, 1024).map((r) => [r.label, r.value])).toEqual([["size", "1 KB"], ["uploaded", "02.09"]]);
    expect(currentRows(territory, null)[0].value).toBe("—");
  });

  it("describes the new file and its delta against the current size", () => {
    expect(newRows(file(2048), 1024).map((r) => [r.label, r.value])).toEqual([["size", "2 KB"], ["selected", "just now"], ["delta", "+1 KB"]]);
    expect(newRows(file(512), 1024).at(-1)?.value).toBe("−512 B");
    expect(newRows(file(512), null).map((r) => r.label)).toEqual(["size", "selected"]);
  });

  it("moves the first two stages with the phase and leaves the rest queued", () => {
    expect(stagesFor("idle", null).map((s) => s.state)).toEqual(["pending", "pending", "pending", "pending", "pending"]);
    expect(stagesFor("uploading", 41)[0]).toMatchObject({ state: "active", time: "41%" });
    expect(stagesFor("finalizing", null).slice(0, 2).map((s) => s.state)).toEqual(["done", "active"]);
    expect(stagesFor("replacing", null).slice(0, 2).map((s) => s.state)).toEqual(["done", "done"]);
    expect(stagesFor("idle", null).map((s) => s.time)).toEqual(["queued", "queued", "~1 min", "~3 min", "~10 s"]);
  });

  it("keeps four things and drops one", () => {
    expect(PRESERVED.map((i) => i.ok)).toEqual([true, true, true, true, false]);
  });
});
```

- [x] **Step 2: Implement `replace-form.ts`**

Stages (labels/hints verbatim): `Chunked upload / 8 MB chunks, resumable`, `Finalize blob / content hash written`, `Parse OBJ + MTL / geometry and materials`, `Rebuild LOD 0-2 / replaces the old artifacts`, `Swap in viewer / territory returns to ready`; pending times `["queued", "queued", "~1 min", "~3 min", "~10 s"]`; active upload time `${percent}%` (or `running` when null), active finalize `running`, done `done`. `PRESERVED`: `Slug, title and description`, `Territory access assignments`, `Placed models and their coordinates`, `Panorama tour link` (ok) and `Old LOD artifacts — replaced by the new build` (not ok). Delta sign: `+` / `−` (U+2212) with `formatBytes(Math.abs(d))`; `0` → `±0 B`. `currentRows` uses `tone: "muted"`-free plain values; the hash is the card's bold line, not a row.

- [x] **Step 3: Hook — failing spec**

`use-replace-source.spec.tsx` (mock `@/entities/territory` `getTerritory`/`replaceTerritorySource`, `@/entities/content` `assetSize`, `@/entities/upload` `runChunkedUpload`, `@/shared/lib/leave`). Cases:
1. loading until `getTerritory` and `assetSize` answer; then `status: "ready"`, `territory`, `currentSize: 1024`, `phase: "idle"`;
2. `onFiles([f])` → `picked`; `onReplace()` → `idle`;
3. submit runs `picked → uploading → finalizing → replacing → leaveTo("/territories/t?jobId=j-9")` and invalidates `["jobs"]` and `["territories"]` (spy `client.invalidateQueries`);
4. a rejected `replaceTerritorySource` → `picked`, an error notice, no `leaveTo`;
5. `onCancel` aborts (the mocked `runChunkedUpload` rejects on `signal.aborted`) → `picked`, no notice;
6. a 404 → `status: "missing"`; `canReplace` follows `territory:write`;
7. `progress` is defined only while uploading/finalizing, and a retry starts with `progress` undefined.

- [x] **Step 4: Implement `use-replace-source.ts`**

Follow `use-upload-territory.ts` line by line, with: `useQuery(territoryQuery(slug))`, `useQuery({ queryKey: ["asset-size", hash], queryFn: () => assetSize(hash), enabled: !!hash })` (`hash = territory.data?.sourceBlobHash`), `onSubmit` guarded by `phase === "picked" && file`, `.then((finalized) => { setPhase("replacing"); return replaceTerritorySource(slug, finalized.hash); }).then(async ({ territory, job }) => { await Promise.all([client.invalidateQueries({ queryKey: ["jobs"] }), client.invalidateQueries({ queryKey: ["territories"] })]); leaveTo(\`/territories/${territory.slug}?jobId=${job.id}\`); })`, `progress: progressFor(phase === "uploading" || phase === "finalizing", progress, samples)`, `stages: stagesFor(phase, progressPercent)`. State union: `loading | missing | unavailable(error) | (ready & ReplaceSourcePageProps)`.

- [x] **Step 5: UI — failing specs, then implement**

`source-pair.spec.tsx`: Current card shows `Current source`, the short hash bold, `size`/`uploaded` rows; New card idle shows `New source` and `No file chosen yet.`; with a file shows its name and the `delta` row.
`replace-aside.spec.tsx`: `After the upload` / `Re-convert in place`; five stage labels; `What is preserved` with the five items.
`replace-source-page.spec.tsx`: h1 `Swap the 3D source of Refinery Block C`; eyebrow `Replace source`; lede verbatim; back link `← Territory catalog` → `/territories`; `New archive` head with `.zip only · OBJ + MTL + textures`; `DropZone` (`Drop the new ZIP here`) when no file, `FileCard` when picked; buttons `Replace source` disabled until picked, `Uploading…` + `Cancel upload` while busy; the warn callout title `The territory goes back to converting` and its body; without `canReplace` only the callout `Replacing a source needs territory:write.`
`replace-source-screen.spec.tsx`: loading skeleton; `missing` → `Territory not found` + back link; ready → page.

`source-pair.tsx`: grid `grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 items-stretch`; cards `rounded-card border p-[16px_18px] flex flex-col gap-[11px]`; Current: `border-line bg-panel`, overline muted, `<p className="m-0 text-[14px] font-semibold">{shortHash}</p>` (reuse: put `shortHash` in `replace-form.ts` too — do not import from `pages/model-detail`, pages never import pages), `<DetailList items={currentRows(...)} />`; New idle: `border-dashed border-line-2 bg-panel`, overline muted, `<p className="m-0 text-xs text-muted">No file chosen yet.</p>`; New picked: `border-accent bg-accent-soft`, overline `text-accent`, file name bold, `DetailList` with the delta row `tone: "fg"` (the accent colour on the delta comes from the mock; `DetailTone` has none — render the delta value as `<span className="text-accent">` in `newRows`, which returns `Detail[]` with a ReactNode value; then `replace-form.ts` becomes `.tsx`).

`replace-aside.tsx`: the Upload Territory aside's pipeline card chrome verbatim (`overflow-hidden rounded-[14px] border border-line bg-panel shadow-elevation`, head `border-b border-line bg-panel-2 px-[18px] py-4`), overline `After the upload`, title `Re-convert in place`, `<StageList stages={stages} activeTone="accent" />`; the preserved card `rounded-card border border-line bg-panel p-[18px] flex flex-col gap-3` with `<Checklist items={PRESERVED} label="What is preserved" />`.

`replace-source-page.tsx`: `PageHeader size="lg" eyebrow="Replace source" title={\`Swap the 3D source of ${territory.title}\`} description="Upload a new ZIP (OBJ + MTL + textures). The mesh re-converts in place and the territory keeps its identity — every placed object stays anchored. Use this for an updated scan of the same site." back={{ label: "← Territory catalog", href: "/territories" }} action={<ThemeToggle variant="compact" />}`; body grid `lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)] gap-5 items-start`; left column `gap-4`: `<SourcePair … />`, the New archive panel (`rounded-card border border-line bg-panel p-[22px] flex flex-col gap-4`; head `flex items-baseline gap-3`: `<span className="text-[13px] font-semibold">New archive</span><span className="font-mono text-[10px] text-muted">.zip only · OBJ + MTL + textures</span><span className="h-px flex-1 bg-line" />`; `FileCard`/`DropZone`; `<UploadProgressPanel busy={isBusy(phase)} progress={progress} canSubmit={phase === "picked"} submitLabel="Replace source" cancelLabel="Cancel upload" onSubmit onCancel />`), `<Callout tone="warn" icon="warning" className="items-start rounded-card px-4 py-3.5">` — the Callout renders one `<p className="text-xs">`; the mock wants a bold title line and a body. Pass children as `<><strong className="block text-[13px] font-semibold">The territory goes back to converting</strong><span className="mt-[5px] block text-xs leading-[1.5] text-fg">While the new mesh is processed the viewer shows the conversion screen. Placements are not deleted, but coordinates are kept as-is — if the new scan shifted the origin, objects will need re-anchoring.</span></>` (block elements inside the `<p>` are invalid HTML — use `<span className="block">` for both). Right: `<ReplaceAside stages={stages} />`.

`replace-source-page.fixture.tsx`: map `{ idle, picked, uploading }` with Refinery Block C, `currentSize: 1.2 GB`, a 1.4 GB fake `File` (construct with `new File([], "refinery-block-c-rev4.zip")` and override `size` via `Object.defineProperty` — no 1.4 GB buffer), progress at 41 % with the mock's stats.

- [x] **Step 6: Route leaf**

```ts
export const territoryReplaceRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/territories/$slug/replace",
  component: ReplaceSourceScreen,
});
```
Add to the tree in `router.tsx`. `index.ts` exports the screen, the page and its props type.

- [x] **Step 7: Run everything, live check, commit**

`yarn lint && yarn test:coverage`. Live: create a throwaway territory through `/territories/new` with a real ≥ 8 MB ZIP, wait for `ready` (or not — replace works on a converting one too, but wait so the artifact swap is observable); from `/territories` click its Replace icon (no document reload); both themes, screenshot beside `mocks/replace-source-v2.md`; the Current card shows the HEAD size; pick a second ZIP, see the delta; Cancel upload mid-way (phase returns to picked, no toast, the server session is dropped — check the gateway log or a subsequent `HEAD /api/uploads/{id}` 404); run it through to the redirect `/territories/<slug>?jobId=…` in the old SPA; confirm `GET /api/jobs` lists the new job; as `cotest` without `territory:write` (if that account lacks it — check `/api/auth/me`) the callout shows; delete the throwaway. Screenshots to `shots-task5/`.

```bash
git add frontend-v2 && git commit --no-verify -m "feat(frontend-v2): Replace source, live

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 6: Docs

**Files:**
- Modify: `frontend-v2/CLAUDE.md` (the screen list / "what is live" section, the guard's href rule, the `UploadProgressPanel` home), root `CLAUDE.md` (the "Two frontends" paragraph: six catalog screens now), the spec's §8 ticks.

- [x] **Step 1:** In `frontend-v2/CLAUDE.md` add `/models/{slug}` and `/territories/{slug}/replace` to the catalog-shell route list; note that `isCatalogHref` matches them by pattern and that `/territories/{slug}` still leaves; note the thumbnail-as-viewport decision and that the viewer overlays wait for the territory-viewer port; note the model replace-source has no backend route. In the root `CLAUDE.md` "Two frontends" paragraph change "the four catalog screens" to name six. Tick §8 in the spec.
- [x] **Step 2:** Commit:
```bash
git add frontend-v2/CLAUDE.md CLAUDE.md docs/superpowers/specs/2026-09-06-model-detail-and-replace-source-design.md docs/superpowers/plans/2026-09-06-model-detail-and-replace-source.md
git commit --no-verify -m "docs: the model page and the replace form are v2 screens; the plan's tasks ticked

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

## Parallelism

Task 1 and Task 2 touch disjoint files and run in parallel (Task 2 stages `frontend-v2` minus `shared/ui/artifact-row` and `widgets/page-header`; Task 1 stages exactly those two directories). Task 3 waits for Task 2 (the screens' specs import nothing new from it, but the route split must land before Tasks 4/5 add leaves). Tasks 4 and 5 run in parallel after Task 3; both append to `catalog-routes.tsx` and `router.tsx` — the second to commit rebases on the first, staging by path (`pages/model-detail` + the two router files / `pages/replace-source` + the two router files). Task 6 last.
