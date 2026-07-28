# Ф3-upload (create): `/territories/new` + `/models/new` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести create-флоу загрузки: `/territories/new` (одиночная ZIP → territory) и `/models/new` (батч ZIP → models). Починить chunked-upload под SPA (абсолютный gateway + токен на сырых fetch), увести формы с `next/navigation`, добавить guard по праву для beforeLoad.

**Architecture:** `initiateUpload`/`finalizeUpload` уже идут через `httpPost` (client.ts → абсолютный + Bearer). Сырые `fetch("/api/uploads/…")` (PATCH append, HEAD status, DELETE abort) — относительные и БЕЗ токена (сейчас их авторизует BFF-прокси, которого в SPA нет) → чиним на `${VITE_API_URL}` + `Authorization` из token-store. Формы после create делают `window.location.assign(target)` (hard-nav: viewer грузится свежим и подписывается на SSE; catalog-queries переполучаются). Роуты `/territories/new`,`/models/new` под `authedLayoutRoute` с `requirePermission(...)` в beforeLoad (заменяет server-only `requirePermission`).

**Tech Stack:** TanStack Router (`createRoute`, `beforeLoad`, `redirect`), TanStack Query (`ensureQueryData(meQuery)`), token-store, existing `runChunkedUpload`/`useChunkedUpload`/`UploadForm`/`BatchUploadForm`.

## Global Constraints

- Hard cap 200 строк/файл. Бренд «Andrey». Alias `@/*`. Ветка `spa`.
- vitest-тесты — `*.spec.ts`. Гейты: `yarn build:spa` + `yarn test:spa` + `yarn lint` (все живы на TS 6.0.3 / Vite 8).
- Clean Architecture: роутинг-примитивы в `src/routes/`; upload-gateway остаётся в `upload/infrastructure`.
- **next-freeness** проверяется grep бандла И dev-оптимизатором Vite.

## Предпосылки (обнаружено при планировании)

- `src/upload/infrastructure/upload-gateway.ts`: `initiateUpload`/`finalizeUpload` — через `httpPost` (ок). `appendChunk` (PATCH), `getUploadStatus` (HEAD), `abortUpload` (DELETE) — **сырые `fetch(\`/api/uploads/…\`)`, относительные, без токена** → чинить.
- `src/upload/presentation/components/upload-form.tsx` (одиночная, territory): `useRouter` + `router.push(target)` после create; `target = \`${redirectBase}/${slug}?jobId=…\`` или `/`.
- `src/upload/presentation/components/batch-upload-form.tsx` (батч, models): `useRouter` + `router.push`; single-file → `/models/{slug}?jobId=…`, multi → `redirectBase` (`/models`).
- `runChunkedUpload` (upload/application) вызывает gateway-функции — правок не требует (чиним нижележащий gateway).
- Пейджи `app/territories/new/page.tsx`,`app/models/new/page.tsx` — тонкие обёртки: `requirePermission("territory:write"|"model:write")` (server-only, редирект) → `NewTerritoryForm`/`NewModelForm`.
- `NewTerritoryForm` → `UploadForm kind="Territory" showPanoramaUrl redirectAfter="detail"` + `createTerritory`. `NewModelForm` → `BatchUploadForm kind="Model"` + `createModel`. Обёртки без next-импортов.
- Гейтвеи `createTerritory`/`createModel` — на `httpPost`, браузер-safe.
- `meQuery` (Ф2), `can` (`principal.ts`), `requireAuth` (Ф2 guard) — есть.

## Вне области (следующий upload-под-план)

- `/territories/$slug/replace` (`replace-source-form`, next/navigation), `/territories/$slug/documents/new` (`document-upload-form`), `/territories/$slug/panoramas/new` (`panorama-upload-form`) — переиспользуют ту же починенную upload-машинерию + `requirePermission`.
- model-detail `/models/$slug`, admin, account.

## Структура файлов

```
frontend/src/
  upload/infrastructure/upload-gateway.ts     # raw fetch → absolute + Bearer (+ .spec)
  routes/guard.ts                             # + requirePermission(queryClient, pathname, perm) (+ spec)
  upload/presentation/components/upload-form.tsx        # useRouter → location.assign
  upload/presentation/components/batch-upload-form.tsx  # useRouter → location.assign
  routes/territory-new.tsx                    # /territories/new (перм-guard + UploadForm)
  routes/model-new.tsx                        # /models/new (перм-guard + BatchUploadForm)
  routes/router.tsx                           # + оба роута
```

---

## Task 1: upload-gateway — абсолютный URL + токен на сырых fetch (TDD)

**Files:**
- Modify: `frontend/src/upload/infrastructure/upload-gateway.ts`
- Create: `frontend/src/upload/infrastructure/upload-gateway.spec.ts`

**Interfaces:**
- Consumes: `getToken` (token-store), `import.meta.env.VITE_API_URL`.
- Produces (сигнатуры неизменны): `appendChunk`, `getUploadStatus`, `abortUpload` — теперь бьют в `${VITE_API_URL}/api/uploads/…` с `Authorization: Bearer`.

- [ ] **Step 1: Падающий тест — `upload-gateway.spec.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appendChunk, getUploadStatus, abortUpload } from "@/upload/infrastructure/upload-gateway";
import { setToken } from "@/auth/infrastructure/token-store";

const API = "http://localhost:8080";

function mockFetch(status: number, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(null, { status, headers }));
}

describe("upload-gateway raw fetches", () => {
  beforeEach(() => { localStorage.clear(); setToken("tok"); });
  afterEach(() => vi.restoreAllMocks());

  it("appendChunk hits absolute gateway URL with Bearer + Upload-Offset", async () => {
    const f = mockFetch(204, { "Upload-Offset": "16" });
    vi.stubGlobal("fetch", f);
    const next = await appendChunk("s1", 0, new Blob(["x"]));
    expect(f.mock.calls[0][0]).toBe(`${API}/api/uploads/s1`);
    const init = f.mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer tok");
    expect(h["Upload-Offset"]).toBe("0");
    expect(next).toBe(16);
  });

  it("getUploadStatus HEAD returns offset/size, 404 → null", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { "Upload-Offset": "8", "Upload-Length": "32" }));
    expect(await getUploadStatus("s1")).toEqual({ offset: 8, size: 32 });
    vi.stubGlobal("fetch", mockFetch(404));
    expect(await getUploadStatus("s1")).toBeNull();
  });

  it("abortUpload DELETEs the absolute URL with Bearer", async () => {
    const f = mockFetch(204);
    vi.stubGlobal("fetch", f);
    await abortUpload("s1");
    expect(f.mock.calls[0][0]).toBe(`${API}/api/uploads/s1`);
    expect((f.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(((f.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/upload/infrastructure/upload-gateway.spec.ts`
Expected: FAIL (текущий бьёт в относительный `/api/uploads/s1` без Authorization).

- [ ] **Step 3: Правка — добавить helper + переписать 3 сырых fetch**

В начало файла (после импортов) добавить:
```ts
import { getToken } from "@/auth/infrastructure/token-store";

const API_BASE = import.meta.env.VITE_API_URL;

// The SPA has no same-origin BFF, so the raw upload fetches (PATCH/HEAD/DELETE)
// must target the gateway directly and carry the Bearer token themselves —
// unlike initiate/finalize which go through the authed httpPost client.
function uploadHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}
```

В `appendChunk`:
```ts
  const res = await fetch(`${API_BASE}/api/uploads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: uploadHeaders({
      "Content-Type": "application/octet-stream",
      "Upload-Offset": String(offset),
    }),
    body: chunk,
    signal,
  });
```

В `getUploadStatus`:
```ts
  const res = await fetch(`${API_BASE}/api/uploads/${encodeURIComponent(id)}`, {
    method: "HEAD",
    headers: uploadHeaders(),
  });
```

В `abortUpload`:
```ts
  await fetch(`${API_BASE}/api/uploads/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: uploadHeaders(),
  });
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/upload/infrastructure/upload-gateway.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/upload/infrastructure/upload-gateway.ts frontend/src/upload/infrastructure/upload-gateway.spec.ts
git commit -m "feat(spa/phase3-upload): chunked upload raw fetches → absolute gateway + Bearer"
```

---

## Task 2: requirePermission guard (TDD)

**Files:**
- Modify: `frontend/src/routes/guard.ts`
- Create: `frontend/src/routes/guard-permission.spec.ts`

**Interfaces:**
- Consumes: `requireAuth` (существующий), `meQuery`, `can`, `redirect`, `QueryClient`.
- Produces: `requirePermission(queryClient: QueryClient, pathname: string, permission: string): Promise<void>` — сначала `requireAuth`; затем грузит принципала и `redirect({to:"/"})` если нет права.

- [ ] **Step 1: Падающий тест — `guard-permission.spec.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { requirePermission } from "@/routes/guard";
import { setToken } from "@/auth/infrastructure/token-store";
import type { Principal } from "@/auth/domain/principal";

function clientReturning(me: Partial<Principal>) {
  const qc = new QueryClient();
  vi.spyOn(qc, "ensureQueryData").mockResolvedValue(me as Principal);
  return qc;
}

describe("requirePermission", () => {
  beforeEach(() => { localStorage.clear(); setToken("tok"); });

  it("passes when the principal has the permission", async () => {
    const qc = clientReturning({ isOwner: false, permissions: ["territory:write"] });
    await expect(requirePermission(qc, "/territories/new", "territory:write")).resolves.toBeUndefined();
  });

  it("redirects home when the permission is missing", async () => {
    const qc = clientReturning({ isOwner: false, permissions: [] });
    try {
      await requirePermission(qc, "/territories/new", "territory:write");
      expect.unreachable("should redirect");
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to?: string } }).options.to).toBe("/");
    }
  });

  it("redirects to /login when there is no token (via requireAuth)", async () => {
    localStorage.clear();
    const qc = clientReturning({ permissions: [] });
    try {
      await requirePermission(qc, "/territories/new", "territory:write");
      expect.unreachable("should redirect");
    } catch (e) {
      expect((e as { options: { to?: string } }).options.to).toBe("/login");
    }
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/routes/guard-permission.spec.ts`
Expected: FAIL (`requirePermission` не экспортирован).

- [ ] **Step 3: Дополнить `guard.ts`**

Добавить импорты и функцию (не трогая существующий `requireAuth`):
```ts
import type { QueryClient } from "@tanstack/react-query";
import { meQuery } from "@/auth/application/me-query";
import { can } from "@/auth/domain/principal";

// Route guard for permission-gated pages: first the cheap token check, then load
// the principal and bounce home if the permission is absent. The gateway still
// enforces the mutation — this is UX, not the security boundary.
export async function requirePermission(
  queryClient: QueryClient,
  pathname: string,
  permission: string,
): Promise<void> {
  requireAuth(pathname);
  const me = await queryClient.ensureQueryData(meQuery);
  if (!can(me, permission)) {
    throw redirect({ to: "/" });
  }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/routes/guard-permission.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/guard.ts frontend/src/routes/guard-permission.spec.ts
git commit -m "feat(spa/phase3-upload): requirePermission route guard"
```

---

## Task 3: upload-form off next

**Files:**
- Modify: `frontend/src/upload/presentation/components/upload-form.tsx`

- [ ] **Step 1: Заменить next-навигацию**

- Удалить строку `import { useRouter } from "next/navigation";`.
- Удалить `const router = useRouter();`.
- В `onSubmit` заменить `router.push(target);` на `window.location.assign(target);` (hard-nav: viewer грузится свежим и подписывается на SSE по `?jobId`).
- Убрать `router` из массива зависимостей `useCallback`.

- [ ] **Step 2: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/upload/presentation/components/upload-form.tsx
git commit -m "feat(spa/phase3-upload): upload-form off next (location.assign)"
```

---

## Task 4: batch-upload-form off next

**Files:**
- Modify: `frontend/src/upload/presentation/components/batch-upload-form.tsx`

- [ ] **Step 1: Заменить next-навигацию**

- Удалить `import { useRouter } from "next/navigation";` и `const router = useRouter();`.
- В `onSubmit` заменить оба `router.push(...)` на `window.location.assign(...)`:
  - `window.location.assign(\`${redirectBase}/${lastSlug}?jobId=${encodeURIComponent(lastJob.id)}\`);`
  - `window.location.assign(redirectBase);`
- Убрать `router` из зависимостей `useCallback`.

- [ ] **Step 2: Сборка валидна**

Run: `cd frontend && yarn build:spa`
Expected: успех.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/upload/presentation/components/batch-upload-form.tsx
git commit -m "feat(spa/phase3-upload): batch-upload-form off next (location.assign)"
```

---

## Task 5: роуты `/territories/new` + `/models/new`

**Files:**
- Create: `frontend/src/routes/territory-new.tsx`, `frontend/src/routes/model-new.tsx`
- Modify: `frontend/src/routes/router.tsx`

**Interfaces:**
- Consumes: `authedLayoutRoute`, `requirePermission`, `UploadForm`/`BatchUploadForm`, `createTerritory`/`createModel`.

- [ ] **Step 1: `territory-new.tsx`** (порт `NewTerritoryForm` + guard)

```tsx
import { createRoute } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import UploadForm from "@/upload/presentation/components/upload-form";
import { createTerritory } from "@/territory/infrastructure/territory-gateway";

function NewTerritory() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <UploadForm
        kind="Territory"
        redirectBase="/territories"
        redirectAfter="detail"
        showPanoramaUrl
        create={async (body) => {
          const { territory, job } = await createTerritory(body);
          return { slug: territory.slug, job };
        }}
      />
    </main>
  );
}

export const territoryNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/territories/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location.pathname, "territory:write"),
  component: NewTerritory,
});
```

> Роут `/territories/new` должен объявляться так, чтобы не конфликтовать с `/territories/$slug` — у TanStack Router статический сегмент `new` имеет приоритет над динамическим `$slug`, так что порядок в дереве не важен, но проверить в Task 6, что `/territories/new` открывает форму, а не viewer с slug="new".

- [ ] **Step 2: `model-new.tsx`** (порт `NewModelForm` + guard)

```tsx
import { createRoute } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { requirePermission } from "@/routes/guard";
import BatchUploadForm from "@/upload/presentation/components/batch-upload-form";
import { createModel } from "@/model/infrastructure/model-gateway";

function NewModel() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a1f10_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <BatchUploadForm
        kind="Model"
        redirectBase="/models"
        create={async (body) => {
          const { model, job } = await createModel(body);
          return { slug: model.slug, job };
        }}
      />
    </main>
  );
}

export const modelNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/models/new",
  beforeLoad: ({ context, location }) =>
    requirePermission(context.queryClient, location.pathname, "model:write"),
  component: NewModel,
});
```

- [ ] **Step 3: Подключить в `router.tsx`**

```tsx
import { territoryNewRoute } from "@/routes/territory-new";
import { modelNewRoute } from "@/routes/model-new";
// ...
const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([
    homeRoute, territoryViewerRoute, territoriesRoute, modelsRoute,
    territoryNewRoute, modelNewRoute,
  ]),
]);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/territory-new.tsx frontend/src/routes/model-new.tsx frontend/src/routes/router.tsx
git commit -m "feat(spa/phase3-upload): /territories/new + /models/new routes"
```

---

## Task 6: проверки

- [ ] **Step 1: Сборка + lint + бандл-grep + тесты**

Run:
```bash
cd frontend && yarn build:spa && yarn lint && yarn test:spa && grep -oiE "next/(dynamic|link|navigation|headers|server|font)" dist/assets/*.js | sort -u || echo "no next/* (clean)"
```
Expected: build ок; lint чист; тесты — **25** (19 + upload-gateway 3 + requirePermission 3); grep пуст.

- [ ] **Step 2: E2E — механика (локальный стек)**

Локальный стек (`docker compose up -d gateway`, `admin`/`change-me-now` — у него есть write-права), `yarn dev:spa`, CDP:
1. Логин → токен.
2. `/territories/new` → рендерится форма («New territory», поле Title, file-input) — НЕ viewer со slug=new; `JS_ERRORS: none`.
3. `/models/new` → батч-форма («New models»).
4. Без токена `/territories/new` → `/login` (guard).

Assert: заголовки форм присутствуют, `location.pathname` корректен, 0 ошибок.

- [ ] **Step 3: Dev-оптимизатор — нет достижимых next**

Запустить `yarn dev:spa`, открыть `/territories/new`,`/models/new` в CDP, прочитать dev-лог: строк `optimized: … next/*` быть НЕ должно.

- [ ] **Step 4: E2E — реальная загрузка (пользователь, dev-proxy или локально с ZIP)**

Полный цикл (upload ZIP → convert → viewer с SSE) — визуально пользователь: через `VITE_API_URL= VITE_DEV_PROXY=…` (или локально, положив тестовый ZIP), залить территорию/модель, увидеть прогресс-бар чанков, редирект в viewer на экран ConversionPending, SSE-прогресс.

- [ ] **Step 5: Commit** (если правился только router — уже в Task 5; иначе фиксация проверок в лог)

Проверки не меняют код — коммитить нечего сверх Task 5.

---

## Self-Review

- **Покрытие:** upload-gateway auth-fix (Task 1), permission-guard (Task 2), upload-form (Task 3), batch-form (Task 4), роуты new+wire (Task 5), проверки (Task 6). ✓
- **Плейсхолдеры:** нет TBD; правки формул точечные, код приведён. ✓
- **Тип-консистентность:** `requirePermission(queryClient, pathname, perm)` (Task 2) ← beforeLoad (Task 5); `appendChunk`/`getUploadStatus`/`abortUpload` сигнатуры неизменны (Task 1). ✓
- **Безопасность:** сырые upload-fetch теперь несут токен (Task 1) — иначе PATCH/HEAD/DELETE ловили бы 401 в SPA; guard дублирует серверный (UX, не граница). ✓
- **next-freeness:** grep бандла + dev-оптимизатор (Task 6). ✓
- **200-cap:** формы существующие (< 200); новые роуты малы. Lint (жив на TS6) поймает регресс. ✓

## Отложено

- replace / documents / panoramas формы (next/navigation) — следующий upload-под-план (та же машинерия + requirePermission).
- Инвалидация `["territories"]`/`["models"]` не нужна: hard-nav после create стирает кэш; при возврате в каталог — свежий fetch.
- `/models/$slug` (model-detail) — редирект батч-формы single-file идёт на `/models/{slug}` (пока `<a>`-совместимо через hard-nav; SPA-viewer моделей — отдельно).
