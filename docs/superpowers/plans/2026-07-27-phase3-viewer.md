# Ф3-viewer: перенос роута `/territories/:slug` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести самый тяжёлый роут — 3D-вьюер территории `/territories/:slug` — с Next-RSC на TanStack-роут: loader через `sceneBundleQuery`, ветка ConversionPending при отсутствии артефакта, иначе полноэкранный `ViewerEntry`. Переиспользуем всё 3D-дерево как есть; свопаем только 4 файла с Next-API + 2 шаред-URL.

**Architecture:** `getSceneBundle` (уже на браузерном `httpGet`) оборачиваем в `sceneBundleQuery(slug)`. Роут под `authedLayoutRoute` (гард наследуется): loader `ensureQueryData` (404 → `notFound()`), `pendingComponent: ViewerSkeleton`, компонент читает bundle из query и ветвится conversion/viewer. Ассеты и SSE переводим с same-origin/`NEXT_PUBLIC_*` на абсолютный `VITE_API_URL` (по Ф0 они неаутентифицированы + под CORS). Конверсионный поллинг: `router.refresh()` → инвалидация `["scene", slug]`.

**Tech Stack:** TanStack Router (`createRoute`, `loader`, `notFound`, `pendingComponent`, `Link`), TanStack Query (`queryOptions`, `ensureQueryData`, `useQuery`, `useQueryClient`), React `lazy`/`Suspense`, R3F/three (без изменений).

## Global Constraints

- Hard cap 200 строк/файл. Бренд «Andrey». Alias `@/*`. Ветка `spa`.
- vitest-тесты — `*.spec.ts`; легаси node:test — `*.test.ts`.
- Clean Architecture: `domain/` чист; presentation не импортит DTO; роутинг-примитивы в `src/routes/`.
- `motion` только `motion/react`, только presentation (не трогаем существующие).
- **Ассеты и SSE — абсолютный `import.meta.env.VITE_API_URL`** (в SPA нет BFF-прокси). Оба эндпоинта (`/api/assets/*`, `/api/jobs/*/events`) на gateway неаутентифицированы (Ф0) и под корневым CORS — токен не нужен.

## Предпосылки (обнаружено при планировании)

- `src/app/territories/[slug]/page.tsx` (RSC): `getSceneBundle(slug)` (404→`notFound`), нет артефакта → `<ConversionPending>`, иначе считает `parentLods`+`metadata`+`resolvePlacements` → `<ViewerEntry>`. `searchParams.jobId`, `loading.tsx`→`ViewerSkeleton`, `export const dynamic="force-dynamic"`.
- `getSceneBundle` (`territory-gateway.ts`) уже на `httpGet` — **браузер-safe, не трогаем**.
- **Next-API в поддереве viewer — ровно 4 файла:** `viewer-entry.tsx` (`next/dynamic`), `model-info-panel.tsx` (`next/link`), `conversion-pending.tsx` (`next/link`), `use-conversion-watcher.ts` (`useRouter().refresh()`). Всё остальное 3D-дерево (model-viewer, scene-canvas, gltf-*, placement-*, measurement-*, gizmo) — **чистое, едет как есть**.
- **2 шаред-URL на `NEXT_PUBLIC`/относительный:** `use-job-stream.ts` (`process.env.NEXT_PUBLIC_API_URL ?? ""` для SSE), `asset-url.ts` (относительный `/api/assets/{hash}` — используется вьюером И списками через `pickLodUrl`/`lodUrl`/thumbnails).
- `use-conversion-watcher(jobId)` дергает `router.refresh()` на `succeeded` и в поллинге (4s) без jobId.

## Вне области (этот под-план — только viewer)

- Роуты списков (`/`, `/territories`, `/models`), аплоады, admin, account — следующие под-планы Ф3.
- Реальный 3D-рендер локально требует сконвертированной территории — в чистом локальном каталоге её нет (см. Task 6: локально — механика роута + 404; полный 3D — против прод-данных с временным CORS, по согласию).

---

## Структура файлов (Ф3-viewer)

```
frontend/src/
  shared/infrastructure/asset-url.ts            # → абсолютный VITE_API_URL (+ .spec)
  conversion/application/use-job-stream.ts      # SSE base → VITE_API_URL
  conversion/application/use-conversion-watcher.ts  # router.refresh → invalidate query
  conversion/presentation/conversion-pending.tsx    # next/link → Link, слот slug в watcher
  viewer/presentation/components/viewer-entry.tsx   # next/dynamic → lazy/Suspense
  viewer/presentation/components/model-info-panel.tsx  # next/link → Link
  territory/application/scene-bundle-query.ts   # queryOptions(slug)
  viewer/application/scene-view-model.ts        # bundle → {parentLods, metadata, placements} (+ .spec)
  routes/territory-viewer.tsx                   # TanStack route
  routes/router.tsx                             # + territoryViewerRoute в дерево
```

---

## Task 1: абсолютные URL ассетов + SSE (шаред)

**Files:**
- Modify: `frontend/src/shared/infrastructure/asset-url.ts`
- Create: `frontend/src/shared/infrastructure/asset-url.spec.ts`
- Modify: `frontend/src/conversion/application/use-job-stream.ts`

**Interfaces:**
- Produces: `assetUrl(hash)` → `${VITE_API_URL}/api/assets/{hash}` (абсолютный).

- [ ] **Step 1: Падающий тест — `asset-url.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { assetUrl } from "@/shared/infrastructure/asset-url";

describe("assetUrl", () => {
  it("builds an absolute gateway URL", () => {
    expect(assetUrl("abc123")).toBe("http://localhost:8080/api/assets/abc123");
  });
  it("encodes the hash", () => {
    expect(assetUrl("a/b")).toBe("http://localhost:8080/api/assets/a%2Fb");
  });
});
```
(`VITE_API_URL` в тестах = `http://localhost:8080`, задано в `vite.config.ts`.)

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/shared/infrastructure/asset-url.spec.ts`
Expected: FAIL (текущий возвращает относительный `/api/assets/abc123`).

- [ ] **Step 3: `asset-url.ts` — абсолютный**

```ts
// assetUrl returns the public URL for a converted binary artifact. Absolute
// (VITE_API_URL) because the SPA has no same-origin BFF — the request must hit
// the gateway directly. /api/assets/* is unauthenticated (Ф0) and under the
// gateway's root CORS, so no token and cross-origin GET both work (three.js
// GLTFLoader + <img> thumbnails).
export function assetUrl(hash: string): string {
  return `${import.meta.env.VITE_API_URL}/api/assets/${encodeURIComponent(hash)}`;
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/shared/infrastructure/asset-url.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: `use-job-stream.ts` — SSE base на VITE_API_URL**

Заменить строку 37:
```ts
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
```
на:
```ts
    // Open SSE directly against the gateway (absolute — no same-origin BFF in
    // the SPA). /api/jobs/*/events is unauthenticated (Ф0), so no token; the
    // reverse proxy streams it with proxy_buffering off.
    const base = import.meta.env.VITE_API_URL;
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/infrastructure/asset-url.ts frontend/src/shared/infrastructure/asset-url.spec.ts frontend/src/conversion/application/use-job-stream.ts
git commit -m "feat(spa/phase3-viewer): absolute gateway URLs for assets + SSE"
```

---

## Task 2: sceneBundleQuery

**Files:**
- Create: `frontend/src/territory/application/scene-bundle-query.ts`

**Interfaces:**
- Consumes: `getSceneBundle` (`territory-gateway.ts`).
- Produces: `sceneBundleQuery(slug: string)` → `queryOptions` с `queryKey: ["scene", slug]`, `queryFn: () => getSceneBundle(slug)`.

- [ ] **Step 1: Реализация**

```ts
import { queryOptions } from "@tanstack/react-query";
import { getSceneBundle } from "@/territory/infrastructure/territory-gateway";

// One-shot territory scene (territory + LOD0 artifact + placements + model
// options + panoramas + documents). Key ["scene", slug] is also invalidated by
// the conversion watcher so the viewer re-renders once the artifact lands.
export const sceneBundleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["scene", slug],
    queryFn: () => getSceneBundle(slug),
  });
```

- [ ] **Step 2: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/territory/application/scene-bundle-query.ts
git commit -m "feat(spa/phase3-viewer): sceneBundleQuery(slug) query options"
```

---

## Task 3: конверсионное поддерево — SPA-ready

**Files:**
- Modify: `frontend/src/conversion/application/use-conversion-watcher.ts`
- Modify: `frontend/src/conversion/presentation/conversion-pending.tsx`

**Interfaces:**
- Consumes: `useQueryClient` (react-query).
- Produces: `useConversionWatcher(jobId: string | null, slug: string)` — на `succeeded`/поллинге инвалидирует `["scene", slug]`.

- [ ] **Step 1: `use-conversion-watcher.ts` — убрать next/navigation**

Заменить импорт `useRouter` и все `router.refresh()` на инвалидацию scene-query. Полный файл:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Job, JobStatus } from "@/shared/domain/job";
import { useJobStream } from "@/conversion/application/use-job-stream";

export interface UseConversionWatcher {
  status: JobStatus | "polling" | "unavailable";
  progress: number;
  stage: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 4000;

// Drives the pending-conversion screen.
//   - With a jobId: SSE for live progress; on succeeded, invalidate the scene
//     query so the route re-renders into the viewer.
//   - Without a jobId: poll by invalidating the scene query every 4s until the
//     artifact lands (background reconciler queued the conversion).
// The invalidation target ["scene", slug] mirrors sceneBundleQuery's key.
export function useConversionWatcher(
  jobId: string | null,
  slug: string,
): UseConversionWatcher {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<UseConversionWatcher["status"]>(
    jobId ? "pending" : "polling",
  );
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["scene", slug] }),
    [queryClient, slug],
  );

  const onUpdate = useCallback(
    (job: Job) => {
      setStatus(job.status);
      if (typeof job.progress === "number") setProgress(job.progress);
      if (job.stage) setStage(job.stage);
      if (job.errorMessage) setError(job.errorMessage);
      if (job.status === "succeeded") void refresh();
    },
    [refresh],
  );
  useJobStream(jobId, onUpdate);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (jobId) return;
    intervalRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, refresh]);

  return { status, progress, stage, error };
}
```

- [ ] **Step 2: `conversion-pending.tsx` — next/link → Link, slug в watcher**

Заменить импорт (строка 4) `import Link from "next/link";` на `import { Link } from "@tanstack/react-router";`; вызов watcher `useConversionWatcher(jobId)` → `useConversionWatcher(jobId, slug)`; `<Link href="/">` → `<Link to="/">`. Точечные правки:

```ts
// строка 4:
import { Link } from "@tanstack/react-router";
```
```tsx
// в теле компонента:
  const { status, progress, stage, error } = useConversionWatcher(jobId, slug);
```
```tsx
// кнопка "← Catalog":
      <Link
        to="/"
        className="absolute left-4 top-4 cursor-pointer rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.1]"
      >
        ← Catalog
      </Link>
```

- [ ] **Step 3: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех (эти файлы ещё не в графе роутера — войдут в Task 6; проверяем компиляцию).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/conversion/application/use-conversion-watcher.ts frontend/src/conversion/presentation/conversion-pending.tsx
git commit -m "feat(spa/phase3-viewer): conversion screen off next (query-invalidate + Link)"
```

---

## Task 4: viewer-компоненты — SPA-ready

**Files:**
- Modify: `frontend/src/viewer/presentation/components/viewer-entry.tsx`
- Modify: `frontend/src/viewer/presentation/components/model-info-panel.tsx`

- [ ] **Step 1: `viewer-entry.tsx` — next/dynamic → lazy/Suspense**

Полный файл:
```tsx
import { lazy, Suspense } from "react";
import ViewerSkeleton from "@/viewer/presentation/components/viewer-skeleton";
import type { ModelViewerProps } from "@/viewer/presentation/components/model-viewer";

// model-viewer pulls three/R3F — code-split it so the viewer chunk loads on
// demand. (Vite has no SSR, so next/dynamic's ssr:false is moot here.)
const ModelViewer = lazy(() => import("@/viewer/presentation/components/model-viewer"));

export default function ViewerEntry(props: ModelViewerProps) {
  return (
    <Suspense fallback={<ViewerSkeleton />}>
      <ModelViewer {...props} />
    </Suspense>
  );
}
```
(`model-viewer` должен иметь `export default` — `lazy` требует default export. Если у него named export `ModelViewer`, заменить на `lazy(() => import("...").then(m => ({ default: m.ModelViewer })))`. Проверить в Step 3.)

- [ ] **Step 2: `model-info-panel.tsx` — next/link → Link**

Строка 4: `import Link from "next/link";` → `import { Link } from "@tanstack/react-router";`. Найти `<Link href="/">` (~строка 39) → `<Link to="/">`.

- [ ] **Step 3: Сборка + проверка default-экспорта model-viewer**

Run: `cd frontend && grep -n "export default\|export function ModelViewer\|export const ModelViewer" src/viewer/presentation/components/model-viewer.tsx | head; yarn build:spa`
Expected: если `model-viewer` — default export, сборка успешна. Если named — поправить `lazy(...)` из Step 1 на `.then(m => ({ default: m.ModelViewer }))` и пересобрать.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/viewer/presentation/components/viewer-entry.tsx frontend/src/viewer/presentation/components/model-info-panel.tsx
git commit -m "feat(spa/phase3-viewer): viewer components off next (lazy + Link)"
```

---

## Task 5: scene view-model (TDD)

**Files:**
- Create: `frontend/src/viewer/application/scene-view-model.ts`, `frontend/src/viewer/application/scene-view-model.spec.ts`

**Interfaces:**
- Consumes: `SceneBundle`, `bboxAxis`, `LodArtifact`, `ResolvedPlacement`, `ModelMetadata`.
- Produces: `toSceneViewModel(bundle: SceneBundle): { parentLods: LodArtifact[]; metadata: ModelMetadata; placements: ResolvedPlacement[] } | null` — `null` если `bundle.artifact` отсутствует (ветка ConversionPending). Переносит чистую логику из `page.tsx` (`resolvePlacements`, `parentLods`, `metadata`).

- [ ] **Step 1: Падающий тест — `scene-view-model.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toSceneViewModel } from "@/viewer/application/scene-view-model";
import type { SceneBundle } from "@/territory/domain/scene-bundle";

const base = {
  territory: { slug: "t", title: "T", description: "", externalPanoramaUrl: "", sourceBlobHash: "", createdAt: "", updatedAt: "" },
  placements: [], modelOptions: [], panoramas: [], documents: [],
} as unknown as SceneBundle;

describe("toSceneViewModel", () => {
  it("returns null when no artifact", () => {
    expect(toSceneViewModel({ ...base, artifact: null })).toBeNull();
  });

  it("derives metadata + parentLods from the artifact", () => {
    const vm = toSceneViewModel({
      ...base,
      artifact: { slug: "t", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 1, vertices: 10, faces: 5, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 2, y: 1, z: 4 }, createdAt: "", lods: undefined },
    } as unknown as SceneBundle);
    expect(vm).not.toBeNull();
    expect(vm!.metadata.vertices).toBe(10);
    expect(vm!.metadata.dimensions).toEqual({ x: 2, y: 1, z: 4 });
    expect(vm!.parentLods).toHaveLength(1);
    expect(vm!.parentLods[0].hash).toBe("h");
  });

  it("resolves placement LODs from model options by slug", () => {
    const vm = toSceneViewModel({
      ...base,
      artifact: { slug: "t", lod: 0, hash: "h", contentType: "x", size: 1, vertices: 1, faces: 1, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 1, z: 1 }, createdAt: "", lods: undefined },
      placements: [{ id: "p1", territorySlug: "t", modelSlug: "m", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, label: "", updatedAt: "", visiblePanoramaIds: [] }],
      modelOptions: [{ slug: "m", title: "M", lods: [{ lod: 0, hash: "mh", size: 1, vertices: 1, faces: 1 }] }],
    } as unknown as SceneBundle);
    expect(vm!.placements[0].lods[0].hash).toBe("mh");
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/viewer/application/scene-view-model.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Реализация — `scene-view-model.ts`**

```ts
import type { SceneBundle } from "@/territory/domain/scene-bundle";
import { bboxAxis } from "@/shared/domain/artifact";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import type { Placement, ResolvedPlacement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";

function resolvePlacements(
  placements: Placement[],
  options: PlacementAssetOption[],
): ResolvedPlacement[] {
  const lodsBySlug = new Map(options.map((o) => [o.slug, o.lods]));
  return placements.map((p) => ({ ...p, lods: lodsBySlug.get(p.modelSlug) ?? [] }));
}

export interface SceneViewModel {
  parentLods: LodArtifact[];
  metadata: ModelMetadata;
  placements: ResolvedPlacement[];
}

// Pure bundle → view-model. Returns null when the LOD0 artifact is absent so
// the route falls back to the conversion-pending screen. Mirrors the old RSC
// page.tsx body.
export function toSceneViewModel(bundle: SceneBundle): SceneViewModel | null {
  const { territory, artifact, placements, modelOptions } = bundle;
  if (!artifact) return null;

  const parentLods: LodArtifact[] = artifact.lods ?? [
    { lod: artifact.lod, hash: artifact.hash, size: artifact.size, vertices: artifact.vertices, faces: artifact.faces },
  ];

  const metadata: ModelMetadata = {
    name: territory.title,
    vertices: artifact.vertices ?? 0,
    faces: artifact.faces ?? 0,
    dimensions: {
      x: bboxAxis(artifact.bboxMin?.x, artifact.bboxMax?.x),
      y: bboxAxis(artifact.bboxMin?.y, artifact.bboxMax?.y),
      z: bboxAxis(artifact.bboxMin?.z, artifact.bboxMax?.z),
    },
  };

  return { parentLods, metadata, placements: resolvePlacements(placements, modelOptions) };
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/viewer/application/scene-view-model.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/viewer/application/scene-view-model.ts frontend/src/viewer/application/scene-view-model.spec.ts
git commit -m "feat(spa/phase3-viewer): scene view-model (pure bundle mapping)"
```

---

## Task 6: viewer-роут + подключение

**Files:**
- Create: `frontend/src/routes/territory-viewer.tsx`
- Modify: `frontend/src/routes/router.tsx`

**Interfaces:**
- Consumes: `authedLayoutRoute`, `sceneBundleQuery`, `toSceneViewModel`, `ViewerEntry`, `ConversionPending`, `ViewerSkeleton`, `HttpError`, `notFound`/`redirect`.

- [ ] **Step 1: `territory-viewer.tsx`**

```tsx
import { createRoute, notFound } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { toSceneViewModel } from "@/viewer/application/scene-view-model";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import ViewerEntry from "@/viewer/presentation/components/viewer-entry";
import ViewerSkeleton from "@/viewer/presentation/components/viewer-skeleton";
import ConversionPending from "@/conversion/presentation/conversion-pending";

function TerritoryViewer() {
  const { slug } = territoryViewerRoute.useParams();
  const { jobId } = territoryViewerRoute.useSearch();
  const { data: bundle } = territoryViewerRoute.useLoaderData
    ? { data: undefined } // placeholder; see useQuery below
    : { data: undefined };
  // Read from the cache the loader primed.
  const scene = bundle ? toSceneViewModel(bundle) : undefined;
  void scene;
  return null; // replaced below
}

export const territoryViewerRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug",
  validateSearch: (s: Record<string, unknown>): { jobId?: string } => ({
    jobId: typeof s.jobId === "string" ? s.jobId : undefined,
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  pendingComponent: ViewerSkeleton,
  component: TerritoryViewer,
});
```

Затем заменить тело `TerritoryViewer` на рабочее (используем `useQuery`, а не заглушку):

```tsx
import { useQuery } from "@tanstack/react-query";
// ...
function TerritoryViewer() {
  const { slug } = territoryViewerRoute.useParams();
  const { jobId } = territoryViewerRoute.useSearch();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return <ViewerSkeleton />; // loader primed it; guard for type-narrowing

  const scene = toSceneViewModel(bundle);
  if (!scene) {
    return <ConversionPending title={bundle.territory.title} slug={slug} jobId={jobId ?? null} />;
  }
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ViewerEntry
        parentLods={scene.parentLods}
        title={bundle.territory.title}
        metadata={scene.metadata}
        territorySlug={slug}
        initialPlacements={scene.placements}
        modelOptions={bundle.modelOptions}
        panoramas={bundle.panoramas}
        documents={bundle.documents}
        externalPanoramaUrl={bundle.territory.externalPanoramaUrl}
      />
    </main>
  );
}
```

> **Реализатору:** напиши файл сразу с рабочим телом (второй вариант) — первая «заглушечная» версия дана лишь чтобы показать структуру роута; в итоговом файле её быть не должно. Проверь имена пропсов `ViewerEntry`/`ModelViewerProps` — они должны совпадать со Step (сверься с `model-viewer.tsx`).

- [ ] **Step 2: Подключить в `router.tsx`**

Добавить импорт и в дерево под `authedLayoutRoute`:
```tsx
import { territoryViewerRoute } from "@/routes/territory-viewer";
// ...
const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([homeRoute, territoryViewerRoute]),
]);
```

- [ ] **Step 3: Сборка + проверка отсутствия «мёртвого» next/* в графе viewer**

Run:
```bash
cd frontend && yarn build:spa && grep -oE "next/(dynamic|link|navigation|headers|server|font)" dist/assets/*.js | sort -u || echo "no next/* (clean)"
```
Expected: сборка успешна; grep пуст (все Next-импорты в поддереве viewer сведены).

- [ ] **Step 4: Полный vitest**

Run: `cd frontend && yarn test:spa`
Expected: PASS — 19 тестов (14 прежних + asset-url 2 + scene-view-model 3).

- [ ] **Step 5: E2E — механика роута (локально, без данных)**

Локальный стек (`docker compose up -d gateway`, `admin`/`change-me-now`), `yarn dev:spa`, CDP:
1. Логин (как в Ф2) → токен.
2. Перейти на `/territories/does-not-exist` → loader ловит 404 → рендерится notFound-экран (не белый; проверить, что есть `notFoundComponent` — если нет глобального, добавить на root; иначе TanStack покажет дефолт). `JS_ERRORS: none`.
3. Проверить, что без токена `/territories/x` редиректит на `/login` (гард наследуется).

Assert: `location.pathname` после (2) остаётся `/territories/does-not-exist` с отрендеренным not-found/дефолт-экраном; (3) → `/login`. Ошибок в консоли нет.

- [ ] **Step 6: E2E — реальный 3D (против прод-данных, по согласию — трогает прод CORS)**

Полный 3D-рендер требует сконвертированной территории; локальный каталог пуст. Против прода (в нём есть данные):
1. С согласия — временно добавить `http://localhost:5173` в прод `GATEWAY_ALLOWED_ORIGINS`, `VITE_API_URL=https://api.andrey.vbncursed.fun`.
2. Войти реальными кредами, открыть существующий slug территории.
3. Assert (CDP): в DOM появляется `<canvas>` (R3F смонтировал сцену), нет console-ошибок про CORS/загрузку GLB; при отсутствии артефакта — экран ConversionPending.
4. Убрать `localhost:5173` из прод CORS.

Если прод сейчас не трогаем — этот шаг откладывается; механика (Step 5) + юнит-тесты + чистая сборка остаются доказательством.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/territory-viewer.tsx frontend/src/routes/router.tsx
git commit -m "feat(spa/phase3-viewer): territory viewer route (loader + scene branch)"
```

---

## Self-Review

- **Покрытие:** абсолютные URL ассетов/SSE (Task 1), sceneBundleQuery (Task 2), конверсионный экран без next (Task 3), viewer-компоненты без next (Task 4), чистый view-model (Task 5), сам роут с loader/404/pending/ветвлением (Task 6). ✓
- **Плейсхолдеры:** заглушечное тело `TerritoryViewer` в Task 6 явно помечено к замене на рабочее — реализатор пишет второй вариант. Иных TBD нет. ✓
- **Тип-консистентность:** `sceneBundleQuery` key `["scene", slug]` == инвалидация в watcher; `toSceneViewModel` возвращает `{parentLods, metadata, placements}` и так же читается в роуте; `useConversionWatcher(jobId, slug)` == новый вызов в conversion-pending. ✓
- **next/* leakage:** Task 6 Step 3 явно проверяет отсутствие Next-импортов в собранном viewer-графе. ✓
- **Данные для 3D:** честно разведено — локально механика+404, полный 3D против прод-данных под согласие. ✓

## Отложено (следующие под-планы Ф3)

- Каталог-роуты (`/`, `/territories`, `/models`) + порт `home` с реального `app/page.tsx` (там `next/link` в delete/replace-кнопках).
- Аплоад-роуты (`/territories/new`, `/models/new`, replace, documents/new, panoramas/new) — там `next/navigation` в формах.
- admin/account.
- `ViewerEntry`/`ModelViewerProps`: сверить точные имена пропсов при реализации Task 6.
