# Ф3-upload (replace/documents/panoramas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть оставшиеся upload-формы — замена источника территории и загрузка документов/панорам. Три формы увести с `next/*`, добавить три роута под `$slug` с permission-guard, переключить кнопку «Replace» в каталоге с `<a>` на TanStack `<Link>`.

**Architecture:** Формы переиспользуют уже починенную upload-машинерию (`useChunkedUpload` → absolute+Bearer gateway из предыдущего под-плана). Роуты `/territories/$slug/{replace,documents/new,panoramas/new}` под `authedLayoutRoute`: `beforeLoad` = `requirePermission(...)`, `loader` = `ensureQueryData(sceneBundleQuery(slug))` (404 → `notFound`; тот же bundle даёт title и — для панорамы — bbox). Навигация форм: back-link → TanStack `<Link to="/territories/$slug">`; cancel / after-create → `window.location.assign` (replace тянет `?jobId` → viewer+SSE; documents/panoramas → обратно в viewer со свежей сценой).

**Tech Stack:** TanStack Router (`createRoute`, `beforeLoad`, `Link`, `notFound`), TanStack Query (`sceneBundleQuery`, `ensureQueryData`, `useQuery`), existing forms/gateways.

## Global Constraints

- Hard cap 200 строк/файл. Бренд «Andrey». Alias `@/*`. Ветка `spa`.
- Гейты: `yarn build:spa` + `yarn test:spa` + `yarn lint` (TS 6.0.3 / ESLint 9 / Vite 8 — все живы).
- Clean Architecture: роутинг-примитивы в `src/routes/`; формы остаются в своих контекстах.
- next-freeness: grep бандла И dev-оптимизатор Vite.

## Предпосылки (обнаружено при планировании)

- Формы (все `"use client"`, `next/link` + `next/navigation`, `useChunkedUpload`, back-link + cancel + after-create через `router.push`):
  - `src/territory/presentation/components/replace-source-form.tsx` — `replaceTerritorySource(slug,{sourceBlobHash})` → `router.push(\`${href}?jobId=…\`)`.
  - `src/document/presentation/components/document-upload-form.tsx` — `createDocument(slug,{title,sourceBlobHash})` → `router.push(href)`.
  - `src/panorama/presentation/components/panorama-upload-form.tsx` — `createPanorama(slug,{title,sourceBlobHash,position,yawOffset})` → `router.push(href)`; принимает `sourceBbox`.
- Пейджи (RSC): `requirePermission("territory:write"|"document:write"|"panorama:write")` + fetch (replace → `getTerritory`; docs/pano → `getSceneBundle`; pano выводит `sourceBbox = art.bboxMin&&art.bboxMax ? {min,max} : null`). Все `notFound` при 404.
- Гейтвеи `replaceTerritorySource`/`createDocument`/`createPanorama` — на `httpPost`, браузер-safe.
- `sceneBundleQuery(slug)` (Ф3-viewer), `requirePermission` (Ф3-upload/create), `HttpError`, `notFound` — есть. `SourceBbox` = `{min: Vec3, max: Vec3}` (panorama/domain/geo-anchor).
- Каталог: `src/territory/presentation/replace-source-button.tsx` — сейчас `<a href="/territories/{slug}/replace">` (заглушка, роут появится здесь).

## Вне области

- model-detail `/models/$slug`, admin, account — отдельные под-планы.

## Структура файлов

```
frontend/src/
  territory/presentation/components/replace-source-form.tsx    # off next
  document/presentation/components/document-upload-form.tsx     # off next
  panorama/presentation/components/panorama-upload-form.tsx     # off next
  territory/presentation/replace-source-button.tsx             # <a> → <Link>
  routes/territory-replace.tsx        # /territories/$slug/replace
  routes/document-new.tsx             # /territories/$slug/documents/new
  routes/panorama-new.tsx             # /territories/$slug/panoramas/new
  routes/router.tsx                   # + три роута
```

---

## Task 1: три формы off next

**Files:**
- Modify: `frontend/src/territory/presentation/components/replace-source-form.tsx`
- Modify: `frontend/src/document/presentation/components/document-upload-form.tsx`
- Modify: `frontend/src/panorama/presentation/components/panorama-upload-form.tsx`

Каждая форма — одинаковый набор правок:

- [ ] **Step 1: replace-source-form.tsx**

- `import Link from "next/link";` → `import { Link } from "@tanstack/react-router";`
- Удалить `import { useRouter } from "next/navigation";` и `const router = useRouter();`.
- `<Link href={territoryHref} …>` → `<Link to="/territories/$slug" params={{ slug }} …>`.
- `onCancel`: `router.push(territoryHref)` → `window.location.assign(territoryHref)`; убрать `router` из deps (оставить `cancel, submitting, territoryHref`).
- `onSubmit`: `router.push(\`${territoryHref}?jobId=…\`)` → `window.location.assign(\`${territoryHref}?jobId=…\`)`; убрать `router` из deps.

- [ ] **Step 2: document-upload-form.tsx**

- `import Link from "next/link";` → `import { Link } from "@tanstack/react-router";`
- Удалить `useRouter` import + `const router = useRouter();`.
- `<Link href={territoryHref} …>` → `<Link to="/territories/$slug" params={{ slug: territorySlug }} …>`.
- `onCancel`: `router.push(territoryHref)` → `window.location.assign(territoryHref)`; убрать `router` из deps.
- `onSubmit`: `router.push(territoryHref)` → `window.location.assign(territoryHref)`; убрать `router` из deps.

- [ ] **Step 3: panorama-upload-form.tsx**

- `import Link from "next/link";` → `import { Link } from "@tanstack/react-router";`
- Удалить `useRouter` import + `const router = useRouter();`.
- `<Link href={territoryHref} …>` → `<Link to="/territories/$slug" params={{ slug: territorySlug }} …>`.
- `onCancel`: `router.push(territoryHref)` → `window.location.assign(territoryHref)`; убрать `router` из deps.
- `onSubmit`: `router.push(territoryHref)` → `window.location.assign(territoryHref)`; убрать `router` из deps.

- [ ] **Step 4: Сборка + lint**

Run: `cd frontend && yarn build:spa && yarn lint`
Expected: успех, lint чист.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/territory/presentation/components/replace-source-form.tsx frontend/src/document/presentation/components/document-upload-form.tsx frontend/src/panorama/presentation/components/panorama-upload-form.tsx
git commit -m "feat(spa/phase3-upload): replace/document/panorama forms off next"
```

---

## Task 2: три роута + кнопка Replace на Link + wire

**Files:**
- Create: `frontend/src/routes/territory-replace.tsx`, `frontend/src/routes/document-new.tsx`, `frontend/src/routes/panorama-new.tsx`
- Modify: `frontend/src/territory/presentation/replace-source-button.tsx`
- Modify: `frontend/src/routes/router.tsx`

- [ ] **Step 1: `territory-replace.tsx`**

```tsx
import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import ReplaceSourceForm from "@/territory/presentation/components/replace-source-form";

function ReplaceTerritory() {
  const { slug } = territoryReplaceRoute.useParams();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <ReplaceSourceForm slug={slug} title={bundle.territory.title} />
    </main>
  );
}

export const territoryReplaceRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug/replace",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location.pathname, "territory:write"),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  component: ReplaceTerritory,
});
```

- [ ] **Step 2: `document-new.tsx`** (тот же каркас; perm `document:write`)

```tsx
import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import DocumentUploadForm from "@/document/presentation/components/document-upload-form";

function NewDocument() {
  const { slug } = documentNewRoute.useParams();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <DocumentUploadForm territorySlug={slug} territoryTitle={bundle.territory.title} />
    </main>
  );
}

export const documentNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug/documents/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location.pathname, "document:write"),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  component: NewDocument,
});
```

- [ ] **Step 3: `panorama-new.tsx`** (perm `panorama:write`; выводит `sourceBbox` из артефакта)

```tsx
import { createRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import { sceneBundleQuery } from "@/territory/application/scene-bundle-query";
import { HttpError } from "@/shared/infrastructure/http/http-error";
import PanoramaUploadForm from "@/panorama/presentation/components/panorama-upload-form";

function NewPanorama() {
  const { slug } = panoramaNewRoute.useParams();
  const { data: bundle } = useQuery(sceneBundleQuery(slug));
  if (!bundle) return null;
  const art = bundle.artifact;
  const sourceBbox = art?.bboxMin && art?.bboxMax ? { min: art.bboxMin, max: art.bboxMax } : null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <PanoramaUploadForm territorySlug={slug} territoryTitle={bundle.territory.title} sourceBbox={sourceBbox} />
    </main>
  );
}

export const panoramaNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/$slug/panoramas/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location.pathname, "panorama:write"),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sceneBundleQuery(params.slug));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw notFound();
      throw e;
    }
  },
  component: NewPanorama,
});
```

- [ ] **Step 4: `replace-source-button.tsx` — `<a>` → `<Link>`**

```tsx
import { Link } from "@tanstack/react-router";

// Links to the territory's replace-source flow (route now exists).
export default function ReplaceSourceButton({ slug }: { slug: string }) {
  return (
    <Link
      to="/territories/$slug/replace"
      params={{ slug }}
      aria-label="Replace source"
      title="Replace 3D source"
      className="cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-neutral-200 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white"
    >
      Replace
    </Link>
  );
}
```

- [ ] **Step 5: Подключить в `router.tsx`**

Импортировать `territoryReplaceRoute`, `documentNewRoute`, `panoramaNewRoute` и добавить в `authedLayoutRoute.addChildren([...])`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/territory-replace.tsx frontend/src/routes/document-new.tsx frontend/src/routes/panorama-new.tsx frontend/src/territory/presentation/replace-source-button.tsx frontend/src/routes/router.tsx
git commit -m "feat(spa/phase3-upload): replace/documents/panoramas routes + Replace Link"
```

---

## Task 3: проверки

- [ ] **Step 1: build + lint + бандл-grep + тесты**

Run:
```bash
cd frontend && yarn build:spa && yarn lint && yarn test:spa && grep -oiE "next/(dynamic|link|navigation|headers|server|font)" dist/assets/*.js | sort -u || echo "no next/* (clean)"
```
Expected: build ок; lint чист; тесты — 25 (без новых юнитов; формы/роуты — разметка + reused guard/query); grep пуст.

- [ ] **Step 2: E2E — механика (локальный стек)**

Стек: `docker compose start` (образы уже собраны; `up` может упасть на пуле redis/postgres — использовать `start`). Взять slug локальной территории:
```bash
docker exec andrey-postgres-1 psql -U andrey -d andrey -tAc "SELECT slug FROM territories LIMIT 1;"
```
`yarn dev:spa`, CDP: логин (`admin`/`change-me-now`, у него owner-права), затем для `<slug>`:
1. `/territories/<slug>/replace` → форма «Swap the 3D source of …».
2. `/territories/<slug>/documents/new` → «Attach a PDF to …».
3. `/territories/<slug>/panoramas/new` → «Anchor a 360° capture to …».
4. Без токена любой из них → `/login`.
5. Кнопка «Replace» на `/` (если у территории есть write-права) ведёт на replace-роут SPA-переходом.

Assert: заголовки форм присутствуют, `location.pathname` верный, 0 JS-ошибок.

- [ ] **Step 3: Dev-оптимизатор — нет достижимых next**

`yarn dev:spa`, открыть три роута в CDP, прочитать dev-лог: `next/*` в оптимизированных deps НЕ должно быть.

- [ ] **Step 4: E2E — реальная загрузка (пользователь)**

Через dev-proxy на прод (или локально с файлами): заменить источник территории (→ viewer ConversionPending + SSE), приложить PDF (→ overlay в viewer), залить панораму (→ появляется в сцене). Визуально пользователь.

- [ ] **Step 5: Commit** — проверки код не меняют (всё в Task 1/2).

---

## Self-Review

- **Покрытие:** три формы off next (Task 1), три роута + Replace-Link + wire (Task 2), проверки (Task 3). ✓
- **Плейсхолдеры:** нет TBD; правки формул точечные. ✓
- **Тип-консистентность:** `requirePermission`/`sceneBundleQuery`/`notFound`/`HttpError` — как в предыдущих под-планах; `sourceBbox={min,max}` совпадает с `SourceBbox` и с прежним RSC-выводом. ✓
- **Маршрутизация:** `/territories/$slug/replace`, `…/documents/new`, `…/panoramas/new` — более специфичны, чем `/territories/$slug` (viewer), TanStack матчит их корректно. Проверить в Task 3 (Step 2). ✓
- **next-freeness:** grep + dev-оптимизатор (Task 3). ✓

## Отложено

- Инвалидация `["scene", slug]` после добавления документа/панорамы не нужна: after-create — hard-nav в viewer, кэш переполучается.
- model-detail `/models/$slug`, admin, account.
