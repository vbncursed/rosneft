# Ф3-catalog: перенос роутов каталога (`/`, `/territories`, `/models`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести три RSC-роута каталога на TanStack: главную (грид территорий+моделей, заменяет Ф2-плейсхолдер), список территорий и список моделей. Данные — через `territoriesQuery`/`modelsQuery`; права — из `useCurrentUser`; карточки/кнопки переиспользуют существующую разметку.

**Architecture:** `listTerritories`/`listModels` (уже браузерные гейтвеи) оборачиваем в queryOptions. Роут-`loader` прогревает кэш (`ensureQueryData`), компонент читает `useQuery` + `useCurrentUser()` (контекст даёт AppLayout из Ф2). Общий `CatalogCard` (тело карточки) в shared; каждый роут держит свою разметку списка/шапки. Delete/replace-кнопки переезжают из `app/_components/` в доменные контексты. `next/link` → TanStack `Link` там, где роут уже есть (viewer, сами каталог-роуты); `<a href>` — для ещё не перенесённых целей (model-detail, upload/replace).

**Tech Stack:** TanStack Router (`createRoute`, `loader`, `Link`), TanStack Query (`queryOptions`, `ensureQueryData`, `useQuery`), motion (`MotionList`/`MotionItem`, существующие), existing `DeleteButton` (уже без next).

## Global Constraints

- Hard cap 200 строк/файл. Бренд «Andrey». Alias `@/*`. Ветка `spa`.
- vitest-тесты — `*.spec.ts`; легаси node:test — `*.test.ts`.
- Clean Architecture: `domain/` чист; presentation не импортит DTO; роутинг-примитивы в `src/routes/`. Delete-кнопки — в доменных контекстах (`territory/presentation`, `model/presentation`), не в общем каталоге.
- `motion` только `motion/react`, только presentation.
- **Проверка next-freeness — не только grep бандла, но и dev-оптимизатор Vite** (он ловит достижимые next-импорты, которые tree-shaking прячет; см. урок delete-button в Ф3-viewer).

## Предпосылки (обнаружено при планировании)

- Роуты: `src/app/page.tsx` (home: `listTerritories`+`listModels`+`getCurrentUser`, две секции с `Section`-компонентом inline, карточки с Link + delete/replace), `src/app/territories/page.tsx`, `src/app/models/page.tsx`. Все — RSC, `export const dynamic="force-dynamic"`, `next/link`.
- Гейтвеи `listTerritories` (`territory-gateway.ts`), `listModels` (`model-gateway.ts`) — на `httpGet`, браузер-safe, не трогаем.
- `getCurrentUser` (server-only) → в SPA берём `useCurrentUser()` из `@/auth/presentation/current-user-context` (AppLayout уже кормит его из `meQuery`). Права — `can(me, "territory:write")` и т.п.
- `src/app/_components/delete-territory-button.tsx` / `delete-model-button.tsx` — тонкие обёртки над `DeleteButton` (уже без next) + `deleteTerritory`/`deleteModel`. Next-импортов нет.
- `src/app/_components/replace-source-button.tsx` — `next/link` → ссылка на `/territories/{slug}/replace`.
- Ф2 `homeRoute` (`src/routes/home.tsx`, плейсхолдер «Signed in as…») **заменяется** реальной главной.
- Целевые роуты ссылок: `/territories/$slug` (viewer — **есть**), `/models/$slug` (**нет**, upload/detail позже), `/territories/new`, `/models/new`, `/territories/$slug/replace` (**нет**, upload-под-план).

## Вне области (следующие под-планы)

- Upload-флоу (`/territories/new`, `/models/new`, replace, documents/new, panoramas/new) и `replace-source-form` (next/navigation) — upload-под-план.
- Model-detail (`/models/$slug`) — отдельно.
- admin/account.

## Структура файлов (Ф3-catalog)

```
frontend/src/
  territory/application/territories-query.ts     # queryOptions
  model/application/models-query.ts              # queryOptions
  shared/presentation/catalog/catalog-card.tsx   # тело карточки (title/desc/slug/open)
  territory/presentation/delete-territory-button.tsx  # порт из app/_components
  model/presentation/delete-model-button.tsx          # порт из app/_components
  territory/presentation/replace-source-button.tsx    # порт (next/link → Link)
  routes/home.tsx           # ПЕРЕПИСАН: реальный грид (заменяет плейсхолдер)
  routes/territories.tsx    # список территорий
  routes/models.tsx         # список моделей
  routes/router.tsx         # + territoriesRoute, modelsRoute в дерево
```

---

## Task 1: queries территорий и моделей

**Files:**
- Create: `frontend/src/territory/application/territories-query.ts`, `frontend/src/model/application/models-query.ts`

**Interfaces:**
- Produces: `territoriesQuery` (`queryOptions`, key `["territories"]`, fn `listTerritories`); `modelsQuery` (key `["models"]`, fn `listModels`).

- [ ] **Step 1: `territories-query.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";

export const territoriesQuery = queryOptions({
  queryKey: ["territories"],
  queryFn: listTerritories,
});
```

- [ ] **Step 2: `models-query.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { listModels } from "@/model/infrastructure/model-gateway";

export const modelsQuery = queryOptions({
  queryKey: ["models"],
  queryFn: listModels,
});
```

- [ ] **Step 3: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/territory/application/territories-query.ts frontend/src/model/application/models-query.ts
git commit -m "feat(spa/phase3-catalog): territories + models query options"
```

---

## Task 2: CatalogCard (тело карточки)

**Files:**
- Create: `frontend/src/shared/presentation/catalog/catalog-card.tsx`

**Interfaces:**
- Produces: `CatalogCard({ title, description, slug, showOpen }: { title: string; description?: string; slug: string; showOpen?: boolean })` — чистая презентационная карточка (без ссылки-обёртки и без action-кнопок; их размещает роут снаружи).

- [ ] **Step 1: Реализация**

```tsx
interface CatalogCardProps {
  title: string;
  description?: string;
  slug: string;
  showOpen?: boolean;
}

// Presentational catalog card body. The route wraps it in a link (TanStack
// Link for existing routes, <a> otherwise) and overlays action buttons — this
// component stays link-agnostic so it works for territories and models alike.
export default function CatalogCard({ title, description, slug, showOpen = true }: CatalogCardProps) {
  return (
    <article className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur transition duration-300 hover:border-white/30 hover:bg-white/[0.06]">
      <h3 className="pr-36 text-2xl font-semibold tracking-tight text-white">{title}</h3>
      {description ? (
        <p className="mt-6 line-clamp-3 text-sm leading-6 text-neutral-300">{description}</p>
      ) : null}
      <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-neutral-400">
        <span>{slug}</span>
        {showOpen ? (
          <span className="transition duration-300 group-hover:translate-x-1 group-hover:text-white">Open</span>
        ) : null}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/presentation/catalog/catalog-card.tsx
git commit -m "feat(spa/phase3-catalog): presentational CatalogCard body"
```

---

## Task 3: action-кнопки (порт в доменные контексты)

**Files:**
- Create: `frontend/src/territory/presentation/delete-territory-button.tsx`
- Create: `frontend/src/model/presentation/delete-model-button.tsx`
- Create: `frontend/src/territory/presentation/replace-source-button.tsx`

**Interfaces:**
- Produces: `DeleteTerritoryButton({slug,label,redirectTo?})`, `DeleteModelButton({slug,label,redirectTo?})`, `ReplaceSourceButton({slug})`.

- [ ] **Step 1: `delete-territory-button.tsx`** (порт из `app/_components`, без изменений логики)

```tsx
import { deleteTerritory } from "@/territory/infrastructure/territory-gateway";
import DeleteButton from "@/shared/presentation/components/delete-button";

export default function DeleteTerritoryButton({
  slug, label, redirectTo,
}: { slug: string; label: string; redirectTo?: string }) {
  return <DeleteButton label={label} onDelete={() => deleteTerritory(slug)} redirectTo={redirectTo} />;
}
```

- [ ] **Step 2: `delete-model-button.tsx`**

```tsx
import { deleteModel } from "@/model/infrastructure/model-gateway";
import DeleteButton from "@/shared/presentation/components/delete-button";

export default function DeleteModelButton({
  slug, label, redirectTo,
}: { slug: string; label: string; redirectTo?: string }) {
  return <DeleteButton label={label} onDelete={() => deleteModel(slug)} redirectTo={redirectTo} />;
}
```

- [ ] **Step 3: `replace-source-button.tsx`** (`next/link` → `<a>`; роут `/territories/$slug/replace` ещё не существует — upload-под-план заменит на `Link`)

```tsx
// Links to the territory's replace-source flow. That route lands in the upload
// sub-plan; until then this is a plain <a> (full load, 404 until the route
// exists). Swap to TanStack <Link> when /territories/$slug/replace is added.
export default function ReplaceSourceButton({ slug }: { slug: string }) {
  return (
    <a
      href={`/territories/${encodeURIComponent(slug)}/replace`}
      aria-label="Replace source"
      title="Replace 3D source"
      className="cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-neutral-200 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white"
    >
      Replace
    </a>
  );
}
```

- [ ] **Step 4: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/territory/presentation/delete-territory-button.tsx frontend/src/model/presentation/delete-model-button.tsx frontend/src/territory/presentation/replace-source-button.tsx
git commit -m "feat(spa/phase3-catalog): port catalog action buttons into domain contexts"
```

---

## Task 4: главная (реальный грид, заменяет плейсхолдер)

**Files:**
- Modify (rewrite): `frontend/src/routes/home.tsx`

**Interfaces:**
- Consumes: `authedLayoutRoute`, `territoriesQuery`, `modelsQuery`, `CatalogCard`, `DeleteTerritoryButton`, `DeleteModelButton`, `ReplaceSourceButton`, `useCurrentUser`/`can`, `MotionList`/`MotionItem`, `Link`.

- [ ] **Step 1: Переписать `home.tsx`** (loader греет обе query; компонент рендерит две секции)

```tsx
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { territoriesQuery } from "@/territory/application/territories-query";
import { modelsQuery } from "@/model/application/models-query";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import CatalogCard from "@/shared/presentation/catalog/catalog-card";
import DeleteTerritoryButton from "@/territory/presentation/delete-territory-button";
import ReplaceSourceButton from "@/territory/presentation/replace-source-button";
import DeleteModelButton from "@/model/presentation/delete-model-button";

function Home() {
  const me = useCurrentUser();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const { data: models = [] } = useQuery(modelsQuery);
  const tWrite = can(me, "territory:write");
  const tDelete = can(me, "territory:delete");
  const mWrite = can(me, "model:write");
  const mDelete = can(me, "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:px-10">
        <header>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Andrey Viewer</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">Territories and models</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg">
            A territory is the scene you walk through in the viewer. A model is an asset placed on top of it.
          </p>
        </header>

        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Territories</h2>
            {tWrite ? <a href="/territories/new" className="cursor-pointer rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/[0.1]">+ Upload territory</a> : null}
          </div>
          {territories.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">The catalog is empty.</div>
          ) : (
            <MotionList className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {territories.map((t) => (
                <MotionItem key={t.slug} className="relative">
                  <Link to="/territories/$slug" params={{ slug: t.slug }} className="cursor-pointer">
                    <CatalogCard title={t.title} description={t.description} slug={t.slug} />
                  </Link>
                  {tWrite || tDelete ? (
                    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                      {tWrite ? <ReplaceSourceButton slug={t.slug} /> : null}
                      {tDelete ? <DeleteTerritoryButton slug={t.slug} label={t.title} /> : null}
                    </div>
                  ) : null}
                </MotionItem>
              ))}
            </MotionList>
          )}
        </section>

        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Models</h2>
            {mWrite ? <a href="/models/new" className="cursor-pointer rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/[0.1]">+ Upload model</a> : null}
          </div>
          {models.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">No models yet.</div>
          ) : (
            <MotionList className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {models.map((m) => (
                <MotionItem key={m.slug} className="relative">
                  {/* model detail route not migrated yet → plain <a> */}
                  <a href={`/models/${m.slug}`} className="cursor-pointer"><CatalogCard title={m.title} description={m.description} slug={m.slug} /></a>
                  {mDelete ? <div className="absolute right-3 top-3 z-10"><DeleteModelButton slug={m.slug} label={m.title} /></div> : null}
                </MotionItem>
              ))}
            </MotionList>
          )}
        </section>
      </section>
    </main>
  );
}

export const homeRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/",
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(territoriesQuery),
      context.queryClient.ensureQueryData(modelsQuery),
    ]),
  component: Home,
});
```

> Файл близок к 200 строкам — если ESLint ругнётся, вынести секцию Models или карточную обёртку в под-компонент. Проверить `yarn lint` в Task 6.

- [ ] **Step 2: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/home.tsx
git commit -m "feat(spa/phase3-catalog): real home grid (territories + models)"
```

---

## Task 5: списки территорий и моделей

**Files:**
- Create: `frontend/src/routes/territories.tsx`, `frontend/src/routes/models.tsx`

**Interfaces:**
- Produces: `territoriesRoute` (`/territories`), `modelsRoute` (`/models`) — оба под `authedLayoutRoute`.

- [ ] **Step 1: `territories.tsx`**

```tsx
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { territoriesQuery } from "@/territory/application/territories-query";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import CatalogCard from "@/shared/presentation/catalog/catalog-card";
import DeleteTerritoryButton from "@/territory/presentation/delete-territory-button";
import ReplaceSourceButton from "@/territory/presentation/replace-source-button";

function Territories() {
  const me = useCurrentUser();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const canWrite = can(me, "territory:write");
  const canDelete = can(me, "territory:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <Link to="/" className="text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">← Home</Link>
            <p className="mt-3 text-xs uppercase tracking-[0.36em] text-cyan-300/80">Territory catalog</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Scenes to walk through</h1>
          </div>
          {canWrite ? <a href="/territories/new" className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-cyan-200">+ Upload</a> : null}
        </header>
        {territories.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">The catalog is empty. Upload your first territory.</div>
        ) : (
          <MotionList className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {territories.map((t) => (
              <MotionItem key={t.slug} className="relative">
                {canWrite || canDelete ? (
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                    {canWrite ? <ReplaceSourceButton slug={t.slug} /> : null}
                    {canDelete ? <DeleteTerritoryButton slug={t.slug} label={t.title} /> : null}
                  </div>
                ) : null}
                <Link to="/territories/$slug" params={{ slug: t.slug }} className="block cursor-pointer">
                  <CatalogCard title={t.title} description={t.description} slug={t.slug} showOpen={false} />
                </Link>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </section>
    </main>
  );
}

export const territoriesRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories",
  loader: ({ context }) => context.queryClient.ensureQueryData(territoriesQuery),
  component: Territories,
});
```

- [ ] **Step 2: `models.tsx`** (аналогично; model-detail не мигрирован → `<a>`; фон амбер как в оригинале)

```tsx
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authedLayoutRoute } from "@/routes/layout";
import { modelsQuery } from "@/model/application/models-query";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { MotionList, MotionItem } from "@/shared/presentation/motion";
import CatalogCard from "@/shared/presentation/catalog/catalog-card";
import DeleteModelButton from "@/model/presentation/delete-model-button";

function Models() {
  const me = useCurrentUser();
  const { data: models = [] } = useQuery(modelsQuery);
  const canWrite = can(me, "model:write");
  const canDelete = can(me, "model:delete");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <Link to="/" className="text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">← Home</Link>
            <p className="mt-3 text-xs uppercase tracking-[0.36em] text-amber-200/80">Model catalog</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Models for placement</h1>
          </div>
          {canWrite ? <a href="/models/new" className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-amber-200">+ Upload</a> : null}
        </header>
        {models.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-neutral-300">No models yet. Upload your first one.</div>
        ) : (
          <MotionList className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <MotionItem key={m.slug} className="relative">
                {canDelete ? <div className="absolute right-3 top-3 z-10"><DeleteModelButton slug={m.slug} label={m.title} /></div> : null}
                <a href={`/models/${m.slug}`} className="block cursor-pointer">
                  <CatalogCard title={m.title} description={m.description} slug={m.slug} showOpen={false} />
                </a>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </section>
    </main>
  );
}

export const modelsRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/models",
  loader: ({ context }) => context.queryClient.ensureQueryData(modelsQuery),
  component: Models,
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/territories.tsx frontend/src/routes/models.tsx
git commit -m "feat(spa/phase3-catalog): territories + models list routes"
```

---

## Task 6: подключить в router + проверки

**Files:**
- Modify: `frontend/src/routes/router.tsx`

- [ ] **Step 1: Добавить роуты в дерево**

```tsx
import { territoriesRoute } from "@/routes/territories";
import { modelsRoute } from "@/routes/models";
// ...
const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([homeRoute, territoryViewerRoute, territoriesRoute, modelsRoute]),
]);
```

- [ ] **Step 2: Сборка + lint + бандл-grep**

Run:
```bash
cd frontend && yarn build:spa && yarn lint && grep -oiE "next/(dynamic|link|navigation|headers|server|font)" dist/assets/*.js | sort -u || echo "no next/* (clean)"
```
Expected: сборка ок; ESLint без ошибок (если `home.tsx` > 200 строк — вынести под-секцию); grep пуст.

- [ ] **Step 3: Полный vitest**

Run: `cd frontend && yarn test:spa`
Expected: PASS — 19 тестов (без изменений; каталог логики без юнит-тестов — чистая разметка + reused DeleteButton).

- [ ] **Step 4: Dev-оптимизатор — нет достижимых next-импортов**

Run (локальный стек не нужен для этого — важен именно scan):
```bash
cd frontend && (yarn dev:spa &) && sleep 4 && curl -s http://localhost:5173/ >/dev/null && sleep 2 && grep -iE "new dependencies optimized|next/" "$(ls -t node_modules/.vite 2>/dev/null | head -1)" 2>/dev/null; kill %1 2>/dev/null
```
Проще — запустить `yarn dev:spa`, открыть `/`, `/territories`, `/models` в headless-CDP и прочитать лог dev-сервера: строк `optimized: … next/*` быть НЕ должно.

- [ ] **Step 5: E2E — механика (локальный стек, пустой каталог)**

Локальный стек (`docker compose up -d gateway`, `admin`/`change-me-now`, каталог пуст), `yarn dev:spa`, CDP:
1. Логин → токен.
2. `/` → рендерятся заголовки «Territories» и «Models» + пустые состояния («The catalog is empty.», «No models yet.»); `JS_ERRORS: none`.
3. `/territories` → «Scenes to walk through» + пустое состояние; `/models` → «Models for placement» + пустое.
4. Клик «← Home» на `/territories` → SPA-переход на `/` (без полной перезагрузки).

Assert: тексты присутствуют, переходы работают, 0 ошибок.

- [ ] **Step 6: E2E — реальные данные (dev-proxy на прод, визуально — пользователь)**

Через `VITE_API_URL= VITE_DEV_PROXY=https://api.andrey.vbncursed.fun yarn dev:spa` пользователь заходит под `vbncursed`+2FA, видит на `/` реальные карточки (operation-center, mr-1-wo, dji-wp-46-cut + модели), клик по карточке территории → SPA-переход в viewer, delete/replace-кнопки видны по правам.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/router.tsx
git commit -m "feat(spa/phase3-catalog): wire home/territories/models routes"
```

---

## Self-Review

- **Покрытие:** queries (Task 1), CatalogCard (Task 2), action-кнопки (Task 3), home-грид взамен плейсхолдера (Task 4), списки территорий/моделей (Task 5), подключение + проверки (Task 6). ✓
- **Плейсхолдеры:** нет TBD; вся разметка приведена. ✓
- **Тип-консистентность:** `territoriesQuery`/`modelsQuery` (Task 1) ← loaders/`useQuery` (Task 4/5); `CatalogCard` пропсы (Task 2) ← вызовы; кнопки (Task 3) ← роуты. ✓
- **next-freeness:** проверяется и grep бандла (Task 6.2), и dev-оптимизатором (Task 6.4) — урок из viewer учтён. ✓
- **200-строчный кап:** `home.tsx` близко к лимиту — Task 4/6 предусматривают вынос под-секции при срабатывании ESLint. ✓

## Отложено

- `<a href>` → TanStack `<Link>` для `/models/$slug`, `/territories/new`, `/models/new`, `/territories/$slug/replace` — когда эти роуты появятся (upload/model-detail под-планы).
- Инвалидация `["territories"]`/`["models"]` после upload/replace — в upload-под-плане (там мутации).
