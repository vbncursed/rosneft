# Ф2: приватный гард + TanStack Query + layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каркас аутентифицированной части SPA: TanStack Query-провайдер, запрос текущего пользователя, гард приватных роутов (нет токена → `/login`), общий authed-layout (навигация/UserMenu/оверлеи + fade-переход) и защищённый placeholder-home взамен Ф1-редиректа.

**Architecture:** Добавляем `QueryClient` (провайдер в `main.tsx`, инстанс в router-context для будущих loader'ов Ф3). Текущий пользователь — `meQuery` (`getMe` → `Principal`). Гард — `beforeLoad`, проверяющий только наличие токена (быстро, без сети); протухший токен ловит `client.ts` (401 → hard-nav на `/login`). Pathless layout-route оборачивает защищённые дети в `AppLayout` (кормит существующий `CurrentUserProvider` из `meQuery`, рендерит ported `UserMenu` + Toaster/ConfirmModal + `page-fade` Outlet).

**Tech Stack:** @tanstack/react-query 5 (`queryOptions`, `useQuery`), @tanstack/react-router 1 (context, pathless layout route, `redirect`/`isRedirect`), существующий `page-fade` CSS.

## Global Constraints

- **Hard cap 200 строк/файл** (ESLint `max-lines`).
- **Бренд «Andrey»**, не «Rosneft».
- Clean Architecture: `domain/` чист; `presentation/` не импортит `infrastructure` DTO; роутинг-примитивы (`redirect`) живут в `src/routes/`, не в `application/`.
- Alias `@/*` → `frontend/src/*`. Ветка `spa`.
- vitest-тесты — `*.spec.ts`; легаси node:test — `*.test.ts`.
- `motion` только `motion/react`, только в `presentation/` — но переходы делаем через существующий `page-fade` CSS (см. ниже), motion не вводим.

## Предпосылки (обнаружено при планировании)

- `src/auth/presentation/current-user-context.tsx` — браузер-safe (`"use client"`, `createContext`, `useCurrentUser`, `useCan`). **Переиспользуем как есть.**
- `src/auth/infrastructure/auth-gateway.ts` → `getMe(): Promise<Principal>` (через `httpGet("/api/auth/me")`) — браузер-safe.
- `src/auth/infrastructure/auth-login.ts` → `logout()` (Ф1) — POST logout + `clearToken`.
- `src/auth/infrastructure/token-store.ts` → `getToken()` (Ф1).
- `src/shared/infrastructure/http/client.ts` (Ф1): на 401 (не на `/login`) чистит токен и `location.assign("/login?next=…")` — это ловит протухший токен, гард дублировать эту проверку не должен.
- `src/routes/*` (Ф1): `rootRoute` (Outlet), `loginRoute` (public, `search:{next}`), `indexRoute` (redirect `/`→`/login`) — **`indexRoute` заменяется** защищённым home. `router.tsx` — `createRouter({routeTree})`.
- Оверлеи `src/shared/presentation/toast/toaster.tsx`, `src/shared/presentation/confirm/confirm-modal.tsx` — `"use client"`, без Next. `src/app/sw-register.tsx` — тоже, но это **Ф4** (PWA), сейчас не подключаем.
- `page-fade` в `src/app/globals.css`: `animation: page-fade-in 150ms ease-out`, отключается при `prefers-reduced-motion`. Используем для переходов.
- Ссылки `UserMenu` ведут на `/admin/users`, `/account` — этих роутов ещё нет (Ф3). В Ф2 они остаются обычными `<a href>` (полная перезагрузка, 404 до Ф3), НЕ типизированный `<Link>`.

## Вне области Ф2

- Реальные роуты (home-грид, viewer, admin, account) — Ф3.
- Loader'ы с `ensureQueryData` — Ф3 (context.queryClient готовим здесь заранее).
- PWA/sw-register/иконки — Ф4. Passkey — позже.
- Проверка валидности токена внутри гарда по сети — намеренно нет (ловит `client.ts` на первом же `meQuery`).

## Структура файлов (Ф2)

```
frontend/src/
  shared/infrastructure/query/query-client.ts   # QueryClient instance
  auth/application/me-query.ts                   # meQuery (queryOptions → getMe)
  routes/
    guard.ts                                     # requireAuth (token presence)
    guard.spec.ts
    layout.tsx                                   # pathless authed layout route
    home.tsx                                     # protected placeholder home
    router.tsx                                   # ПЕРЕПИСАН: context + tree
  app-shell/
    app-layout.tsx                               # AppLayout (provider+menu+overlays+fade)
    user-menu.tsx                                # ported UserMenu
  main.tsx                                       # + QueryClientProvider
```

---

## Task 1: TanStack Query — client + provider

**Files:**
- Modify: `frontend/package.json` (add `@tanstack/react-query`)
- Create: `frontend/src/shared/infrastructure/query/query-client.ts`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces: `queryClient: QueryClient`.

- [ ] **Step 1: Установить зависимость**

Run: `cd frontend && yarn add @tanstack/react-query@^5`
Expected: установлено, `package.json`/`yarn.lock` обновлены.

- [ ] **Step 2: `query-client.ts`**

```ts
import { QueryClient } from "@tanstack/react-query";

// Shared query client. staleTime keeps the current-user and future list
// queries from refetching on every mount; retry:1 avoids hammering the gateway
// on a hard failure. Tune per-query later if needed.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
```

- [ ] **Step 3: Обернуть `main.tsx` в провайдер**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "@/shared/infrastructure/query/query-client";
import { router } from "@/routes/router";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Билд проходит**

Run: `cd frontend && yarn build:spa`
Expected: успех (router.tsx ещё старый — билд валиден; менять его будем в Task 5).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/yarn.lock frontend/src/shared/infrastructure/query/query-client.ts frontend/src/main.tsx
git commit -m "feat(spa/phase2): tanstack query client + provider"
```

---

## Task 2: me-query

**Files:**
- Create: `frontend/src/auth/application/me-query.ts`

**Interfaces:**
- Consumes: `getMe` (`auth-gateway.ts`).
- Produces: `meQuery` — `queryOptions` с `queryKey: ["me"]`, `queryFn: getMe`.

- [ ] **Step 1: Реализация**

```ts
import { queryOptions } from "@tanstack/react-query";
import { getMe } from "@/auth/infrastructure/auth-gateway";

// The signed-in principal. Shared query key so UserMenu, guards and future
// routes all read one cache entry. getMe throws on 401 — client.ts turns that
// into a hard bounce to /login, so a stale token self-heals.
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: getMe,
});
```

- [ ] **Step 2: Типопроверка/сборка не ломается**

Run: `cd frontend && yarn build:spa`
Expected: успех (файл ещё никем не импортируется — проверяем, что сам по себе валиден; используется в Task 4/5).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/application/me-query.ts
git commit -m "feat(spa/phase2): me-query (current principal query options)"
```

---

## Task 3: приватный гард (TDD)

**Files:**
- Create: `frontend/src/routes/guard.ts`, `frontend/src/routes/guard.spec.ts`

**Interfaces:**
- Consumes: `getToken` (`token-store.ts`), `redirect` (`@tanstack/react-router`).
- Produces: `requireAuth(pathname: string): void` — бросает `redirect({to:"/login", search:{next:pathname}})` если токена нет.

- [ ] **Step 1: Написать падающий тест — `guard.spec.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { requireAuth } from "@/routes/guard";
import { setToken } from "@/auth/infrastructure/token-store";

describe("requireAuth", () => {
  beforeEach(() => localStorage.clear());

  it("throws a redirect to /login when no token", () => {
    try {
      requireAuth("/territories");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { to?: string }).to).toBe("/login");
      expect((e as { search?: { next?: string } }).search?.next).toBe("/territories");
    }
  });

  it("does nothing when a token is present", () => {
    setToken("tok");
    expect(() => requireAuth("/territories")).not.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/routes/guard.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Реализация — `guard.ts`**

```ts
import { redirect } from "@tanstack/react-router";
import { getToken } from "@/auth/infrastructure/token-store";

// Cheap synchronous guard for protected routes: no token → bounce to /login,
// preserving where the user was headed. Token validity (expiry/revocation) is
// NOT checked here — the first meQuery fetch 401s and client.ts hard-navigates
// to /login, so a stale token self-heals without a network call in beforeLoad.
export function requireAuth(pathname: string): void {
  if (!getToken()) {
    throw redirect({ to: "/login", search: { next: pathname } });
  }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/routes/guard.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/guard.ts frontend/src/routes/guard.spec.ts
git commit -m "feat(spa/phase2): requireAuth route guard (token presence)"
```

---

## Task 4: AppLayout + ported UserMenu

**Files:**
- Create: `frontend/src/app-shell/user-menu.tsx`, `frontend/src/app-shell/app-layout.tsx`

**Interfaces:**
- Consumes: `meQuery` (Task 2), `useCurrentUser`/`CurrentUserProvider` (`current-user-context.tsx`), `logout` (`auth-login.ts`), `can` (`principal.ts`), `useLocation`/`Outlet` (`@tanstack/react-router`), Toaster, ConfirmModal.
- Produces: `AppLayout` (default export) — компонент layout-роута.

- [ ] **Step 1: `user-menu.tsx` (порт)**

Порт `src/auth/presentation/user-menu.tsx`: `next/link` → обычные `<a href>` (роутов ещё нет, Ф3 заменит на `<Link>`); logout `fetch(...)` → `logout()` из `auth-login`. Разметку/классы сохранить.

```tsx
import { useState } from "react";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { logout as doLogout } from "@/auth/infrastructure/auth-login";

export default function UserMenu() {
  const p = useCurrentUser();
  const [open, setOpen] = useState(false);
  if (!p) return null;

  const initials = (p.username || p.email).slice(0, 2).toUpperCase();
  const showConsole = can(p, "users:read") || can(p, "roles:read");

  async function logout() {
    await doLogout(); // POST /api/auth/logout + clearToken
    window.location.assign("/login"); // hard nav wipes the query cache too
  }

  return (
    <div className="fixed right-4 top-4 z-50">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-tour="user-menu"
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/50 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70">
        {initials}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-white/15 bg-[#0c0d10]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-white">{p.username}</p>
              <p className="truncate text-xs text-neutral-400">{p.email}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {p.roleSlugs.map((r) => (
                  <span key={r} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">{r}</span>
                ))}
              </p>
            </div>
            <div className="my-1 h-px bg-white/10" />
            {showConsole ? (
              <a href="/admin/users" onClick={() => setOpen(false)} role="menuitem"
                className="block rounded-md px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10">Console</a>
            ) : null}
            <a href="/account" onClick={() => setOpen(false)} role="menuitem"
              className="block rounded-md px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10">Account</a>
            <button type="button" onClick={logout} role="menuitem"
              className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-red-200 transition-colors hover:bg-red-500/15">Log out</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: `app-layout.tsx`**

```tsx
import { Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/auth/application/me-query";
import { CurrentUserProvider } from "@/auth/presentation/current-user-context";
import UserMenu from "@/app-shell/user-menu";
import Toaster from "@/shared/presentation/toast/toaster";
import ConfirmModal from "@/shared/presentation/confirm/confirm-modal";

export default function AppLayout() {
  const { data: me } = useQuery(meQuery);
  const { pathname } = useLocation();
  return (
    <CurrentUserProvider value={me ?? null}>
      {me ? <UserMenu /> : null}
      {/* keyed by pathname so the page-fade CSS animation replays per navigation */}
      <div key={pathname} className="page-fade">
        <Outlet />
      </div>
      <Toaster />
      <ConfirmModal />
    </CurrentUserProvider>
  );
}
```

- [ ] **Step 3: Билд проходит**

Run: `cd frontend && yarn build:spa`
Expected: успех (компоненты валидны; подключение в дерево — Task 5).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app-shell
git commit -m "feat(spa/phase2): AppLayout + ported UserMenu (query-fed principal)"
```

---

## Task 5: защищённый layout-route + home, переписать router

**Files:**
- Create: `frontend/src/routes/layout.tsx`, `frontend/src/routes/home.tsx`
- Modify: `frontend/src/routes/login.tsx` (убрать `indexRoute`)
- Modify (rewrite tree): `frontend/src/routes/router.tsx`

**Interfaces:**
- Consumes: `rootRoute`, `loginRoute`, `AppLayout`, `requireAuth`, `queryClient`.
- Produces: дерево `root → [loginRoute, authedLayout → [homeRoute]]`; `router` с `context: { queryClient }`.

- [ ] **Step 1: Убрать `indexRoute` из `login.tsx`**

Удалить экспорт `indexRoute` (весь блок `export const indexRoute = createRoute({... path:"/" ... redirect ...})`). Оставить `safeNext` и `loginRoute`.

- [ ] **Step 2: `layout.tsx` — pathless authed layout route**

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import { requireAuth } from "@/routes/guard";
import AppLayout from "@/app-shell/app-layout";

// Pathless (id-only) parent for every authenticated route. Its beforeLoad gates
// the whole subtree; AppLayout renders the shared chrome around <Outlet/>.
export const authedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: AppLayout,
});
```

- [ ] **Step 3: `home.tsx` — защищённый placeholder**

```tsx
import { createRoute } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { useCurrentUser } from "@/auth/presentation/current-user-context";

function Home() {
  const me = useCurrentUser();
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] p-10 text-white">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Andrey · 3D Platform</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Signed in{me ? ` as ${me.username}` : "…"}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">Ф2 placeholder — the real home grid lands in Ф3.</p>
    </main>
  );
}

export const homeRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/",
  component: Home,
});
```

- [ ] **Step 4: `router.tsx` — context + новое дерево**

```tsx
import { createRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { rootRoute } from "@/routes/root";
import { loginRoute } from "@/routes/login";
import { authedLayoutRoute } from "@/routes/layout";
import { homeRoute } from "@/routes/home";
import { queryClient } from "@/shared/infrastructure/query/query-client";

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([homeRoute]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface RouterContext {
    queryClient: QueryClient;
  }
}
```

- [ ] **Step 5: Билд проходит**

Run: `cd frontend && yarn build:spa`
Expected: успех, без `next/*` в бандле.

- [ ] **Step 6: Полный прогон vitest**

Run: `cd frontend && yarn test:spa`
Expected: PASS — 14 тестов (Ф1: 12 + guard: 2).

- [ ] **Step 7: End-to-end (CDP, локальный стек)**

Поднять локальный backend (`docker compose up -d gateway`; креды `admin`/`change-me-now`), `yarn dev:spa`, затем headless-CDP:
1. **Без токена:** `localStorage.clear()`, перейти на `/` → гард редиректит на `/login?next=%2F`.
2. **Логин:** заполнить форму (`admin`/`change-me-now`), submit → токен в сторе → `assign("/")` → теперь `/` рендерит home «Signed in as admin», справа сверху — аватар UserMenu.
3. **Logout:** открыть меню (клик по аватару) → «Log out» → `POST /api/auth/logout` → `localStorage["andrey.token"]` очищен → страница на `/login`.

Проверяемые факты (через `Runtime.evaluate`): после логина `location.pathname==="/"` и текст содержит «Signed in as admin»; после logout `localStorage.getItem("andrey.token")===null` и `location.pathname==="/login"`. `JS_ERRORS: none`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routes/layout.tsx frontend/src/routes/home.tsx frontend/src/routes/login.tsx frontend/src/routes/router.tsx
git commit -m "feat(spa/phase2): authed layout route + guard + protected home"
```

---

## Self-Review

- **Покрытие спека (Ф2):** приватный гард (Task 3), браузерный current-user через `meQuery`+`getMe` без server-only (Task 2), TanStack Query provider (Task 1), общий layout/nav (Task 4), защищённый home взамен Ф1-редиректа (Task 5). Переход — `page-fade` CSS (обоснованное отклонение от «motion-обёртки»: кодовая база сознательно выбрала CSS ради offline-стойкости). ✓
- **Плейсхолдеры:** нет TBD; код приведён целиком. ✓
- **Тип-консистентность:** `requireAuth(pathname)` (Task 3) ← `beforeLoad` (Task 5); `meQuery` (Task 2) ← `useQuery` (Task 4); `queryClient` (Task 1) ← `main.tsx` (Task 1) и `router context` (Task 5); `logout` из `auth-login` (Ф1). ✓
- **server-only ловушка:** нигде не импортим `auth/application/current-user.ts`; используем `getMe` (браузер-safe) + `meQuery`. ✓
- **200-строчный кап:** все файлы сфокусированы (< 200). ✓

## Отложено (за пределами Ф2)

- `<a href>` в UserMenu → типизированный `<Link>` при появлении `/account`,`/admin/*` (Ф3).
- Loader'ы `ensureQueryData` через `context.queryClient` — Ф3.
- sw-register/PWA — Ф4.
