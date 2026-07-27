# Ф3-model-detail: `/models/$slug` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести страницу модели `/models/$slug` (деталь + редактор превью, либо экран конверсии, если нет LOD0). Закрыть последнюю `<a>`-заглушку каталога (карточка модели → SPA-`<Link>`).

**Architecture:** `getModel` + `listModelArtifacts` (браузерные гейтвеи) → `modelQuery(slug)` + `modelArtifactsQuery(slug)`. Роут под `authedLayoutRoute` (только auth-guard, без спец-права — как в исходном RSC). Компонент: нет LOD0 → `ConversionPending`, иначе деталь. `ModelThumbnailEditor` уходит с `next/navigation` (`router.refresh()` → инвалидация `["model", slug]`). `next/link` → TanStack `<Link>`.

**Tech Stack:** TanStack Router (`createRoute`, `Link`, `notFound`, search `jobId`), TanStack Query (`queryOptions`, `ensureQueryData`, `useQuery`, `useQueryClient`), existing gateways/ConversionPending/DeleteModelButton.

## Global Constraints

- Hard cap 200 строк/файл. Бренд «Andrey». Alias `@/*`. Ветка `spa`.
- Гейты: `yarn build:spa` + `yarn test:spa` + `yarn lint` (TS 6.0.3 / ESLint 9 / Vite 8).
- next-freeness: grep бандла И dev-оптимизатор.

## Предпосылки (обнаружено при планировании)

- `src/app/models/[slug]/page.tsx` (RSC): `getModel(slug)` (404→notFound) + `listModelArtifacts(slug)` (`.catch(()=>[])`). Нет `lod===0` → `<ConversionPending title slug jobId>`. Иначе деталь: `next/link` (← Catalog + inline), `DeleteModelButton redirectTo="/"`, `ModelThumbnailEditor`, LOD-счётчик. Права — `getCurrentUser` → `can(me,"model:delete"|"model:write")`. **Спец-права на просмотр нет** (только display-тогглы).
- `src/app/_components/model-thumbnail-editor.tsx`: `"use client"`, `useRouter().refresh()` (×2, после смены/загрузки превью), `runChunkedUpload`, `updateModelThumbnail`, `assetUrl`, `<img>` (с inline `// eslint-disable-next-line @next/next/no-img-element`).
- Гейтвеи `getModel`/`listModelArtifacts`/`updateModelThumbnail` — `httpGet`/`httpPost`, браузер-safe.
- `DeleteModelButton` (`model/presentation`, Ф3-catalog) — есть, `window.location.assign(redirectTo)`. `ConversionPending` (Ф3-viewer) — есть. `useCurrentUser`/`can`, `sceneBundleQuery`-паттерн — есть.
- Каталог: карточки модели в `routes/home.tsx` и `routes/models.tsx` — `<a href={\`/models/${m.slug}\`}>` (заглушки; роут появится здесь).
- `/models/new` (статический) приоритетнее `/models/$slug` — не конфликтуют.

## Вне области

- admin (`/admin/*`), account (`/account`) — следующие под-планы.

## Структура файлов

```
frontend/src/
  model/application/model-detail-queries.ts     # modelQuery + modelArtifactsQuery
  model/presentation/model-thumbnail-editor.tsx # порт (off next → query invalidate)
  routes/model-detail.tsx                        # /models/$slug
  routes/home.tsx, routes/models.tsx             # model card <a> → <Link>
  routes/router.tsx                              # + modelDetailRoute
```

---

## Task 1: queries модели

**Files:**
- Create: `frontend/src/model/application/model-detail-queries.ts`

**Interfaces:**
- Produces: `modelQuery(slug)` (key `["model", slug]`, fn `getModel`); `modelArtifactsQuery(slug)` (key `["model-artifacts", slug]`, fn ловит ошибку → `[]`).

- [ ] **Step 1: Реализация**

```ts
import { queryOptions } from "@tanstack/react-query";
import { getModel, listModelArtifacts } from "@/model/infrastructure/model-gateway";

export const modelQuery = (slug: string) =>
  queryOptions({ queryKey: ["model", slug], queryFn: () => getModel(slug) });

// Artifacts may 404/500 while conversion runs — mirror the old page's
// `.catch(() => [])` so the detail component always gets an array.
export const modelArtifactsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["model-artifacts", slug],
    queryFn: () => listModelArtifacts(slug).catch(() => []),
  });
```

- [ ] **Step 2: Сборка**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/model/application/model-detail-queries.ts
git commit -m "feat(spa/phase3-model): model + model-artifacts query options"
```

---

## Task 2: ModelThumbnailEditor — порт off next

**Files:**
- Create: `frontend/src/model/presentation/model-thumbnail-editor.tsx`

**Interfaces:**
- Consumes: `useQueryClient`, `runChunkedUpload`, `updateModelThumbnail`, `assetUrl`.
- Produces: `ModelThumbnailEditor({slug, thumbnailBlobHash?, canWrite})` — после смены превью инвалидирует `["model", slug]`.

- [ ] **Step 1: Порт из `app/_components/model-thumbnail-editor.tsx`**

Скопировать файл в `model/presentation/model-thumbnail-editor.tsx` с заменами:
- `import { useRouter } from "next/navigation";` → `import { useQueryClient } from "@tanstack/react-query";`
- `const router = useRouter();` → `const queryClient = useQueryClient();`
- оба `router.refresh();` → `queryClient.invalidateQueries({ queryKey: ["model", slug] });`
- `<img>` и его inline `// eslint-disable-next-line @next/next/no-img-element` — **оставить как есть**.

(Остальное — разметка, `runChunkedUpload`, `updateModelThumbnail`, `assetUrl` — без изменений.)

- [ ] **Step 2: Сборка + lint**

Run: `cd frontend && yarn build:spa && yarn lint`
Expected: успех, lint чист.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/model/presentation/model-thumbnail-editor.tsx
git commit -m "feat(spa/phase3-model): port ModelThumbnailEditor off next (query invalidate)"
```

---

## Task 3: роут `/models/$slug` + карточки каталога на Link + wire

**Files:**
- Create: `frontend/src/routes/model-detail.tsx`
- Modify: `frontend/src/routes/home.tsx`, `frontend/src/routes/models.tsx` (model card `<a>` → `<Link>`)
- Modify: `frontend/src/routes/router.tsx`

- [ ] **Step 1: `model-detail.tsx`**

```tsx
import { createRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { modelQuery, modelArtifactsQuery } from "@/model/application/model-detail-queries";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import ConversionPending from "@/conversion/presentation/conversion-pending";
import DeleteModelButton from "@/model/presentation/delete-model-button";
import ModelThumbnailEditor from "@/model/presentation/model-thumbnail-editor";

function ModelDetail() {
  const { slug } = modelDetailRoute.useParams();
  const { jobId } = modelDetailRoute.useSearch();
  const me = useCurrentUser();
  const { data: model } = useQuery(modelQuery(slug));
  const { data: artifacts = [] } = useQuery(modelArtifactsQuery(slug));
  if (!model) return null;

  const lod0 = artifacts.find((a) => a.lod === 0);
  if (!lod0) {
    return <ConversionPending title={model.title} slug={slug} jobId={jobId ?? null} />;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 text-white sm:px-10">
      <Link to="/" className="mx-auto mb-6 block w-full max-w-2xl text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors duration-200 hover:text-white">
        ← Catalog
      </Link>
      <article className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.36em] text-amber-200/80">Model</p>
          {can(me, "model:delete") ? <DeleteModelButton slug={slug} label={model.title} redirectTo="/" /> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{model.title}</h1>
        {model.description ? <p className="text-sm leading-6 text-neutral-300">{model.description}</p> : null}
        <ModelThumbnailEditor slug={slug} thumbnailBlobHash={model.thumbnailBlobHash} canWrite={can(me, "model:write")} />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Slug</dt>
            <dd className="mt-1 font-mono text-neutral-200">{model.slug}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">LODs</dt>
            <dd className="mt-1 font-mono text-neutral-200">{artifacts.length}</dd>
          </div>
        </dl>
        <p className="text-sm leading-6 text-neutral-300">
          The model is ready — drop it onto any territory via the placement panel. Open the{" "}
          <Link to="/" className="text-cyan-300 underline">catalog</Link>{" "}and pick a territory.
        </p>
      </article>
    </main>
  );
}

export const modelDetailRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/models/$slug",
  validateSearch: (s: Record<string, unknown>): { jobId?: string } => ({
    jobId: typeof s.jobId === "string" ? s.jobId : undefined,
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(modelQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
    await context.queryClient.ensureQueryData(modelArtifactsQuery(params.slug));
  },
  component: ModelDetail,
});
```

- [ ] **Step 2: Карточки модели `<a>` → `<Link>` в `home.tsx` и `models.tsx`**

В обоих: `<a href={\`/models/${m.slug}\`} className="…">` → `<Link to="/models/$slug" params={{ slug: m.slug }} className="…">` (и закрывающий `</a>` → `</Link>`). Комментарий `{/* model detail route not migrated yet → plain <a> */}` в `home.tsx` удалить.

- [ ] **Step 3: Подключить в `router.tsx`**

Импортировать `modelDetailRoute`, добавить в `authedLayoutRoute.addChildren([...])`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/model-detail.tsx frontend/src/routes/home.tsx frontend/src/routes/models.tsx frontend/src/routes/router.tsx
git commit -m "feat(spa/phase3-model): /models/$slug route + catalog model cards as Link"
```

---

## Task 4: проверки

- [ ] **Step 1: build + lint + бандл-grep + тесты**

Run:
```bash
cd frontend && yarn build:spa && yarn lint && yarn test:spa && grep -oiE "next/(dynamic|link|navigation|headers|server|font)" dist/assets/*.js | sort -u || echo "no next/* (clean)"
```
Expected: build ок; lint чист; тесты — 25; grep пуст.

- [ ] **Step 2: E2E — механика (локальный стек)**

Стек `docker compose start`; slug модели с LOD0:
```bash
docker exec andrey-postgres-1 psql -U andrey -d andrey -tAc "SELECT m.slug FROM models m JOIN model_artifacts a ON a.model_id=m.id AND a.lod=0 LIMIT 1;"
```
`yarn dev:spa`, CDP: логин, затем:
1. `/models/<slug>` → деталь модели (заголовок «Model», секция «Thumbnail», «LODs»); НЕ форма/viewer.
2. Клик «← Catalog» → SPA-переход на `/`.
3. С `/` кликнуть карточку модели → SPA-переход на `/models/<slug>` (без полной перезагрузки).
4. Без токена `/models/<slug>` → `/login`.

Assert: тексты присутствуют, пути верные, 0 JS-ошибок.

- [ ] **Step 3: Dev-оптимизатор — нет next/***

`yarn dev:spa`, открыть `/models/<slug>` в CDP, прочитать dev-лог: `next/*` быть не должно.

- [ ] **Step 4: Commit** — проверки код не меняют.

---

## Self-Review

- **Покрытие:** queries (Task 1), ModelThumbnailEditor off next (Task 2), роут + карточки на Link + wire (Task 3), проверки (Task 4). ✓
- **Плейсхолдеры:** нет TBD; код приведён. ✓
- **Тип-консистентность:** `modelQuery`/`modelArtifactsQuery` ключи `["model",slug]`/`["model-artifacts",slug]` — инвалидация в ThumbnailEditor совпадает с `["model",slug]`; `ConversionPending`/`DeleteModelButton` сигнатуры прежние. ✓
- **Ветвление:** нет LOD0 → ConversionPending (совпадает с RSC); `artifactsQuery` всегда массив (catch→[]). ✓
- **next-freeness:** grep + dev-оптимизатор (Task 4). Это закрывает последний next-компонент вне admin/account. ✓

## Отложено

- Инвалидация каталожных `["models"]` после удаления с детали не нужна: `DeleteModelButton redirectTo="/"` → hard-nav, кэш переполучается.
- admin, account.
