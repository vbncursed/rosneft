# frontend-v2 Content and Territory access — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/console/content` and `/console/access` render the finished `ContentPage` and `TerritoryAccessPage` against the live gateway — the catalog with its artifacts, delete and links into the old SPA for upload / viewer / replace-source; and per-territory admin assignment with a draft, a person picker and save — inside the console shell Part 2 built.

**Architecture:** Same shape as Part 2. Each screen gets a container hook in `pages/<screen>/model/use-*.ts` that owns queries, mutations and UI state; pure functions beside it for every decision (mapping catalog rows, grouping, filters, stats, drafts); a `*-screen.tsx` that maps the hook onto the page plus its dialogs. Gateways live in `entities/<entity>/api/` with DTO→model mappers and `queryOptions`. Pages and widgets are touched only where a prop had no honest data behind it (the visibility switch, replace-source for models, bulk assign).

**Tech Stack:** Vite 8, React 19, TypeScript 7 (`tsc -b`), TanStack Router + Query 5.102 (`useQueries`), vitest 4 + @testing-library/react, React Cosmos, Tailwind 4, oxlint.

**Spec:** `docs/superpowers/specs/2026-09-02-frontend-v2-gateway-wiring-design.md` (step 3 of its Order of work). Contested decisions and the user's approval of every recommendation: `docs/superpowers/specs/2026-09-03-frontend-v2-parts-3-4-survey.md` (Parts 3a and 3b; the rulings below restate them so this plan stands alone).

## Global Constraints

- **yarn, never npm.** All commands run from `frontend-v2/`.
- **`yarn lint` is `tsc -b --noEmit && oxlint`. Keep the `-b`.**
- **`src/architecture.spec.ts` fails the build, not warns:** every non-barrel, non-fixture source file needs a sibling `*.spec.ts(x)`; every slice that renders JSX needs a `*.fixture.tsx` somewhere in it; layer imports point inward only (`shared → entities → features → widgets → pages → app`); cross-slice imports land exactly on the slice's `index.ts`; nothing sits loose in a layer root. `src/fixtures.spec.tsx` renders every fixture.
- **Wiring with no decision joins `EXEMPT_MODULES`** (`frontend-v2/exempt-modules.ts`); anything with a decision is a pure function with its own spec.
- **A page draws no chrome** and takes everything through props; the route applies the console shell.
- **"Loading" and "unavailable" are different states**; `status` is `"loading"` while any enabled query pends, `"unavailable"` only when a query errored and holds no data (`shared/lib/unanswered`), `"ready"` only with all data; an inspector is absent until its data is loaded; an empty list answers with a sentence.
- **Never a confident wrong value:** `null`/missing renders as "—", never as "No"/0.
- **A control with no endpoint behind it is not rendered.** Reset-style optional callbacks: the button draws only when the prop is handed.
- **Dialogs reset by unmounting:** mount every dialog as `{open && <Dialog open … />}`, never `open={false}`.
- **Every mutation toasts** through `notify` and reports failures with `messageOf(err)`; **every dialog and save button receives `busy`** from its mutation's `isPending`.
- **Accessible names are unique on screen**; state is never carried on colour alone.
- **No `Authorization` header; `X-CSRF-Token` on mutations only** — already in `shared/api/client.ts`. 403 → "You don't have permission to do this" (HttpError's fallback).
- **Mapper rule from Part 2:** an array field on a DTO is defended with `?? []` (a Go nil slice marshals as JSON `null`), and every exported gateway function gets a URL/method assertion in its spec.
- **Coverage thresholds** (vite.config.ts): statements 90, branches 85, functions 90, lines 90 — `yarn test:coverage` must stay above them.
- **A parallel session may work in this clone.** Stage by path: `git add frontend-v2` (plus a doc path where a task says so) — never `git add -A`; check `git diff --cached --name-only`; never stage `.claude/settings.json`.
- **Commit with `--no-verify` and say so** — the pre-commit hook runs the Go gate and these tasks touch no Go. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Local accounts for live checks: Root `admin` / `change-me-now`; Company Owners `cotest` and `cotest2` / `Passw0rd!2026`. Login JSON field is `identifier`. Gateway on `localhost:8080`; v2 dev server `yarn dev` on 3001 proxies `/api`.

## Rulings (decisions the survey forced, approved by the user 2026-09-03)

1. **Conversion status is derived from artifacts, not guessed.** `ConversionStatus` gains `"pending"`: `ready` when the item has at least one artifact, `pending` when it has none. `converting`/`failed` stay in the type for the job-tracking UI but **nothing in v2 can start a job** (upload and replace-source live in the old SPA), so no SSE is wired in this part and no item ever shows them. The survey's "converting only for a job this session started" therefore reduces to nothing built; `entities/conversion`'s job vocabulary stays for the day v2 gets an upload form.
2. **Artifacts are fetched for every catalog row** (`GET /api/{territories,models}/{slug}/artifacts`, one query per row via `useQueries`, ETag-cached by the browser). The screen is "loading" until every one has answered — the page renders only with data. `lods`, `size`, the Storage tile and the pipeline meter all come from this fan-out; nothing is estimated.
3. **Stat tiles:** Territories (hint "N ready · M pending"), Models (hint "N ready · M pending"), Storage (sum of artifact sizes, hint "GLB + KTX2 artifacts"). No "shared with guests".
4. **Inspector details:** Artifacts (count), LODs, Size, Updated (short date or "—"). No source filename, no job row. `stages`/`conversionNote` are not passed.
5. **Replace source** is an absolute link into the old SPA — `/territories/{slug}/replace` — for a territory only; for a model there is no endpoint and the button is not drawn (`onReplaceSource` becomes optional on `ContentInspector` and `ContentPage`). **Cancel job** is not drawn (already optional).
6. **Rename / description edit:** no control exists in the mock and `PATCH` bodies carry neither — nothing is added.
7. **Upload territory / model and the drop zone** navigate to the old SPA's `/territories/new` and `/models/new`. The zone cannot accept a real drop.
8. **Permissions on Content:** the header's `canManage` is the screen gate's OR (`territory:write || model:write`). Delete is drawn per row kind only when the viewer holds `territory:delete` / `model:delete` (`onDelete` becomes optional on `ContentInspector` and `ContentPage`; the row menu omits the item). Open in viewer is always available.
9. **Groups:** "Territories" and "Models", each with a note "N ready · M pending". No "Needs attention" bucket.
10. **Filters on Content:** the existing `matchesFilters` (`kind:`, `status:`, `lod:`, `slug:`) plus `matchesText` on title/slug/meta; `status:pending` now matches.
11. **Visibility switch is not rendered.** `TerritoryAdmins` is `{userIds}` and nothing else. `AccessInspector.onVisibilityChange` and `TerritoryAccessPage.onVisibilityChange` become optional; without them the inspector shows the visibility as a read-only line and always lists people. Visibility is **derived**: `"assigned"` when the territory has at least one admin, `"private"` when it has none (`VISIBILITY_TITLE.private` = "Owner only" — true: only Root opens it). `"company"` is never produced.
12. **Grouping on Access:** "Shared" (assigned) / "Not shared" (private), in that order. The mix meter has two segments: accent "shared", neutral "not shared".
13. **Every grant is `direct`.** `hasInheritedGrants` is always false and the inherited note never draws; nothing in the widget changes for that.
14. **Naming a grant:** `username` from `GET /api/auth/users?includeDeleted=true` (the same `usersQuery`), `roleTitle` = the first role's title else "—", `inactive` when the account is not `active` **or is missing from the list** — a missing id renders as the bare id with `inactive: true`; the grant is real and is not dropped.
15. **Row fields:** `meta` = `"{slug} · upd. {dd.mm}"` when `updatedAt` is present, else the slug; `faces` = up to four usernames of the admins; `peopleLabel` = "owner only" / "1 person" / "N people". No placements count.
16. **Stat tiles on Access:** Territories, Not shared (tone `warn`), People with access (distinct admin ids).
17. **Bulk assign is not drawn** (`onBulkAssign` becomes optional; the header action only when handed).
18. **Add person** is a dialog over the users list (active accounts not yet in the draft), one pick, "Add person". Only Company Owners and Guests are self-keyed in `territory_assignments` (`scopeOwningAdmin`); everyone else inherits their tenant admin's key, so the picker offers only those two roles — a grant to anyone else is written and does nothing.
19. **Save** is `PUT /api/territories/{slug}/admins` with the whole draft; on success invalidate that territory's admins query only, toast "Access saved". Drafts are kept per slug so switching territories loses nothing; Cancel drops the selected slug's draft.
20. **Filters on Access:** `visibility:assigned|private`, `person:<text>` (a grant whose username contains it), free text on title or slug.
21. **Screen gates stay as written:** Content is `territory:write || model:write`; Access is `isOwner`, which is Root — consistent with the Root-only admins endpoints.
22. **Links into the old SPA** go through one `leaveTo(href)` in `shared/lib` (`window.location.assign`), so the specs can stub a single seam.

---

### Task 1: Catalog gateways — territories, models, artifacts

**Files:**
- Create: `frontend-v2/src/shared/lib/format-bytes.ts`, `format-bytes.spec.ts`, `frontend-v2/src/shared/lib/short-date.ts`, `short-date.spec.ts`, `frontend-v2/src/shared/lib/leave.ts`, `leave.spec.ts`
- Create: `frontend-v2/src/entities/territory/api/to-territory.ts`, `to-territory.spec.ts`, `territories-gateway.ts`, `territories-gateway.spec.ts`, `territories-query.ts`, `territories-query.spec.ts`
- Create: `frontend-v2/src/entities/model/api/to-model.ts`, `to-model.spec.ts`, `models-gateway.ts`, `models-gateway.spec.ts`, `models-query.ts`, `models-query.spec.ts`
- Create: `frontend-v2/src/entities/content/model/artifact.ts`, `artifact.spec.ts`, `frontend-v2/src/entities/content/api/artifacts-gateway.ts`, `artifacts-gateway.spec.ts`, `artifacts-query.ts`, `artifacts-query.spec.ts`
- Modify: `frontend-v2/src/entities/territory/index.ts`, `frontend-v2/src/entities/model/index.ts`, `frontend-v2/src/entities/content/index.ts`

**Interfaces:**
- Consumes: `httpGet/httpDelete` (`@/shared/api`), `components["schemas"]["Territory" | "Model" | "Artifact"]` (`@/shared/api/dto`), the existing `Territory` (`@/entities/territory`) and `Model` (`@/entities/model`) types.
- Produces: `formatBytes(n): string`; `shortDate(iso?): string | null`; `leaveTo(href)`; `toTerritory(dto): Territory`; `listTerritories(): Promise<Territory[]>`; `deleteTerritory(slug): Promise<void>`; `territoriesQuery` (key `["territories"]`); `toModel(dto): Model`; `listModels()`, `deleteModel(slug)`; `modelsQuery` (key `["models"]`); `Artifact = { lod: number; size: number }`; `lodLabel(artifacts): string`; `totalSize(artifacts): number`; `listArtifacts(kind, slug): Promise<Artifact[]>`; `artifactsQuery(kind, slug)` (key `["artifacts", kind, slug]`).

- [ ] **Step 1: Three shared helpers — specs first**

`src/shared/lib/format-bytes.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("picks the unit and keeps one decimal only above megabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(38 * 1024 * 1024)).toBe("38 MB");
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
    expect(formatBytes(184 * 1024 ** 3)).toBe("184 GB");
  });
});
```

`src/shared/lib/short-date.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shortDate } from "./short-date";

describe("shortDate", () => {
  it("reads dd.mm from an ISO timestamp and null from nothing", () => {
    expect(shortDate("2026-08-31T10:15:00Z")).toBe("31.08");
    expect(shortDate("2026-01-05T00:00:00Z")).toBe("05.01");
    expect(shortDate(undefined)).toBeNull();
    expect(shortDate("not a date")).toBeNull();
  });
});
```

`src/shared/lib/leave.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { leaveTo } from "./leave";

describe("leaveTo", () => {
  const original = window.location;
  afterEach(() => Object.defineProperty(window, "location", { value: original, writable: true }));

  it("hands the href to the browser", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });
    leaveTo("/territories/new");
    expect(assign).toHaveBeenCalledWith("/territories/new");
  });
});
```

Run: `yarn vitest run src/shared/lib/format-bytes.spec.ts src/shared/lib/short-date.spec.ts src/shared/lib/leave.spec.ts` — expected FAIL, modules not found.

- [ ] **Step 2: The helpers**

`src/shared/lib/format-bytes.ts`:

```ts
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** "412 MB", "1.2 GB" — whole numbers below a gigabyte, one decimal above. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit >= 3 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${text} ${UNITS[unit]}`;
}
```

`src/shared/lib/short-date.ts`:

```ts
/** "31.08" for the catalog's meta line; null when there is no usable date. */
export function shortDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}
```

`src/shared/lib/leave.ts`:

```ts
/**
 * A full navigation into the old SPA. Same origin, same cookie, so the
 * session rides along; a router navigate cannot reach those routes because
 * v2 does not have them.
 */
export const leaveTo = (href: string): void => window.location.assign(href);
```

Run the three specs — expected PASS.

- [ ] **Step 3: Territory mapper and gateway — specs first**

`src/entities/territory/api/to-territory.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toTerritory } from "./to-territory";

describe("toTerritory", () => {
  it("maps the whole shape and drops empty optionals", () => {
    expect(
      toTerritory({
        slug: "north-ridge-pad",
        title: "North Ridge Pad",
        description: "",
        externalPanoramaUrl: "",
        sourceBlobHash: "a".repeat(64),
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-31T00:00:00Z",
      }),
    ).toEqual({
      slug: "north-ridge-pad",
      title: "North Ridge Pad",
      sourceBlobHash: "a".repeat(64),
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
    });
  });
});
```

`src/entities/territory/api/territories-gateway.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { deleteTerritory, listTerritories } from "./territories-gateway";

const territory = { slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64) };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([territory])));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET" };
};

describe("territories gateway", () => {
  it("lists territories as domain objects", async () => {
    const out = await listTerritories();
    expect(request()).toEqual({ url: "/api/territories", method: "GET" });
    expect(out).toEqual([{ slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64) }]);
  });

  it("deletes by slug, encoded, and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteTerritory("t 1")).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/territories/t%201", method: "DELETE" });
  });
});
```

`src/entities/territory/api/territories-query.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./territories-gateway", () => ({ listTerritories: vi.fn(async () => [{ slug: "t" }]) }));
const { territoriesQuery } = await import("./territories-query");

describe("territoriesQuery", () => {
  it("keys the list and delegates to the gateway", async () => {
    expect(territoriesQuery.queryKey).toEqual(["territories"]);
    const run = territoriesQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([{ slug: "t" }]);
  });
});
```

(This is the shape `src/entities/user/api/users-query.spec.ts` already uses.)

Run: `yarn vitest run src/entities/territory/api` — expected FAIL.

- [ ] **Step 4: Territory mapper, gateway, query**

`src/entities/territory/api/to-territory.ts`:

```ts
import type { components } from "@/shared/api/dto";
import type { Territory } from "../model/territory";

type TerritoryDto = components["schemas"]["Territory"];

/** Empty strings from the gateway mean "none"; the model says so with absence. */
export function toTerritory(d: TerritoryDto): Territory {
  return {
    slug: d.slug,
    title: d.title,
    ...(d.description ? { description: d.description } : {}),
    ...(d.externalPanoramaUrl ? { externalPanoramaUrl: d.externalPanoramaUrl } : {}),
    sourceBlobHash: d.sourceBlobHash,
    ...(d.createdAt ? { createdAt: d.createdAt } : {}),
    ...(d.updatedAt ? { updatedAt: d.updatedAt } : {}),
  };
}
```

`src/entities/territory/api/territories-gateway.ts`:

```ts
import { httpDelete, httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Territory } from "../model/territory";
import { toTerritory } from "./to-territory";

type TerritoryDto = components["schemas"]["Territory"];

export const listTerritories = async (): Promise<Territory[]> =>
  (await httpGet<TerritoryDto[]>("/api/territories")).map(toTerritory);

export const deleteTerritory = (slug: string): Promise<void> =>
  httpDelete(`/api/territories/${encodeURIComponent(slug)}`);
```

`src/entities/territory/api/territories-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { listTerritories } from "./territories-gateway";

export const territoriesQuery = queryOptions({ queryKey: ["territories"], queryFn: listTerritories });
```

Add to `src/entities/territory/index.ts`:

```ts
export { deleteTerritory, listTerritories } from "./api/territories-gateway";
export { territoriesQuery } from "./api/territories-query";
```

Run: `yarn vitest run src/entities/territory/api` — expected PASS.

- [ ] **Step 5: Model mapper, gateway, query — same shape**

Specs mirror Step 3 with these differences: the DTO literal is `{ slug: "m-1", title: "M 1", sourceBlobHash: "b".repeat(64), thumbnailBlobHash: "" }` and the mapped object omits `thumbnailBlobHash` when empty; the list URL is `/api/models`; delete is `/api/models/m%201`; the query key is `["models"]`. Add an extra mapper case: `thumbnailBlobHash: "c".repeat(64)` is kept.

`src/entities/model/api/to-model.ts`:

```ts
import type { components } from "@/shared/api/dto";
import type { Model } from "../model/model";

type ModelDto = components["schemas"]["Model"];

export function toModel(d: ModelDto): Model {
  return {
    slug: d.slug,
    title: d.title,
    ...(d.description ? { description: d.description } : {}),
    sourceBlobHash: d.sourceBlobHash,
    ...(d.thumbnailBlobHash ? { thumbnailBlobHash: d.thumbnailBlobHash } : {}),
    ...(d.createdAt ? { createdAt: d.createdAt } : {}),
    ...(d.updatedAt ? { updatedAt: d.updatedAt } : {}),
  };
}
```

`src/entities/model/api/models-gateway.ts`:

```ts
import { httpDelete, httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Model } from "../model/model";
import { toModel } from "./to-model";

type ModelDto = components["schemas"]["Model"];

export const listModels = async (): Promise<Model[]> =>
  (await httpGet<ModelDto[]>("/api/models")).map(toModel);

// The gateway answers 400 when placements still reference the model; the
// message names them and reaches the operator as a toast.
export const deleteModel = (slug: string): Promise<void> =>
  httpDelete(`/api/models/${encodeURIComponent(slug)}`);
```

`src/entities/model/api/models-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { listModels } from "./models-gateway";

export const modelsQuery = queryOptions({ queryKey: ["models"], queryFn: listModels });
```

Add to `src/entities/model/index.ts`:

```ts
export { deleteModel, listModels } from "./api/models-gateway";
export { modelsQuery } from "./api/models-query";
```

Run: `yarn vitest run src/entities/model/api` — expected PASS.

- [ ] **Step 6: Artifacts — model, gateway, query; specs first**

`src/entities/content/model/artifact.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lodLabel, totalSize } from "./artifact";

describe("artifacts", () => {
  it("names the LOD range and sums the bytes", () => {
    const artifacts = [{ lod: 0, size: 300 }, { lod: 2, size: 100 }, { lod: 1, size: 12 }];
    expect(lodLabel(artifacts)).toBe("LOD 0-2");
    expect(lodLabel([{ lod: 0, size: 1 }])).toBe("LOD 0");
    expect(lodLabel([])).toBe("—");
    expect(totalSize(artifacts)).toBe(412);
    expect(totalSize([])).toBe(0);
  });
});
```

`src/entities/content/api/artifacts-gateway.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listArtifacts } from "./artifacts-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve(json([{ slug: "t", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 300 }])),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("artifacts gateway", () => {
  it("asks the owner's route and keeps only lod and size", async () => {
    await expect(listArtifacts("territory", "t 1")).resolves.toEqual([{ lod: 0, size: 300 }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/territories/t%201/artifacts");
    await listArtifacts("model", "m");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/models/m/artifacts");
  });
});
```

`src/entities/content/api/artifacts-query.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./artifacts-gateway", () => ({ listArtifacts: vi.fn(async () => [{ lod: 0, size: 1 }]) }));
const { artifactsQuery } = await import("./artifacts-query");
const { listArtifacts } = await import("./artifacts-gateway");

describe("artifactsQuery", () => {
  it("keys on kind and slug and delegates", async () => {
    const q = artifactsQuery("model", "m-1");
    expect(q.queryKey).toEqual(["artifacts", "model", "m-1"]);
    const run = q.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([{ lod: 0, size: 1 }]);
    expect(listArtifacts).toHaveBeenCalledWith("model", "m-1");
  });
});
```

Run: `yarn vitest run src/entities/content` — expected FAIL on the new files.

- [ ] **Step 7: Artifacts implementation**

`src/entities/content/model/artifact.ts`:

```ts
/** What the catalog needs from one converted LOD — nothing else is read. */
export type Artifact = { lod: number; size: number };

/** "LOD 0-2", "LOD 0", or "—" when nothing has been converted. */
export function lodLabel(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return "—";
  const lods = artifacts.map((a) => a.lod);
  const lo = Math.min(...lods);
  const hi = Math.max(...lods);
  return lo === hi ? `LOD ${lo}` : `LOD ${lo}-${hi}`;
}

export const totalSize = (artifacts: Artifact[]): number =>
  artifacts.reduce((sum, a) => sum + a.size, 0);
```

`src/entities/content/api/artifacts-gateway.ts`:

```ts
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Artifact } from "../model/artifact";
import type { ContentKind } from "../model/content-item";

type ArtifactDto = components["schemas"]["Artifact"];

const route = (kind: ContentKind, slug: string) =>
  `/api/${kind === "territory" ? "territories" : "models"}/${encodeURIComponent(slug)}/artifacts`;

export const listArtifacts = async (kind: ContentKind, slug: string): Promise<Artifact[]> =>
  (await httpGet<ArtifactDto[]>(route(kind, slug))).map((a) => ({ lod: a.lod, size: a.size }));
```

`src/entities/content/api/artifacts-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { ContentKind } from "../model/content-item";
import { listArtifacts } from "./artifacts-gateway";

/** One entry per catalog row; the browser's ETag keeps refetches cheap. */
export const artifactsQuery = (kind: ContentKind, slug: string) =>
  queryOptions({ queryKey: ["artifacts", kind, slug], queryFn: () => listArtifacts(kind, slug) });
```

Add to `src/entities/content/index.ts`:

```ts
export { lodLabel, totalSize, type Artifact } from "./model/artifact";
export { listArtifacts } from "./api/artifacts-gateway";
export { artifactsQuery } from "./api/artifacts-query";
```

Run: `yarn vitest run src/entities/content src/shared/lib` — expected PASS.

- [ ] **Step 8: Lint, suite, commit**

`yarn lint && yarn test`. Commit (`--no-verify`, stage `frontend-v2` only):

```
feat(frontend-v2): catalog gateways — territories, models and their artifacts

listTerritories/listModels/deleteTerritory/deleteModel with DTO→model
mappers and queryOptions; listArtifacts(kind, slug) keeps only lod and
size, which is all the catalog reads. Three shared helpers arrive with
them: formatBytes, shortDate and leaveTo (the one seam for links into the
old SPA).

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 2: A `pending` status, and the content controls that may be absent

**Files:**
- Modify: `frontend-v2/src/entities/conversion/model/status.ts` (+ `status.spec.ts`), `frontend-v2/src/entities/conversion/ui/conversion-badge.tsx` (+ spec), `frontend-v2/src/entities/content/ui/content-row.tsx`, `frontend-v2/src/entities/content/model/content-item.ts` (+ spec)
- Modify: `frontend-v2/src/widgets/content-inspector/ui/content-inspector.tsx` (+ spec), `frontend-v2/src/pages/content/ui/content-page.tsx` (+ spec)

**Interfaces:**
- Produces: `ConversionStatus = "ready" | "pending" | "converting" | "failed"`; `pipelineCounts` gains `pending`; `ContentInspectorProps.onReplaceSource?` and `onDelete?`; `ContentPageProps.onReplaceSource?` and `onDelete?`.

- [ ] **Step 1: The status — failing specs**

Add to `src/entities/conversion/model/status.spec.ts` inside `describe("trailingNote")`:

```ts
  it("says nothing before a conversion has been asked for", () => {
    expect(trailingNote({ status: "pending" })).toBeUndefined();
  });
```

Add to `src/entities/content/model/content-item.spec.ts` (reuse the file's own item builder) inside `describe("pipelineCounts")`:

```ts
  it("counts the never-converted rows apart from the converting ones", () => {
    const counts = pipelineCounts([item({ status: "pending" }), item({ status: "ready" })]);
    expect(counts).toEqual({ ready: 1, pending: 1, converting: 0, failed: 0 });
  });
```

Add to `src/entities/conversion/ui/conversion-badge.spec.tsx`:

```tsx
  it("draws a pending badge in the neutral tone", () => {
    render(<ConversionBadge status="pending" />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });
```

Run: `yarn vitest run src/entities/conversion src/entities/content` — expected FAIL (type errors surface at lint; the counts assertion fails at runtime).

- [ ] **Step 2: Implement `pending`**

In `src/entities/conversion/model/status.ts` change the union and its doc:

```ts
/**
 * Where a source upload has got to on its way to a viewable GLB. `pending`
 * is the honest word for "no artifacts and no job we know of": the catalog
 * cannot tell a never-converted row from a failed one, and v2 starts no jobs.
 */
export type ConversionStatus = "ready" | "pending" | "converting" | "failed";
```

`trailingNote` already returns `undefined` for anything that is neither ready nor converting — verify, do not add a branch.

In `src/entities/conversion/ui/conversion-badge.tsx` add `pending: "neutral"` to `TONE` and `pending: "pending"` to `LABEL`.

In `src/entities/content/ui/content-row.tsx` add `pending: "bg-line-2"` to `RAIL`.

In `src/entities/content/model/content-item.ts`, `pipelineCounts` gains `pending: items.filter((i) => i.status === "pending").length` between `ready` and `converting`.

Run `yarn lint` — it flags every other `Record<ConversionStatus, …>` literal; add the `pending` key to each (expect `entities/conversion/conversion.fixture.tsx` and any `STATUS_*` map under `widgets/content-*`). Change nothing else in those files.

Run: `yarn vitest run src/entities/conversion src/entities/content` — expected PASS.

- [ ] **Step 3: Optional controls on the inspector — spec first**

Add to `src/widgets/content-inspector/ui/content-inspector.spec.tsx` (reuse the file's `props()` helper; if it has none, build one that spreads over a complete props literal):

```tsx
  it("draws Replace source and Delete only when handed a handler", () => {
    render(<ContentInspector {...props({ onReplaceSource: undefined, onDelete: undefined })} />);
    expect(screen.queryByRole("button", { name: "Replace source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in viewer" })).toBeInTheDocument();
  });
```

Run it — expected FAIL (both buttons still render).

- [ ] **Step 4: Make them optional**

In `src/widgets/content-inspector/ui/content-inspector.tsx`:

```ts
  /** Absent for a model — there is no source-replace route for one. */
  onReplaceSource?: () => void;
  /** Absent when the viewer may not delete this kind. */
  onDelete?: () => void;
```

and in the JSX wrap the two buttons: `{onReplaceSource ? (<Button …>Replace source</Button>) : null}` and `{onDelete ? (<Button variant="danger" …>Delete</Button>) : null}`. Keep the two flex rows; an empty row is fine.

In `src/pages/content/ui/content-page.tsx` make the same two props optional (`onReplaceSource?: () => void; onDelete?: () => void;`) and pass them through unchanged. Add to `content-page.spec.tsx` a case that renders with both undefined and an `inspected` item and asserts neither button is present.

Run: `yarn vitest run src/widgets/content-inspector src/pages/content` — expected PASS.

- [ ] **Step 5: Lint, suite, commit**

`yarn lint && yarn test`. Commit (`--no-verify`, `frontend-v2` only):

```
feat(frontend-v2): a pending conversion status, and content controls that may be absent

ConversionStatus gains "pending" — no artifacts and no job we know of —
so the catalog never calls a never-converted row "converting". Replace
source and Delete on the content inspector draw only when handed a
handler: there is no source-replace route for a model, and Delete needs
the kind's own grant.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 3: The Content screen

**Files:**
- Create: `frontend-v2/src/pages/content/model/catalog.ts`, `catalog.spec.ts`, `use-content.ts`, `use-content.spec.tsx`
- Create: `frontend-v2/src/pages/content/ui/content-screen.tsx`, `content-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/content/index.ts`, `frontend-v2/src/app/router/routes.tsx`

**Interfaces:**
- Consumes: Task 1's `territoriesQuery`, `modelsQuery`, `artifactsQuery`, `deleteTerritory`, `deleteModel`, `lodLabel`, `totalSize`, `formatBytes`, `shortDate`, `leaveTo`; Task 2's `pending`; `meQuery`, `can`; `notify`, `messageOf`, `unanswered`; `ConfirmDialog`; `Menu`.
- Produces: `toContentItem(kind, entity, artifacts): ContentItem`; `matchesContent(item, query)`; `groupContent(items): ContentGroup[]`; `pipelineOf(items)`; `statsOf(items, storageBytes)`; `inspectorDetails(item, artifacts, updatedAt)`; `uploadHref(kind)`, `replaceHref(item)`; `useContent(): ContentState`; `ContentScreen` on `/console/content`.

- [ ] **Step 1: Pure catalog functions — spec first**

`src/pages/content/model/catalog.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/entities/content";
import {
  groupContent,
  inspectorDetails,
  matchesContent,
  pipelineOf,
  replaceHref,
  statsOf,
  toContentItem,
  uploadHref,
} from "./catalog";

const territory = { slug: "north-ridge-pad", title: "North Ridge Pad", sourceBlobHash: "a".repeat(64), updatedAt: "2026-08-31T10:00:00Z" };
const model = { slug: "pump-jack-unit", title: "Pump Jack Unit", sourceBlobHash: "b".repeat(64) };
const ARTIFACTS = [{ lod: 0, size: 300 * 1024 * 1024 }, { lod: 1, size: 100 * 1024 * 1024 }, { lod: 2, size: 12 * 1024 * 1024 }];

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory", slug: "t", title: "T", status: "ready", meta: "t", lods: "LOD 0", size: "1 MB", ...over,
});

describe("toContentItem", () => {
  it("is ready with artifacts, with LODs, size and an updated date in the meta", () => {
    expect(toContentItem("territory", territory, ARTIFACTS)).toEqual({
      kind: "territory",
      slug: "north-ridge-pad",
      title: "North Ridge Pad",
      status: "ready",
      meta: "north-ridge-pad · upd. 31.08",
      lods: "LOD 0-2",
      size: "412 MB",
    });
  });

  it("is pending with none, and the meta is the slug alone without a date", () => {
    expect(toContentItem("model", model, [])).toEqual({
      kind: "model", slug: "pump-jack-unit", title: "Pump Jack Unit", status: "pending",
      meta: "pump-jack-unit", lods: "—", size: "—",
    });
  });
});

describe("matchesContent", () => {
  it("narrows by the catalog's chips and free text", () => {
    const pending = item({ kind: "model", slug: "flare", title: "Flare Stack", status: "pending", lods: "—" });
    expect(matchesContent(pending, "kind:model status:pending")).toBe(true);
    expect(matchesContent(pending, "kind:territory")).toBe(false);
    expect(matchesContent(pending, "flare")).toBe(true);
    expect(matchesContent(pending, "colour:blue")).toBe(false);
  });
});

describe("groupContent", () => {
  it("splits by kind in catalog order with a ready/pending note", () => {
    const groups = groupContent([
      item({ kind: "model", slug: "m1", status: "pending" }),
      item({ slug: "t1" }),
      item({ slug: "t2", status: "pending" }),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.note, g.items.map((i) => i.slug)])).toEqual([
      ["territories", "Territories", "1 ready · 1 pending", ["t1", "t2"]],
      ["models", "Models", "0 ready · 1 pending", ["m1"]],
    ]);
  });
});

describe("pipelineOf and statsOf", () => {
  it("meters the pipeline and fills the three tiles", () => {
    const items = [item(), item({ kind: "model", slug: "m", status: "pending" })];
    expect(pipelineOf(items)).toEqual({
      label: "Conversion pipeline",
      detail: "1 of 2 ready",
      segments: [
        { tone: "ok", value: 1, label: "ready" },
        { tone: "neutral", value: 1, label: "pending" },
        { tone: "warn", value: 0, label: "converting" },
        { tone: "bad", value: 0, label: "failed" },
      ],
    });
    expect(statsOf(items, 184 * 1024 ** 3)).toEqual([
      { label: "Territories", value: "1", hint: "1 ready · 0 pending" },
      { label: "Models", value: "1", hint: "0 ready · 1 pending" },
      { label: "Storage", value: "184 GB", hint: "GLB + KTX2 artifacts", tone: "accent" },
    ]);
  });
});

describe("inspectorDetails", () => {
  it("lists artifacts, LODs, size and the update date, dashes when unknown", () => {
    expect(inspectorDetails(item({ lods: "LOD 0-2", size: "412 MB" }), ARTIFACTS, territory.updatedAt)).toEqual([
      { label: "Artifacts", value: "3" },
      { label: "LODs", value: "LOD 0-2" },
      { label: "Size", value: "412 MB" },
      { label: "Updated", value: "31.08" },
    ]);
    expect(inspectorDetails(item({ status: "pending", lods: "—", size: "—" }), [], undefined)).toEqual([
      { label: "Artifacts", value: "0", tone: "dim" },
      { label: "LODs", value: "—", tone: "dim" },
      { label: "Size", value: "—", tone: "dim" },
      { label: "Updated", value: "—", tone: "dim" },
    ]);
  });
});

describe("hrefs into the old SPA", () => {
  it("names the upload forms and the territory's replace route", () => {
    expect(uploadHref("territory")).toBe("/territories/new");
    expect(uploadHref("model")).toBe("/models/new");
    expect(replaceHref(item({ kind: "territory", slug: "t-1" }))).toBe("/territories/t-1/replace");
    expect(replaceHref(item({ kind: "model", slug: "m-1" }))).toBeNull();
  });
});
```

Run: `yarn vitest run src/pages/content/model/catalog.spec.ts` — expected FAIL, module not found.

- [ ] **Step 2: The functions**

`src/pages/content/model/catalog.ts`:

```ts
import {
  lodLabel,
  matchesFilters,
  matchesText,
  pipelineCounts,
  totalSize,
  type Artifact,
  type ContentItem,
  type ContentKind,
} from "@/entities/content";
import { parseFilters, freeText } from "@/features/audit-filter";
import { formatBytes } from "@/shared/lib/format-bytes";
import { shortDate } from "@/shared/lib/short-date";
import type { Detail } from "@/shared/ui/detail-list";
import type { ContentGroup } from "@/widgets/content-groups";
import type { ContentPageProps, ContentPageStat } from "../ui/content-page";

type Entity = { slug: string; title: string; updatedAt?: string };

/** A catalog row. Ready means converted; pending means nothing to show yet. */
export function toContentItem(kind: ContentKind, entity: Entity, artifacts: Artifact[]): ContentItem {
  const date = shortDate(entity.updatedAt);
  const converted = artifacts.length > 0;
  return {
    kind,
    slug: entity.slug,
    title: entity.title,
    status: converted ? "ready" : "pending",
    meta: date ? `${entity.slug} · upd. ${date}` : entity.slug,
    lods: lodLabel(artifacts),
    size: converted ? formatBytes(totalSize(artifacts)) : "—",
  };
}

export const matchesContent = (item: ContentItem, query: string): boolean =>
  matchesFilters(item, parseFilters(query)) && matchesText(item, freeText(query));

const note = (items: ContentItem[]) => {
  const c = pipelineCounts(items);
  return `${c.ready} ready · ${c.pending} pending`;
};

export function groupContent(items: ContentItem[]): ContentGroup[] {
  const territories = items.filter((i) => i.kind === "territory");
  const models = items.filter((i) => i.kind === "model");
  return [
    { key: "territories", label: "Territories", note: note(territories), items: territories },
    { key: "models", label: "Models", note: note(models), items: models },
  ];
}

export function pipelineOf(items: ContentItem[]): ContentPageProps["pipeline"] {
  const c = pipelineCounts(items);
  return {
    label: "Conversion pipeline",
    detail: `${c.ready} of ${items.length} ready`,
    segments: [
      { tone: "ok", value: c.ready, label: "ready" },
      { tone: "neutral", value: c.pending, label: "pending" },
      { tone: "warn", value: c.converting, label: "converting" },
      { tone: "bad", value: c.failed, label: "failed" },
    ],
  };
}

export function statsOf(items: ContentItem[], storageBytes: number): ContentPageStat[] {
  const territories = items.filter((i) => i.kind === "territory");
  const models = items.filter((i) => i.kind === "model");
  return [
    { label: "Territories", value: String(territories.length), hint: note(territories) },
    { label: "Models", value: String(models.length), hint: note(models) },
    { label: "Storage", value: formatBytes(storageBytes), hint: "GLB + KTX2 artifacts", tone: "accent" },
  ];
}

const row = (label: string, value: string): Detail =>
  value === "—" || value === "0" ? { label, value, tone: "dim" } : { label, value };

export function inspectorDetails(item: ContentItem, artifacts: Artifact[], updatedAt: string | undefined): Detail[] {
  return [
    row("Artifacts", String(artifacts.length)),
    row("LODs", item.lods),
    row("Size", item.size),
    row("Updated", shortDate(updatedAt) ?? "—"),
  ];
}

/** The old SPA's upload forms; v2 has none. */
export const uploadHref = (kind: ContentKind): string =>
  kind === "territory" ? "/territories/new" : "/models/new";

/** Only a territory has a source-replace route. */
export const replaceHref = (item: ContentItem): string | null =>
  item.kind === "territory" ? `/territories/${encodeURIComponent(item.slug)}/replace` : null;
```

Run the spec — expected PASS.

- [ ] **Step 3: The container — spec first**

`src/pages/content/model/use-content.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useContent } from "./use-content";

const PRINCIPAL = {
  id: "me", email: "me@x", username: "me", status: "active", totpEnabled: true, totpRequired: false,
  passkeyEnabled: null, roleSlugs: ["editor"], roleTitles: { editor: "Editor" },
  permissions: ["territory:write", "territory:delete", "model:write"], isOwner: false, onboardingToursSeen: [],
};
const TERRITORY = { slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64), updatedAt: "2026-08-31T00:00:00Z" };
const MODEL = { slug: "m-1", title: "M 1", sourceBlobHash: "b".repeat(64) };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  clearNotices();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/territories" && method === "GET") return json([TERRITORY]);
    if (url === "/api/models" && method === "GET") return json([MODEL]);
    if (url === "/api/territories/t-1/artifacts") return json([{ slug: "t-1", lod: 0, hash: "h", contentType: "x", size: 1024 }]);
    if (url === "/api/models/m-1/artifacts") return json([]);
    if (url === "/api/territories/t-1" && method === "DELETE") return new Response(null, { status: 204 });
    if (url === "/api/models/m-1" && method === "DELETE")
      return json({ code: "invalid_input", message: "Model is placed in 2 territories." }, 400);
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

describe("useContent", () => {
  it("is loading until every artifacts query answered, then ready with rows and storage", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items?.map((i) => [i.slug, i.status, i.size])).toEqual([
      ["t-1", "ready", "1 KB"],
      ["m-1", "pending", "—"],
    ]);
    expect(result.current.storageBytes).toBe(1024);
    expect(result.current.canManage).toBe(true);
  });

  it("knows which kinds the viewer may delete", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.canDelete("territory")).toBe(true);
    expect(result.current.canDelete("model")).toBe(false);
  });

  it("selects a row and hands the inspector its artifacts and date", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("territory", "t-1"));
    expect(result.current.selected?.slug).toBe("t-1");
    expect(result.current.artifactsOf("territory", "t-1")).toEqual([{ lod: 0, size: 1024 }]);
    expect(result.current.updatedAtOf("territory", "t-1")).toBe("2026-08-31T00:00:00Z");
  });

  it("deletes only after confirm, toasts, refetches the list and clears the selection", async () => {
    const { result } = renderHook(() => ({ s: useContent(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("territory", "t-1"));
    act(() => result.current.s.ask());
    expect(result.current.s.pending?.slug).toBe("t-1");
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "DELETE")).toBe(false);
    act(() => result.current.s.confirm());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Territory deleted"));
    expect(result.current.s.selected).toBeNull();
    expect(result.current.s.pending).toBeNull();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u, i]) => u === "/api/territories" && !(i as RequestInit | undefined)?.method).length).toBe(2),
    );
  });

  it("reports the gateway's refusal when a model is still placed", async () => {
    const { result } = renderHook(() => ({ s: useContent(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("model", "m-1"));
    act(() => result.current.s.ask());
    act(() => result.current.s.confirm());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Model is placed in 2 territories."));
    expect(result.current.notices[0]?.tone).toBe("error");
  });

  it("is unavailable when the list is refused, with the gateway's sentence", async () => {
    fetchMock.mockImplementation(async () => json({ code: "forbidden", message: "You don't have permission to do this" }, 403));
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });

  it("stays ready when a refetch fails on top of rows it already has", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["territories"] });
    });
    expect(result.current.status).toBe("ready");
  });
});
```

Run: `yarn vitest run src/pages/content/model/use-content.spec.tsx` — expected FAIL, module not found.

- [ ] **Step 4: The container**

`src/pages/content/model/use-content.ts`:

```ts
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { artifactsQuery, totalSize, type Artifact, type ContentItem, type ContentKind } from "@/entities/content";
import { deleteModel, modelsQuery } from "@/entities/model";
import { deleteTerritory, territoriesQuery } from "@/entities/territory";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { toContentItem } from "./catalog";

type Ref = { kind: ContentKind; slug: string };
const keyOf = ({ kind, slug }: Ref) => `${kind}/${slug}`;

export type ContentState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  items: ContentItem[] | null;
  storageBytes: number;
  canManage: boolean;
  canDelete: (kind: ContentKind) => boolean;
  artifactsOf: (kind: ContentKind, slug: string) => Artifact[];
  updatedAtOf: (kind: ContentKind, slug: string) => string | undefined;
  query: string;
  setQuery: (q: string) => void;
  selected: ContentItem | null;
  select: (kind: ContentKind, slug: string) => void;
  deselect: () => void;
  /** The delete confirmation's subject, or null when none is open. */
  pending: ContentItem | null;
  ask: () => void;
  confirm: () => void;
  dismiss: () => void;
  busy: boolean;
};

const DONE: Record<ContentKind, string> = { territory: "Territory deleted", model: "Model deleted" };
const LIST_KEY: Record<ContentKind, string[]> = { territory: ["territories"], model: ["models"] };

/**
 * Everything the Content screen decides. The catalog is two lists plus one
 * artifacts query per row; the screen is ready only when all have answered,
 * because a row's status is read off its artifacts and a guess would print
 * "pending" for something that is merely still loading.
 */
export function useContent(): ContentState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const models = useQuery(modelsQuery);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, setPending] = useState<ContentItem | null>(null);

  const refs: Ref[] = [
    ...(territories.data ?? []).map((t) => ({ kind: "territory" as const, slug: t.slug })),
    ...(models.data ?? []).map((m) => ({ kind: "model" as const, slug: m.slug })),
  ];
  const artifacts = useQueries({
    queries: refs.map((r) => artifactsQuery(r.kind, r.slug)),
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      failed: results.map(unanswered).find((e) => e !== null) ?? null,
      bySlug: new Map(results.map((r, i) => [keyOf(refs[i]), r.data ?? []])),
    }),
  });

  const artifactsOf = (kind: ContentKind, slug: string) => artifacts.bySlug.get(keyOf({ kind, slug })) ?? [];
  const entityOf = (kind: ContentKind, slug: string) =>
    kind === "territory"
      ? territories.data?.find((t) => t.slug === slug)
      : models.data?.find((m) => m.slug === slug);

  const listed = territories.data && models.data;
  const items = listed
    ? [
        ...territories.data.map((t) => toContentItem("territory", t, artifactsOf("territory", t.slug))),
        ...models.data.map((m) => toContentItem("model", m, artifactsOf("model", m.slug))),
      ]
    : null;
  const selected = items?.find((i) => keyOf(i) === selectedKey) ?? null;

  const removal = useMutation({
    mutationFn: (item: ContentItem) =>
      item.kind === "territory" ? deleteTerritory(item.slug) : deleteModel(item.slug),
    onSuccess: (_, item) => {
      notify.success(DONE[item.kind]);
      setSelectedKey(null);
      void client.invalidateQueries({ queryKey: LIST_KEY[item.kind] });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(null),
  });

  const failed = unanswered(territories) ?? unanswered(models) ?? artifacts.failed;
  const loading = territories.isPending || models.isPending || artifacts.pending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    items,
    storageBytes: [...artifacts.bySlug.values()].reduce((sum, a) => sum + totalSize(a), 0),
    canManage: can(me, "territory:write") || can(me, "model:write"),
    canDelete: (kind) => can(me, kind === "territory" ? "territory:delete" : "model:delete"),
    artifactsOf,
    updatedAtOf: (kind, slug) => entityOf(kind, slug)?.updatedAt,
    query,
    setQuery,
    selected,
    select: (kind, slug) => setSelectedKey(keyOf({ kind, slug })),
    deselect: () => setSelectedKey(null),
    pending,
    ask: () => selected && setPending(selected),
    confirm: () => pending && removal.mutate(pending),
    dismiss: () => setPending(null),
    busy: removal.isPending,
  };
}
```

Check `can`'s signature in `src/shared/session/principal.ts` (it takes `Principal | null`); if it does not accept null, guard with `me ? can(me, …) : false`.

Run: `yarn vitest run src/pages/content/model` — expected PASS. If `useQueries`' `combine` typing complains about `unanswered`'s parameter, give `unanswered` the structural type it already declares (`{ data: unknown; error: E | null }`) — do not widen the helper.

- [ ] **Step 5: The screen — spec first**

`src/pages/content/ui/content-screen.spec.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/entities/content";
import type { ContentState } from "../model/use-content";
import { ContentScreen } from "./content-screen";

const { useContent, leaveTo } = vi.hoisted(() => ({ useContent: vi.fn(), leaveTo: vi.fn() }));
vi.mock("../model/use-content", () => ({ useContent }));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));

const T: ContentItem = { kind: "territory", slug: "t-1", title: "T 1", status: "ready", meta: "t-1 · upd. 31.08", lods: "LOD 0-2", size: "412 MB" };
const M: ContentItem = { kind: "model", slug: "m-1", title: "M 1", status: "pending", meta: "m-1", lods: "—", size: "—" };

const state = (over: Partial<ContentState> = {}): ContentState => ({
  status: "ready",
  error: null,
  items: [T, M],
  storageBytes: 412 * 1024 * 1024,
  canManage: true,
  canDelete: () => true,
  artifactsOf: () => [{ lod: 0, size: 1 }],
  updatedAtOf: () => "2026-08-31T00:00:00Z",
  query: "",
  setQuery: vi.fn(),
  selected: null,
  select: vi.fn(),
  deselect: vi.fn(),
  pending: null,
  ask: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
  busy: false,
  ...over,
});

beforeEach(() => {
  useContent.mockReset();
  leaveTo.mockReset();
});

describe("ContentScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useContent.mockReturnValue(state({ status: "loading", items: null }));
    const { unmount } = render(<ContentScreen />);
    expect(screen.getByRole("status", { name: "Loading content" })).toBeInTheDocument();
    unmount();
    useContent.mockReturnValue(state({ status: "unavailable", items: null, error: "You don't have permission to do this" }));
    render(<ContentScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to do this");
  });

  it("groups the rows and filters them through the model", () => {
    useContent.mockReturnValue(state({ query: "kind:model" }));
    render(<ContentScreen />);
    expect(screen.queryByRole("article", { name: "T 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "M 1" })).toBeInTheDocument();
  });

  it("sends the upload buttons into the old SPA", async () => {
    useContent.mockReturnValue(state());
    render(<ContentScreen />);
    await userEvent.click(screen.getByRole("button", { name: "+ Territory" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/new");
    await userEvent.click(screen.getByRole("button", { name: "+ Model" }));
    expect(leaveTo).toHaveBeenCalledWith("/models/new");
  });

  it("opens the inspector for a territory with replace, open and delete", async () => {
    const s = state({ selected: T });
    useContent.mockReturnValue(s);
    render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: T 1" });
    await userEvent.click(within(aside).getByRole("button", { name: "Replace source" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1/replace");
    await userEvent.click(within(aside).getByRole("button", { name: "Open in viewer" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1");
    await userEvent.click(within(aside).getByRole("button", { name: "Delete" }));
    expect(s.ask).toHaveBeenCalled();
  });

  it("draws no Replace source for a model and no Delete without the grant", () => {
    useContent.mockReturnValue(state({ selected: M, canDelete: () => false }));
    render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: M 1" });
    expect(within(aside).queryByRole("button", { name: "Replace source" })).not.toBeInTheDocument();
    expect(within(aside).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks before deleting and hands the answer to the container", async () => {
    const s = state({ selected: T, pending: T });
    useContent.mockReturnValue(s);
    render(<ContentScreen />);
    const dialog = screen.getByRole("dialog", { name: "Delete T 1?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(s.confirm).toHaveBeenCalled();
  });
});
```

Run: `yarn vitest run src/pages/content/ui/content-screen.spec.tsx` — expected FAIL, module not found.

- [ ] **Step 6: The screen**

`src/pages/content/ui/content-screen.tsx`:

```tsx
import { useMemo } from "react";
import { contentPath } from "@/entities/content";
import { leaveTo } from "@/shared/lib/leave";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  groupContent,
  inspectorDetails,
  matchesContent,
  pipelineOf,
  replaceHref,
  statsOf,
  uploadHref,
} from "../model/catalog";
import { useContent } from "../model/use-content";
import { ContentPage } from "./content-page";

const DESCRIPTION = {
  territory: "The territory, its placements, panoramas and documents are removed. Converted artifacts stay until nothing references them.",
  model: "The model is removed from the library. The gateway refuses while any territory still places it.",
} as const;

/** Maps the container onto the page and draws the confirm dialog beside it. */
export function ContentScreen() {
  const s = useContent();

  const groups = useMemo(
    () => (s.items ? groupContent(s.items.filter((i) => matchesContent(i, s.query))) : []),
    [s.items, s.query],
  );

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading content" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.items) {
    return <Callout tone="bad">Content is unavailable: {s.error}</Callout>;
  }

  const selected = s.selected;
  const replace = selected ? replaceHref(selected) : null;

  return (
    <>
      <ContentPage
        groups={groups}
        pipeline={pipelineOf(s.items)}
        stats={statsOf(s.items, s.storageBytes)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedSlug={selected?.slug ?? null}
        onSelect={(item) => s.select(item.kind, item.slug)}
        onCloseInspector={s.deselect}
        inspected={
          selected && {
            item: selected,
            details: inspectorDetails(
              selected,
              s.artifactsOf(selected.kind, selected.slug),
              s.updatedAtOf(selected.kind, selected.slug),
            ),
          }
        }
        canManage={s.canManage}
        onUploadTerritory={() => leaveTo(uploadHref("territory"))}
        onUploadModel={() => leaveTo(uploadHref("model"))}
        onReplaceSource={replace ? () => leaveTo(replace) : undefined}
        onOpenInViewer={() => selected && leaveTo(contentPath(selected))}
        onDelete={selected && s.canDelete(selected.kind) ? s.ask : undefined}
      />

      {s.pending ? (
        <ConfirmDialog
          open
          title={`Delete ${s.pending.title}?`}
          description={DESCRIPTION[s.pending.kind]}
          confirmLabel="Delete"
          tone="danger"
          busy={s.busy}
          onConfirm={s.confirm}
          onCancel={s.dismiss}
        />
      ) : null}
    </>
  );
}
```

`selectedSlug` on the page is a slug, and a territory and a model may share one — check `ContentGroups`/`ContentRow` compare on slug alone; if they do, the highlight is per slug and a shared slug highlights two rows. Acceptable for now: note it in the report as a deferred minor rather than changing the widget.

Add to `src/pages/content/index.ts`: `export { ContentScreen } from "./ui/content-screen";`. In `src/app/router/routes.tsx` import `ContentScreen` from `@/pages/content` and set `consoleContentRoute`'s `component: ContentScreen` (keep its `loader: gate("/console/content")`).

Run: `yarn vitest run src/pages/content` — expected PASS.

- [ ] **Step 7: Lint, suite, coverage, live**

`yarn lint && yarn test && yarn test:coverage`. Live as `admin` on http://localhost:3001: open `/console/content`; the skeleton, then two groups with real slugs; each ready territory shows a LOD range and a size, a never-converted one shows "—" and "pending"; the Storage tile is a plausible sum; select a territory — the inspector shows four detail rows; "Open in viewer" leaves for `/territories/{slug}` in the old SPA (the browser loads the old bundle); "+ Territory" leaves for `/territories/new`; filter `kind:model` hides the territories. Do **not** delete a real item; instead sign in as `cotest` (Company Owner, no `model:delete` unless the fixture says otherwise — check `/api/auth/me`) and confirm Delete is absent for a model and present for a territory as its grants dictate. Record what you saw.

- [ ] **Step 8: Commit**

```
feat(frontend-v2): the Content screen, live

A container over three queries — territories, models and one artifacts
query per row — so a row's status is read off its artifacts rather than
guessed; the screen is ready only when all have answered. Every decision
lives in model/catalog.ts. Upload, open-in-viewer and replace-source are
links into the old SPA through one leaveTo seam; delete goes through the
confirm dialog and is drawn only for a kind the viewer may delete.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 4: Territory admins gateway, the read-only visibility, the person picker

**Files:**
- Create: `frontend-v2/src/entities/territory/api/admins-gateway.ts`, `admins-gateway.spec.ts`, `admins-query.ts`, `admins-query.spec.ts`; modify `frontend-v2/src/entities/territory/index.ts`
- Modify: `frontend-v2/src/widgets/access-inspector/ui/access-inspector.tsx` (+ spec), `frontend-v2/src/pages/territory-access/ui/territory-access-page.tsx` (+ spec)
- Create: `frontend-v2/src/features/grant-access/index.ts`, `grant-access.fixture.tsx`, `ui/add-person-dialog.tsx`, `ui/add-person-dialog.spec.tsx`

**Interfaces:**
- Consumes: `httpGet/httpPut`, `components["schemas"]["TerritoryAdmins"]`; `Modal`, `Button`, `Dropdown`.
- Produces: `getTerritoryAdmins(slug): Promise<string[]>`; `setTerritoryAdmins(slug, userIds): Promise<void>`; `adminsQuery(slug)` (key `["territory-admins", slug]`); `AccessInspectorProps.onVisibilityChange?` and `TerritoryAccessPageProps.onVisibilityChange?`, `onBulkAssign?`; `AddPersonDialogProps = { open; options: { id: string; username: string; hint?: string }[]; busy?; onClose(); onAdd(userId) }`.

- [ ] **Step 1: Admins gateway — spec first**

`src/entities/territory/api/admins-gateway.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { getTerritoryAdmins, setTerritoryAdmins } from "./admins-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ userIds: ["u-1", "u-2"] })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("territory admins gateway", () => {
  it("reads the ids, defending against the gateway's null for none", async () => {
    await expect(getTerritoryAdmins("t 1")).resolves.toEqual(["u-1", "u-2"]);
    expect(request()).toEqual({ url: "/api/territories/t%201/admins", method: "GET", body: undefined });
    fetchMock.mockResolvedValueOnce(json({ userIds: null }));
    await expect(getTerritoryAdmins("t-2")).resolves.toEqual([]);
  });

  it("replaces the whole set with a PUT and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(setTerritoryAdmins("t-1", ["u-9"])).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/territories/t-1/admins", method: "PUT", body: { userIds: ["u-9"] } });
  });
});
```

`src/entities/territory/api/admins-query.spec.ts` — same shape as Task 1's query specs: `adminsQuery("t-1").queryKey` is `["territory-admins", "t-1"]` and its `queryFn` delegates to a mocked `getTerritoryAdmins` called with `"t-1"`.

Run: `yarn vitest run src/entities/territory/api/admins` — expected FAIL.

- [ ] **Step 2: The gateway and query**

`src/entities/territory/api/admins-gateway.ts`:

```ts
import { httpGet, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";

type TerritoryAdmins = components["schemas"]["TerritoryAdmins"];

const route = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/admins`;

// Root only on the gateway; the screen behind this is owner-gated to match.
// `?? []`: a Go nil slice marshals as JSON null when nobody is assigned.
export const getTerritoryAdmins = async (slug: string): Promise<string[]> =>
  (await httpGet<TerritoryAdmins>(route(slug))).userIds ?? [];

/** Replaces the whole set — the gateway's PUT semantics. */
export const setTerritoryAdmins = async (slug: string, userIds: string[]): Promise<void> => {
  await httpPut<unknown>(route(slug), { userIds });
};
```

Check `httpPut`'s handling of a 204 with no body in `shared/api/client.ts` (the users gateway's `deleteUser` goes through `httpDelete`, which handles it); if `httpPut<T>` tries to parse an empty body, follow whatever `client.ts` does for `httpDelete` — do not change the client.

`src/entities/territory/api/admins-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { getTerritoryAdmins } from "./admins-gateway";

export const adminsQuery = (slug: string) =>
  queryOptions({ queryKey: ["territory-admins", slug], queryFn: () => getTerritoryAdmins(slug) });
```

Add to `src/entities/territory/index.ts`:

```ts
export { getTerritoryAdmins, setTerritoryAdmins } from "./api/admins-gateway";
export { adminsQuery } from "./api/admins-query";
```

Run: `yarn vitest run src/entities/territory/api` — expected PASS.

- [ ] **Step 3: The inspector without a switch — spec first**

Add to `src/widgets/access-inspector/ui/access-inspector.spec.tsx` (reuse its `props()` helper):

```tsx
  it("shows the visibility as a sentence and always lists people when it cannot be changed", () => {
    render(<AccessInspector {...props({ visibility: "private", onVisibilityChange: undefined, grants: [] })} />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Owner only")).toBeInTheDocument();
    expect(screen.getByText("Nobody can open this territory yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ add person" })).toBeInTheDocument();
  });
```

Check how `RadioCards` exposes its group role (`radiogroup` or a `group` with the label "Visibility") in `src/shared/ui/radio-card` and query by that. Run it — expected FAIL.

- [ ] **Step 4: Implement**

In `src/widgets/access-inspector/ui/access-inspector.tsx`:

```ts
  /** Absent when the gateway offers no switch — the visibility is then only shown. */
  onVisibilityChange?: (visibility: Visibility) => void;
```

Replace `const listsPeople = visibility === "assigned";` with:

```ts
  // With a switch, the people list only means anything for per-person
  // access. Without one, visibility is derived from the list itself, so the
  // list is always the thing to edit.
  const listsPeople = !onVisibilityChange || visibility === "assigned";
```

and render the Visibility block as:

```tsx
        <div>
          <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            Visibility
          </p>
          {onVisibilityChange ? (
            <RadioCards … onChange={onVisibilityChange} … />
          ) : (
            <p className="m-0 text-[13px] text-fg">
              {VISIBILITY_TITLE[visibility]}
              <span className="ml-2 text-[11px] text-muted">{VISIBILITY_HINT[visibility]}</span>
            </p>
          )}
        </div>
```

Update `VISIBILITY_HINT.private` to read "Only Root can open it until someone is assigned." — the old sentence claimed "you", which is wrong for the derived state.

In `src/pages/territory-access/ui/territory-access-page.tsx` make `onVisibilityChange?` and `onBulkAssign?` optional; render the header `action` only when `canManage && onBulkAssign`; pass `onVisibilityChange` through as-is. Add to `territory-access-page.spec.tsx` one case: with both undefined and a `managed` territory, there is no "Bulk assign" button and no radiogroup.

Run: `yarn vitest run src/widgets/access-inspector src/pages/territory-access` — expected PASS. Update `src/pages/territory-access/territory-access-page.fixture.tsx` only if lint complains (it passes both props, which stays valid).

- [ ] **Step 5: The person picker — spec, component, fixture, barrel**

`src/features/grant-access/ui/add-person-dialog.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddPersonDialog } from "./add-person-dialog";

const OPTIONS = [
  { id: "u-1", username: "a.ivanova", hint: "Editor" },
  { id: "u-2", username: "k.petrov" },
];

describe("AddPersonDialog", () => {
  it("offers everyone not yet assigned, defaults to the first and adds by id", async () => {
    const onAdd = vi.fn();
    render(<AddPersonDialog open options={OPTIONS} onClose={vi.fn()} onAdd={onAdd} />);
    expect(screen.getByRole("dialog", { name: "Add person" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /a\.ivanova/ }));
    expect(screen.getByRole("option", { name: /k\.petrov/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /k\.petrov/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(onAdd).toHaveBeenCalledWith("u-2");
  });

  it("says so when everyone already has access, and disables Add while busy", () => {
    const { rerender } = render(<AddPersonDialog open options={[]} onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("Everyone already has access.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add person" })).not.toBeInTheDocument();
    rerender(<AddPersonDialog open options={OPTIONS} busy onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();
  });
});
```

(Mirror `src/features/role-assign/ui/add-role-dialog.spec.tsx`'s exact way of opening the `Dropdown` and picking an option; the trigger's accessible name is the selected label.)

`src/features/grant-access/ui/add-person-dialog.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";

export type PersonOption = { id: string; username: string; hint?: string };

export type AddPersonDialogProps = {
  open: boolean;
  /** Accounts that do not have access yet. */
  options: PersonOption[];
  busy?: boolean;
  onClose: () => void;
  onAdd: (userId: string) => void;
};

/** One pick from whoever is left. Mount only while open so the pick resets. */
export function AddPersonDialog({ open, options, busy = false, onClose, onAdd }: AddPersonDialogProps) {
  const [id, setId] = useState(options[0]?.id ?? "");
  const exhausted = options.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Territory access"
      title="Add person"
      description={exhausted ? "Everyone already has access." : "They can open this territory once you save."}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {exhausted ? null : (
            <Button variant="primary" onClick={() => onAdd(id)} loading={busy}>
              Add person
            </Button>
          )}
        </>
      }
    >
      {exhausted ? null : (
        <Dropdown
          label="Person"
          options={options.map((p) => ({ value: p.id, label: p.username, ...(p.hint ? { hint: p.hint } : {}) }))}
          value={id}
          onChange={setId}
          disabled={busy}
        />
      )}
    </Modal>
  );
}
```

`src/features/grant-access/index.ts`: `export { AddPersonDialog, type AddPersonDialogProps, type PersonOption } from "./ui/add-person-dialog";`

`src/features/grant-access/grant-access.fixture.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { AddPersonDialog } from "./ui/add-person-dialog";

const OPTIONS = [
  { id: "u-1", username: "a.ivanova", hint: "Editor" },
  { id: "u-2", username: "k.petrov", hint: "Field Operator" },
];

function Demo({ options }: { options: typeof OPTIONS }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Add person</Button>
      {open ? <AddPersonDialog open options={options} onClose={() => setOpen(false)} onAdd={() => setOpen(false)} /> : null}
    </div>
  );
}

export default {
  WithOptions: <Demo options={OPTIONS} />,
  Exhausted: <Demo options={[]} />,
};
```

Run: `yarn vitest run src/features/grant-access src/fixtures.spec.tsx` — expected PASS.

- [ ] **Step 6: Lint, suite, commit**

`yarn lint && yarn test`. Commit (`--no-verify`, `frontend-v2` only):

```
feat(frontend-v2): territory admins gateway, a read-only visibility, a person picker

getTerritoryAdmins/setTerritoryAdmins over the Root-only admins route with
a per-territory queryOptions. The access inspector's visibility switch is
optional — the gateway offers no such thing, so the panel shows the derived
state as a sentence and always lists people; Bulk assign is optional on the
page for the same reason. AddPersonDialog is the AddRoleDialog shape over
accounts.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 5: The Territory access screen, docs and the live pass

**Files:**
- Create: `frontend-v2/src/pages/territory-access/model/access-view.ts`, `access-view.spec.ts`, `use-territory-access.ts`, `use-territory-access.spec.tsx`
- Create: `frontend-v2/src/pages/territory-access/ui/territory-access-screen.tsx`, `territory-access-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/territory-access/index.ts`, `frontend-v2/src/app/router/routes.tsx`
- Modify: `frontend-v2/README.md`, `frontend-v2/CLAUDE.md`, root `CLAUDE.md` (the "Two frontends" paragraph)

**Interfaces:**
- Consumes: Task 1's `territoriesQuery`; Task 4's `adminsQuery`, `setTerritoryAdmins`, `AddPersonDialog`; `usersQuery`, `meQuery`, `User`, `roleTitle`; `shortDate`; `notify`, `messageOf`, `unanswered`.
- Produces: `toTerritoryAccess(territory, userIds, users)`, `grantsOf(userIds, users)`, `matchesAccess(item, grants, query)`, `groupAccess(items)`, `mixOf(items)`, `statsOf(items, adminsBySlug)`, `sameSet(a, b)`, `candidatesOf(users, draftIds)`; `useTerritoryAccess(): AccessState`; `TerritoryAccessScreen` on `/console/access`.

- [ ] **Step 1: Pure view functions — spec first**

`src/pages/territory-access/model/access-view.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TerritoryAccess } from "@/entities/territory";
import type { User } from "@/entities/user";
import {
  candidatesOf,
  grantsOf,
  groupAccess,
  matchesAccess,
  mixOf,
  sameSet,
  statsOf,
  toTerritoryAccess,
} from "./access-view";

const user = (over: Partial<User>): User => ({
  id: "u", username: "u", email: "u@x", status: "active", totpEnabled: null, passkeyEnabled: null,
  totpRequired: false, roleSlugs: [], roleTitles: {}, isOwner: false, ...over,
});
const USERS = [
  user({ id: "u-1", username: "a.ivanova", roleSlugs: ["editor"], roleTitles: { editor: "Editor" } }),
  user({ id: "u-2", username: "k.petrov", status: "frozen" }),
  user({ id: "u-3", username: "m.orlova", roleSlugs: ["guest"], roleTitles: { guest: "Guest" } }),
];
const T = { slug: "refinery-block-c", title: "Refinery Block C", sourceBlobHash: "a".repeat(64), updatedAt: "2026-08-29T00:00:00Z" };
const item = (over: Partial<TerritoryAccess> = {}): TerritoryAccess => ({
  slug: "t", title: "T", visibility: "assigned", meta: "t", faces: [], peopleLabel: "1 person", ...over,
});

describe("toTerritoryAccess", () => {
  it("is assigned with admins, naming up to four faces and counting people", () => {
    expect(toTerritoryAccess(T, ["u-1", "u-2", "u-9"], USERS)).toEqual({
      slug: "refinery-block-c",
      title: "Refinery Block C",
      visibility: "assigned",
      meta: "refinery-block-c · upd. 29.08",
      faces: ["a.ivanova", "k.petrov", "u-9"],
      peopleLabel: "3 people",
    });
    expect(toTerritoryAccess(T, ["u-1", "u-2", "u-3", "u-9", "u-10"], USERS).faces).toHaveLength(4);
  });

  it("is private with nobody, worded owner only, and the meta is the slug without a date", () => {
    expect(toTerritoryAccess({ ...T, updatedAt: undefined }, [], USERS)).toEqual({
      slug: "refinery-block-c", title: "Refinery Block C", visibility: "private",
      meta: "refinery-block-c", faces: [], peopleLabel: "owner only",
    });
    expect(toTerritoryAccess(T, ["u-1"], USERS).peopleLabel).toBe("1 person");
  });
});

describe("grantsOf", () => {
  it("names each id, dims a frozen or unknown account, and every grant is direct", () => {
    expect(grantsOf(["u-1", "u-2", "u-9"], USERS)).toEqual([
      { userId: "u-1", username: "a.ivanova", roleTitle: "Editor", via: "direct" },
      { userId: "u-2", username: "k.petrov", roleTitle: "—", via: "direct", inactive: true },
      { userId: "u-9", username: "u-9", roleTitle: "—", via: "direct", inactive: true },
    ]);
  });
});

describe("matchesAccess", () => {
  it("narrows by visibility, by a person's name and by free text", () => {
    const grants = grantsOf(["u-1"], USERS);
    const shared = item({ slug: "refinery", title: "Refinery Block C" });
    expect(matchesAccess(shared, grants, "visibility:assigned")).toBe(true);
    expect(matchesAccess(shared, grants, "visibility:private")).toBe(false);
    expect(matchesAccess(shared, grants, "person:ivanova")).toBe(true);
    expect(matchesAccess(shared, grants, "person:petrov")).toBe(false);
    expect(matchesAccess(shared, grants, "refinery block")).toBe(true);
    expect(matchesAccess(shared, grants, "colour:blue")).toBe(true);
  });
});

describe("groupAccess, mixOf, statsOf", () => {
  it("splits shared from not shared and counts distinct people", () => {
    const items = [item({ slug: "a" }), item({ slug: "b", visibility: "private" }), item({ slug: "c" })];
    expect(groupAccess(items).map((g) => [g.key, g.label, g.note, g.territories.map((t) => t.slug)])).toEqual([
      ["shared", "Shared", "2 territories", ["a", "c"]],
      ["not-shared", "Not shared", "1 territory", ["b"]],
    ]);
    expect(mixOf(items)).toEqual({
      label: "Access mix",
      detail: "3 territories",
      segments: [
        { tone: "accent", value: 2, label: "shared" },
        { tone: "neutral", value: 1, label: "not shared" },
      ],
    });
    expect(statsOf(items, { a: ["u-1", "u-2"], b: [], c: ["u-2"] })).toEqual([
      { label: "Territories", value: "3", hint: "2 shared" },
      { label: "Not shared", value: "1", hint: "only Root can open", tone: "warn" },
      { label: "People with access", value: "2", hint: "distinct accounts" },
    ]);
  });
});

describe("drafts", () => {
  it("compares sets regardless of order and offers only active accounts not yet in the draft", () => {
    expect(sameSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSet(["a"], ["a", "b"])).toBe(false);
    expect(candidatesOf(USERS, ["u-1"]).map((p) => p.id)).toEqual(["u-3"]);
    expect(candidatesOf(USERS, ["u-1"])[0]).toEqual({ id: "u-3", username: "m.orlova", hint: "Guest" });
  });
});
```

Run: `yarn vitest run src/pages/territory-access/model/access-view.spec.ts` — expected FAIL.

- [ ] **Step 2: The functions**

`src/pages/territory-access/model/access-view.ts`:

```ts
import type { AccessGrant, Territory, TerritoryAccess } from "@/entities/territory";
import { roleTitle, type User } from "@/entities/user";
import type { PersonOption } from "@/features/grant-access";
import { freeText, parseFilters } from "@/features/audit-filter";
import { shortDate } from "@/shared/lib/short-date";
import type { AccessGroup } from "@/widgets/access-groups";
import type { AccessPageStat, TerritoryAccessPageProps } from "../ui/territory-access-page";

const MAX_FACES = 4;

const byId = (users: User[]) => new Map(users.map((u) => [u.id, u]));
const nameOf = (users: Map<string, User>, id: string) => users.get(id)?.username ?? id;

const people = (n: number) => (n === 0 ? "owner only" : n === 1 ? "1 person" : `${n} people`);

/** A row of the access list. Visibility is read off the admins: anyone assigned, or nobody. */
export function toTerritoryAccess(territory: Territory, userIds: string[], users: User[]): TerritoryAccess {
  const known = byId(users);
  const date = shortDate(territory.updatedAt);
  return {
    slug: territory.slug,
    title: territory.title,
    visibility: userIds.length > 0 ? "assigned" : "private",
    meta: date ? `${territory.slug} · upd. ${date}` : territory.slug,
    faces: userIds.slice(0, MAX_FACES).map((id) => nameOf(known, id)),
    peopleLabel: people(userIds.length),
  };
}

/** Every grant is a row in territory_assignments — direct, revocable here. */
export function grantsOf(userIds: string[], users: User[]): AccessGrant[] {
  const known = byId(users);
  return userIds.map((userId) => {
    const user = known.get(userId);
    const first = user?.roleSlugs[0];
    const grant: AccessGrant = {
      userId,
      username: user?.username ?? userId,
      roleTitle: user && first ? roleTitle(user, first) : "—",
      via: "direct",
    };
    return !user || user.status !== "active" ? { ...grant, inactive: true } : grant;
  });
}

/** visibility: and person: chips plus free text on title or slug. Unknown keys are ignored. */
export function matchesAccess(item: TerritoryAccess, grants: AccessGrant[], query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "visibility" && item.visibility !== value) return false;
    if (key === "person" && !grants.some((g) => g.username.toLowerCase().includes(value.toLowerCase()))) return false;
  }
  const text = freeText(query).trim().toLowerCase();
  return text === "" || item.title.toLowerCase().includes(text) || item.slug.toLowerCase().includes(text);
}

const count = (n: number) => `${n} ${n === 1 ? "territory" : "territories"}`;

export function groupAccess(items: TerritoryAccess[]): AccessGroup[] {
  const shared = items.filter((t) => t.visibility === "assigned");
  const alone = items.filter((t) => t.visibility !== "assigned");
  return [
    { key: "shared", label: "Shared", note: count(shared.length), territories: shared },
    { key: "not-shared", label: "Not shared", note: count(alone.length), territories: alone },
  ];
}

export function mixOf(items: TerritoryAccess[]): TerritoryAccessPageProps["mix"] {
  const shared = items.filter((t) => t.visibility === "assigned").length;
  return {
    label: "Access mix",
    detail: count(items.length),
    segments: [
      { tone: "accent", value: shared, label: "shared" },
      { tone: "neutral", value: items.length - shared, label: "not shared" },
    ],
  };
}

export function statsOf(items: TerritoryAccess[], adminsBySlug: Record<string, string[]>): AccessPageStat[] {
  const shared = items.filter((t) => t.visibility === "assigned").length;
  const distinct = new Set(Object.values(adminsBySlug).flat()).size;
  return [
    { label: "Territories", value: String(items.length), hint: `${shared} shared` },
    { label: "Not shared", value: String(items.length - shared), hint: "only Root can open", tone: "warn" },
    { label: "People with access", value: String(distinct), hint: "distinct accounts" },
  ];
}

export const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Whoever could still be added: active accounts not already in the draft. */
export function candidatesOf(users: User[], draftIds: string[]): PersonOption[] {
  const taken = new Set(draftIds);
  return users
    .filter((u) => u.status === "active" && !taken.has(u.id))
    .map((u) => {
      const first = u.roleSlugs[0];
      return { id: u.id, username: u.username, ...(first ? { hint: roleTitle(u, first) } : {}) };
    });
}
```

Run the spec — expected PASS.

- [ ] **Step 3: The container — spec first**

`src/pages/territory-access/model/use-territory-access.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useTerritoryAccess } from "./use-territory-access";

const ROOT = {
  id: "root", email: "root@x", username: "admin", status: "active", totpEnabled: true, totpRequired: false,
  passkeyEnabled: null, roleSlugs: [], roleTitles: {}, permissions: [], isOwner: true, onboardingToursSeen: [],
};
const USERS = [
  { id: "u-1", email: "a@x", username: "a.ivanova", status: "active", roleSlugs: ["editor"], roleTitles: { editor: "Editor" }, permissions: [], isOwner: false, totpRequired: false },
  { id: "u-2", email: "k@x", username: "k.petrov", status: "active", roleSlugs: [], roleTitles: {}, permissions: [], isOwner: false, totpRequired: false },
];
const T1 = { slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64) };
const T2 = { slug: "t-2", title: "T 2", sourceBlobHash: "b".repeat(64) };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], ROOT);
  setCsrfToken("csrf");
  clearNotices();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/territories") return json([T1, T2]);
    if (url.startsWith("/api/auth/users")) return json(USERS);
    if (url === "/api/territories/t-1/admins" && method === "GET") return json({ userIds: ["u-1"] });
    if (url === "/api/territories/t-2/admins" && method === "GET") return json({ userIds: null });
    if (url === "/api/territories/t-1/admins" && method === "PUT") return new Response(null, { status: 204 });
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

const puts = () => fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PUT");

describe("useTerritoryAccess", () => {
  it("is loading until every admins query answered, then ready with rows and grants", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories?.map((t) => [t.slug, t.visibility, t.peopleLabel])).toEqual([
      ["t-1", "assigned", "1 person"],
      ["t-2", "private", "owner only"],
    ]);
    expect(result.current.grantsOf("t-1").map((g) => g.username)).toEqual(["a.ivanova"]);
    expect(result.current.grantsOf("t-2")).toEqual([]);
    expect(result.current.canManage).toBe(true);
  });

  it("edits a draft per territory, keeps it across a switch, and cancels one", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("t-1"));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.add("u-2"));
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-1", "u-2"]);
    expect(result.current.dirty).toBe(true);
    act(() => result.current.select("t-2"));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.select("t-1"));
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-1", "u-2"]);
    act(() => result.current.remove("u-1"));
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-2"]);
    act(() => result.current.cancel());
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-1"]);
    expect(result.current.dirty).toBe(false);
  });

  it("offers as candidates only active accounts not in the draft", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("t-1"));
    expect(result.current.candidates.map((c) => c.id)).toEqual(["u-2"]);
  });

  it("saves the whole draft with one PUT, toasts and refetches that territory only", async () => {
    const { result } = renderHook(() => ({ s: useTerritoryAccess(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("t-1"));
    act(() => result.current.s.add("u-2"));
    act(() => result.current.s.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Access saved"));
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(puts()[0][1].body as string)).toEqual({ userIds: ["u-1", "u-2"] });
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u, i]) => u === "/api/territories/t-1/admins" && !(i as RequestInit | undefined)?.method)).toHaveLength(2),
    );
    expect(fetchMock.mock.calls.filter(([u, i]) => u === "/api/territories/t-2/admins" && !(i as RequestInit | undefined)?.method)).toHaveLength(1);
  });

  it("does nothing on save when nothing changed", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("t-1"));
    act(() => result.current.save());
    expect(puts()).toHaveLength(0);
  });

  it("reports a refused save with the gateway's sentence and keeps the draft", async () => {
    const { result } = renderHook(() => ({ s: useTerritoryAccess(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("t-2"));
    act(() => result.current.s.add("u-1"));
    act(() => result.current.s.save());
    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
    expect(result.current.s.dirty).toBe(true);
  });

  it("is unavailable when the territories list is refused", async () => {
    fetchMock.mockImplementation(async () => json({ code: "forbidden", message: "You don't have permission to do this" }, 403));
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });
});
```

Run: `yarn vitest run src/pages/territory-access/model/use-territory-access.spec.tsx` — expected FAIL.

- [ ] **Step 4: The container**

`src/pages/territory-access/model/use-territory-access.ts`:

```ts
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminsQuery,
  setTerritoryAdmins,
  territoriesQuery,
  type AccessGrant,
  type TerritoryAccess,
} from "@/entities/territory";
import { meQuery, usersQuery } from "@/entities/user";
import type { PersonOption } from "@/features/grant-access";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { candidatesOf, grantsOf, sameSet, toTerritoryAccess } from "./access-view";

export type AccessState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  territories: TerritoryAccess[] | null;
  adminsBySlug: Record<string, string[]>;
  grantsOf: (slug: string) => AccessGrant[];
  canManage: boolean;
  query: string;
  setQuery: (q: string) => void;
  selected: TerritoryAccess | null;
  select: (slug: string | null) => void;
  /** The selected territory's grants as edited, or as saved when untouched. */
  draft: AccessGrant[];
  dirty: boolean;
  add: (userId: string) => void;
  remove: (userId: string) => void;
  cancel: () => void;
  save: () => void;
  saving: boolean;
  candidates: PersonOption[];
  adding: boolean;
  setAdding: (open: boolean) => void;
};

/**
 * Everything the Territory access screen decides. One admins query per
 * territory; drafts are kept per slug so switching territories loses
 * nothing; save is one PUT of the whole set.
 */
export function useTerritoryAccess(): AccessState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const users = useQuery(usersQuery);
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState(false);

  const slugs = (territories.data ?? []).map((t) => t.slug);
  const admins = useQueries({
    queries: slugs.map(adminsQuery),
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      failed: results.map(unanswered).find((e) => e !== null) ?? null,
      bySlug: Object.fromEntries(results.map((r, i) => [slugs[i], r.data ?? []])) as Record<string, string[]>,
    }),
  });

  const known = users.data ?? [];
  const rows =
    territories.data && users.data
      ? territories.data.map((t) => toTerritoryAccess(t, admins.bySlug[t.slug] ?? [], known))
      : null;
  const selected = rows?.find((t) => t.slug === selectedSlug) ?? null;
  const savedIds = selectedSlug ? (admins.bySlug[selectedSlug] ?? []) : [];
  const draftIds = selectedSlug ? (drafts[selectedSlug] ?? savedIds) : [];
  const dirty = selectedSlug !== null && !sameSet(draftIds, savedIds);

  const edit = (ids: string[]) => selectedSlug && setDrafts((d) => ({ ...d, [selectedSlug]: ids }));
  const dropDraft = (slug: string) =>
    setDrafts(({ [slug]: _dropped, ...rest }) => rest);

  const saving = useMutation({
    mutationFn: ({ slug, ids }: { slug: string; ids: string[] }) => setTerritoryAdmins(slug, ids),
    onSuccess: (_, { slug }) => {
      notify.success("Access saved");
      dropDraft(slug);
      void client.invalidateQueries({ queryKey: ["territory-admins", slug] });
    },
    onError: (err) => notify.error(messageOf(err)),
  });

  const failed = unanswered(territories) ?? unanswered(users) ?? admins.failed;
  const loading = territories.isPending || users.isPending || admins.pending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    territories: rows,
    adminsBySlug: admins.bySlug,
    grantsOf: (slug) => grantsOf(admins.bySlug[slug] ?? [], known),
    canManage: me?.isOwner ?? false,
    query,
    setQuery,
    selected,
    select: setSelectedSlug,
    draft: grantsOf(draftIds, known),
    dirty,
    add: (userId) => {
      edit([...draftIds, userId]);
      setAdding(false);
    },
    remove: (userId) => edit(draftIds.filter((id) => id !== userId)),
    cancel: () => selectedSlug && dropDraft(selectedSlug),
    save: () => dirty && selectedSlug && saving.mutate({ slug: selectedSlug, ids: draftIds }),
    saving: saving.isPending,
    candidates: candidatesOf(known, draftIds),
    adding,
    setAdding,
  };
}
```

Run: `yarn vitest run src/pages/territory-access/model` — expected PASS.

- [ ] **Step 5: The screen — spec first**

`src/pages/territory-access/ui/territory-access-screen.spec.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessGrant, TerritoryAccess } from "@/entities/territory";
import type { AccessState } from "../model/use-territory-access";
import { TerritoryAccessScreen } from "./territory-access-screen";

const { useTerritoryAccess } = vi.hoisted(() => ({ useTerritoryAccess: vi.fn() }));
vi.mock("../model/use-territory-access", () => ({ useTerritoryAccess }));

const SHARED: TerritoryAccess = { slug: "t-1", title: "T 1", visibility: "assigned", meta: "t-1", faces: ["a.ivanova"], peopleLabel: "1 person" };
const ALONE: TerritoryAccess = { slug: "t-2", title: "T 2", visibility: "private", meta: "t-2", faces: [], peopleLabel: "owner only" };
const GRANT: AccessGrant = { userId: "u-1", username: "a.ivanova", roleTitle: "Editor", via: "direct" };

const state = (over: Partial<AccessState> = {}): AccessState => ({
  status: "ready",
  error: null,
  territories: [SHARED, ALONE],
  adminsBySlug: { "t-1": ["u-1"], "t-2": [] },
  grantsOf: (slug) => (slug === "t-1" ? [GRANT] : []),
  canManage: true,
  query: "",
  setQuery: vi.fn(),
  selected: null,
  select: vi.fn(),
  draft: [],
  dirty: false,
  add: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
  save: vi.fn(),
  saving: false,
  candidates: [{ id: "u-2", username: "k.petrov" }],
  adding: false,
  setAdding: vi.fn(),
  ...over,
});

beforeEach(() => useTerritoryAccess.mockReset());

describe("TerritoryAccessScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useTerritoryAccess.mockReturnValue(state({ status: "loading", territories: null }));
    const { unmount } = render(<TerritoryAccessScreen />);
    expect(screen.getByRole("status", { name: "Loading territories" })).toBeInTheDocument();
    unmount();
    useTerritoryAccess.mockReturnValue(state({ status: "unavailable", territories: null, error: "boom" }));
    render(<TerritoryAccessScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("groups shared from not shared and filters by person", () => {
    useTerritoryAccess.mockReturnValue(state({ query: "person:ivanova" }));
    render(<TerritoryAccessScreen />);
    expect(screen.getByRole("article", { name: "T 1" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "T 2" })).not.toBeInTheDocument();
  });

  it("draws no Bulk assign and no visibility switch", () => {
    useTerritoryAccess.mockReturnValue(state({ selected: SHARED, draft: [GRANT] }));
    render(<TerritoryAccessScreen />);
    expect(screen.queryByRole("button", { name: "Bulk assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Assigned people")).toBeInTheDocument();
  });

  it("removes, adds through the dialog, and saves through the container", async () => {
    const s = state({ selected: SHARED, draft: [GRANT], dirty: true, adding: true });
    useTerritoryAccess.mockReturnValue(s);
    render(<TerritoryAccessScreen />);
    const aside = screen.getByRole("complementary", { name: "Access: T 1" });
    await userEvent.click(within(aside).getByRole("button", { name: /Remove/ }));
    expect(s.remove).toHaveBeenCalledWith("u-1");
    const dialog = screen.getByRole("dialog", { name: "Add person" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add person" }));
    expect(s.add).toHaveBeenCalledWith("u-2");
    await userEvent.click(within(aside).getByRole("button", { name: "Save access" }));
    expect(s.save).toHaveBeenCalled();
  });
});
```

(Check `GrantRow`'s remove button name in `src/widgets/access-inspector/ui/grant-row.tsx` and adjust the `/Remove/` matcher to its exact accessible name.)

Run — expected FAIL, module not found.

- [ ] **Step 6: The screen**

`src/pages/territory-access/ui/territory-access-screen.tsx`:

```tsx
import { useMemo } from "react";
import { AddPersonDialog } from "@/features/grant-access";
import { Callout } from "@/shared/ui/callout";
import { Skeleton } from "@/shared/ui/skeleton";
import { groupAccess, matchesAccess, mixOf, statsOf } from "../model/access-view";
import { useTerritoryAccess } from "../model/use-territory-access";
import { TerritoryAccessPage } from "./territory-access-page";

/** Maps the container onto the page and draws the person picker beside it. */
export function TerritoryAccessScreen() {
  const s = useTerritoryAccess();

  const groups = useMemo(
    () =>
      s.territories
        ? groupAccess(s.territories.filter((t) => matchesAccess(t, s.grantsOf(t.slug), s.query)))
        : [],
    [s.territories, s.grantsOf, s.query],
  );

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading territories" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.territories) {
    return <Callout tone="bad">Territory access is unavailable: {s.error}</Callout>;
  }

  const selected = s.selected;

  return (
    <>
      <TerritoryAccessPage
        groups={groups}
        mix={mixOf(s.territories)}
        stats={statsOf(s.territories, s.adminsBySlug)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedSlug={selected?.slug ?? null}
        onManage={(t) => s.select(t.slug)}
        onCloseInspector={() => s.select(null)}
        managed={
          selected && {
            territory: selected,
            visibility: s.draft.length > 0 ? "assigned" : "private",
            grants: s.draft,
            dirty: s.dirty,
            saving: s.saving,
          }
        }
        onAddPerson={() => s.setAdding(true)}
        onRemoveGrant={s.remove}
        onCancel={s.cancel}
        onSave={s.save}
        canManage={s.canManage}
      />

      {s.adding && selected ? (
        <AddPersonDialog
          open
          options={s.candidates}
          busy={s.saving}
          onClose={() => s.setAdding(false)}
          onAdd={s.add}
        />
      ) : null}
    </>
  );
}
```

`grantsOf` is a new closure on every render of the hook, so the `useMemo` above recomputes every render; that is the same shape Part 2 shipped and is a deferred minor, not a blocker — note it in the report.

Add to `src/pages/territory-access/index.ts`: `export { TerritoryAccessScreen } from "./ui/territory-access-screen";`. In `src/app/router/routes.tsx` import it from `@/pages/territory-access` and set `consoleAccessRoute`'s `component: TerritoryAccessScreen` (keep `loader: gate("/console/access")`).

Run: `yarn vitest run src/pages/territory-access` — expected PASS.

- [ ] **Step 7: Docs**

- `frontend-v2/CLAUDE.md` "What is wired": add Content and Territory access with one sentence each (artifacts fan-out and derived status; admins fan-out, derived visibility, per-slug drafts); "Not done yet": now two placeholders (Audit, Metrics); list the not-drawn controls (replace-source for a model, cancel job, visibility switch, bulk assign) with the reason in half a sentence each; a trap line: "`ConversionStatus` `pending` means no artifacts — v2 starts no jobs, so nothing ever shows `converting` until an upload form exists here."
- `frontend-v2/README.md`: the "Users and Roles are live; the other four console screens are placeholders" sentence becomes "Users, Roles, Content and Territory access are live; Audit and Metrics are placeholders", and the features table gains `grant-access`.
- Root `CLAUDE.md` "Two frontends": "Users, Roles, Content and Territory access are wired; Audit and Metrics are placeholders."

- [ ] **Step 8: Lint, suite, coverage, live**

`yarn lint && yarn test && yarn test:coverage`. Live as `admin`: `/console/access` shows every territory split Shared / Not shared with real faces and counts; select one, "+ add person" opens the dialog with accounts not yet assigned, pick `cotest2`, the row appears, Save → "Access saved" toast; reload, the grant persists; remove it, Save, reload, gone. Open a second territory with an unsaved edit on the first, come back — the edit is still there; Cancel drops it. Sign in as `cotest`: `/console/access` bounces to `/console` (owner gate). Record what you saw, and leave the stack as you found it (no lasting grants).

- [ ] **Step 9: Commit**

```
feat(frontend-v2): the Territory access screen, live

A container over territories, the users list and one admins query per
territory; visibility is read off the admins (anyone assigned, or nobody),
every grant is direct, drafts are kept per slug and saved with one PUT.
Docs say which controls are deliberately not drawn and why.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

## After this plan

- **Part 4 (Audit + Metrics)** gets its own plan from the survey's Parts 4a/4b.
- **Backend follow-ups filed, not built:** `conversionStatus` on catalog rows (survey C1c); a source-replace route for models (C4); `request_id` on audit entries (D5); a `services-up` metrics panel (M1c).
- **Deferred minors carried from this plan:** `selectedSlug` on `ContentPage` cannot tell a territory from a model with the same slug; `grantsOf` closure defeats the screen's `useMemo`.
