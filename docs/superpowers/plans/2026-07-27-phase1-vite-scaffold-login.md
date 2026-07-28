# Ф1: Vite-скаффолд + token-store + api-client + /login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять Vite-React-SPA рядом с существующим Next (на ветке `spa`), с token-store, браузер-only `api-client` и TanStack Router, где роут `/login` целиком работает end-to-end против gateway (пароль + 2FA).

**Architecture:** Vite становится второй точкой сборки в том же `frontend/` дереве (скрипты `dev:spa`/`build:spa`, Next-скрипты пока живут). Переиспользуем `src/domain|application|infrastructure|shared|auth/domain`. `client.ts` переписывается в браузер-only с тем же публичным интерфейсом. Токен — в `localStorage` за узким модулем `token-store` (позже свап на Tauri secure store). Роутинг — TanStack Router (code-based, один публичный роут). Тесты — Vitest + jsdom.

**Tech Stack:** Vite 7, @vitejs/plugin-react, @tanstack/react-router 1, Vitest 3 + jsdom, React 19, Tailwind v4 (через существующий `postcss.config.mjs` — без новых tailwind-депов).

## Global Constraints

- **Hard cap 200 строк на файл** (ESLint `max-lines`, skipBlankLines+skipComments). Держать новые файлы сфокусированными; при росте — дробить.
- **Бренд в тексте — «Andrey»**, не «Rosneft»/«Роснефть». Lowercase-пути `rosneft`/структура — остаются.
- **Clean Architecture слои:** `domain/` без импортов фреймворка; `presentation/` не импортит `infrastructure/` DTO напрямую; гейтвеи возвращают доменные типы.
- Alias `@/*` → `frontend/src/*`.
- `motion` только из `motion/react`, только в `presentation/`.
- Ветка работы — `spa`. Next (`main`) в проде не трогаем; на `spa` Next может ломаться — это ок, он удаляется в Ф5.
- Env gateway: локальная разработка → `VITE_API_URL=http://localhost:8080` (локальный backend-стек, CORS `*`). Прод/preview-origin `https://api.andrey.vbncursed.fun` — позже.

---

## Предпосылки (обнаружено при планировании)

- `frontend/package.json`: React `19.2.7`, Next `16.2.10`, TS `^6`, `@tailwindcss/postcss` + `tailwindcss` `4.3.2`, ESLint `9.39.5`. Тест-скрипт сейчас `node --test 'src/**/*.test.ts'`.
- `tsconfig.json`: `moduleResolution: bundler`, `paths: {"@/*": ["./src/*"]}`, `jsx: react-jsx`.
- `postcss.config.mjs` уже настроен на `@tailwindcss/postcss` — Vite подхватит автоматически.
- `src/app/globals.css` начинается с `@import "tailwindcss";` и `@theme inline` (использует `--font-plex-sans`/`--font-plex-mono`, которые в Next заданы через `next/font` в `layout.tsx`; в Vite шрифт откатится на дефолт — приемлемо для Ф1, self-host шрифтов позже).
- `src/shared/infrastructure/http/client.ts` — экспортит `httpGet/httpPost/httpPut/httpPatch/httpDelete`, ошибки через `HttpError(status, body, message)` (`http-error.ts`). Текущая версия двойная (сервер+клиент, импортит `next/headers`+`next/navigation`) — **перепишем в браузер-only**.
- Login (Next BFF): `POST /api/auth/login {identifier,password}` → gateway `{token, twoFactorRequired, challengeToken}`; при 2FA — `POST /api/auth/login/2fa {challengeToken, code}` → `{token}`; `POST /api/auth/logout` (Bearer). Форма: `src/auth/presentation/login/login-form.tsx`, страница `src/app/login/page.tsx` (+ `topographic-motif.tsx`).
- `src/auth/application/current-user.ts` помечен `import "server-only"` — **НЕ импортировать из Vite-бандла** в Ф1 (гард в Ф2 сделает браузерный аналог).

## Вне области Ф1

- **Passkey-логин** — отложен (WebAuthn origin-bound на web-домен, скрыт в десктопе; порт при миграции account-раздела). В Ф1 кнопка passkey в форме не рендерится.
- TanStack **Query**, приватный гард, общий layout/nav — это **Ф2**.
- Перенос остальных роутов (viewer, списки, admin) — **Ф3**.
- Удаление Next-файлов, swap скриптов, Tauri — **Ф5**.

---

## Структура файлов (создаётся в Ф1)

```
frontend/
  index.html                              # Vite entry HTML
  vite.config.ts                          # Vite + React plugin + alias + vitest
  src/
    vite-env.d.ts                         # ImportMetaEnv types
    main.tsx                              # монтирует RouterProvider
    routes/
      root.tsx                            # createRootRoute (<Outlet/>)
      login.tsx                           # /login route + search validation
      router.tsx                          # route tree + createRouter + Register
    auth/infrastructure/
      token-store.ts                      # localStorage токен
      token-store.test.ts
      auth-login.ts                       # login / verifyTwoFactor / logout
      auth-login.test.ts
    shared/infrastructure/http/
      client.ts                           # ПЕРЕПИСАН: браузер-only
      client.test.ts
    login/
      login-page.tsx                      # порт app/login/page.tsx (Vite)
      login-form.tsx                      # порт login-form.tsx (SPA-версия)
```

(Порт login кладём в новый `src/login/` контекст, чтобы не конфликтовать с `src/app/login/` Next до Ф5; `topographic-motif.tsx` переиспользуем импортом из `@/auth/presentation/login/topographic-motif` — это чистый presentation-компонент.)

---

## Task 1: Vite-скаффолд — пустое приложение поднимается

**Files:**
- Modify: `frontend/package.json` (deps + scripts)
- Create: `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/vite-env.d.ts`, `frontend/src/main.tsx`, `frontend/.env.development`, `frontend/.env.example`

**Interfaces:**
- Produces: `import.meta.env.VITE_API_URL: string`; alias `@` в Vite; скрипты `dev:spa`/`build:spa`/`preview:spa`/`test:spa`.

- [ ] **Step 1: Установить зависимости**

Run:
```bash
cd frontend && yarn add -D vite@^7 @vitejs/plugin-react@^4 vitest@^3 jsdom@^25 && yarn add @tanstack/react-router@^1
```
Expected: устанавливается без ошибок, `package.json` обновлён.

- [ ] **Step 2: Добавить скрипты в `package.json`**

В блок `"scripts"` добавить (Next-скрипты оставить):
```json
    "dev:spa": "vite",
    "build:spa": "vite build",
    "preview:spa": "vite preview",
    "test:spa": "vitest run"
```

- [ ] **Step 3: `frontend/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Andrey</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `frontend/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 6: Env-файлы**

`frontend/.env.development`:
```
VITE_API_URL=http://localhost:8080
```
`frontend/.env.example`:
```
# Local dev points at the local backend gateway (CORS "*" in local compose).
# Preview/prod use https://api.andrey.vbncursed.fun (set in .env.production).
VITE_API_URL=http://localhost:8080
```

- [ ] **Step 7: Временный `frontend/src/main.tsx` (заменится в Task 5)**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ color: "white", padding: 24 }}>SPA scaffold OK</div>
  </StrictMode>,
);
```

- [ ] **Step 8: Проверить, что dev-сервер поднимается и билд проходит**

Run:
```bash
cd frontend && yarn build:spa
```
Expected: `vite build` завершается успешно, создаётся `dist/index.html`.

- [ ] **Step 9: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/package.json frontend/yarn.lock frontend/vite.config.ts frontend/index.html frontend/src/vite-env.d.ts frontend/src/main.tsx frontend/.env.development frontend/.env.example
git commit -m "feat(spa/phase1): vite scaffold alongside next (dev:spa/build:spa)"
```

---

## Task 2: token-store (TDD)

**Files:**
- Create: `frontend/src/auth/infrastructure/token-store.ts`, `frontend/src/auth/infrastructure/token-store.test.ts`

**Interfaces:**
- Produces: `getToken(): string | null`, `setToken(token: string): void`, `clearToken(): void`.

- [ ] **Step 1: Написать падающий тест**

`frontend/src/auth/infrastructure/token-store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken } from "@/auth/infrastructure/token-store";

describe("token-store", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when no token", () => {
    expect(getToken()).toBeNull();
  });

  it("round-trips a token", () => {
    setToken("abc.def");
    expect(getToken()).toBe("abc.def");
  });

  it("clears the token", () => {
    setToken("abc.def");
    clearToken();
    expect(getToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/token-store.test.ts`
Expected: FAIL (module not found / getToken is not a function).

- [ ] **Step 3: Реализация**

`frontend/src/auth/infrastructure/token-store.ts`:
```ts
// Single boundary for the session token. localStorage today; swap the three
// bodies for a Tauri secure store on tablet without touching callers.
const KEY = "andrey.token";

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/token-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/infrastructure/token-store.ts frontend/src/auth/infrastructure/token-store.test.ts
git commit -m "feat(spa/phase1): token-store (localStorage session token)"
```

---

## Task 3: браузер-only api-client (TDD, переписывает client.ts)

**Files:**
- Modify (rewrite): `frontend/src/shared/infrastructure/http/client.ts`
- Create: `frontend/src/shared/infrastructure/http/client.test.ts`

**Interfaces:**
- Consumes: `getToken`/`clearToken` (Task 2); `HttpError`/`ApiError` (`http-error.ts`); `import.meta.env.VITE_API_URL`.
- Produces (неизменные сигнатуры): `httpGet<T>(path): Promise<T>`, `httpPost<T>(path, body?): Promise<T>`, `httpPut<T>(path, body): Promise<T>`, `httpPatch<T>(path, body): Promise<T>`, `httpDelete(path, body?): Promise<void>`.

- [ ] **Step 1: Написать падающий тест**

`frontend/src/shared/infrastructure/http/client.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { httpGet, httpPost } from "@/shared/infrastructure/http/client";
import { setToken } from "@/auth/infrastructure/token-store";
import { HttpError } from "@/shared/infrastructure/http/http-error";

const API = "http://localhost:8080";

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

describe("api-client", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("prefixes VITE_API_URL and parses JSON", async () => {
    const f = mockFetch(200, { ok: true });
    vi.stubGlobal("fetch", f);
    const r = await httpGet<{ ok: boolean }>("/api/x");
    expect(f).toHaveBeenCalledWith(`${API}/api/x`, expect.anything());
    expect(r).toEqual({ ok: true });
  });

  it("attaches Bearer when a token is present", async () => {
    setToken("tok123");
    const f = mockFetch(200, {});
    vi.stubGlobal("fetch", f);
    await httpGet("/api/x");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("omits Authorization when no token", async () => {
    const f = mockFetch(200, {});
    vi.stubGlobal("fetch", f);
    await httpGet("/api/x");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws HttpError with gateway message on non-2xx", async () => {
    const f = mockFetch(403, { code: "forbidden", message: "nope" });
    vi.stubGlobal("fetch", f);
    await expect(httpPost("/api/x", {})).rejects.toMatchObject({
      constructor: HttpError,
      status: 403,
      message: "nope",
    });
  });

  it("returns undefined for 204", async () => {
    const f = mockFetch(204, undefined);
    vi.stubGlobal("fetch", f);
    const r = await httpGet("/api/x");
    expect(r).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/shared/infrastructure/http/client.test.ts`
Expected: FAIL (текущий client.ts импортит `next/headers` — упадёт на import, либо ассерты не сойдутся).

- [ ] **Step 3: Переписать `client.ts` в браузер-only**

`frontend/src/shared/infrastructure/http/client.ts`:
```ts
import { HttpError, type ApiError } from "@/shared/infrastructure/http/http-error";
import { getToken, clearToken } from "@/auth/infrastructure/token-store";

const API_BASE = import.meta.env.VITE_API_URL;

async function send<T>(path: string, init: RequestInit, parseJson: boolean): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    // 401 = token expired/revoked. Drop it and bounce to /login — unless we're
    // already on /login (a bad-credentials login also 401s; let it surface).
    if (res.status === 401 && !location.pathname.startsWith("/login")) {
      clearToken();
      location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // body not JSON
    }
    const detail = body?.message ?? (body as { error?: string } | null)?.error;
    const fallback =
      res.status === 403
        ? "You don't have permission to do this"
        : res.statusText || `Request failed (${res.status})`;
    throw new HttpError(res.status, body, detail || fallback);
  }
  if (!parseJson || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function httpGet<T>(path: string): Promise<T> {
  return send<T>(path, {}, true);
}

export function httpPost<T>(path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;
  return send<T>(
    path,
    {
      method: "POST",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    },
    true,
  );
}

export function httpPut<T>(path: string, body: unknown): Promise<T> {
  return send<T>(
    path,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    true,
  );
}

export function httpPatch<T>(path: string, body: unknown): Promise<T> {
  return send<T>(
    path,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    true,
  );
}

export function httpDelete(path: string, body?: unknown): Promise<void> {
  const hasBody = body !== undefined;
  return send<void>(
    path,
    {
      method: "DELETE",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    },
    false,
  );
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/shared/infrastructure/http/client.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/infrastructure/http/client.ts frontend/src/shared/infrastructure/http/client.test.ts
git commit -m "feat(spa/phase1): browser-only api-client (token bearer, 401 bounce)"
```

---

## Task 4: login / verifyTwoFactor / logout (TDD)

**Files:**
- Create: `frontend/src/auth/infrastructure/auth-login.ts`, `frontend/src/auth/infrastructure/auth-login.test.ts`

**Interfaces:**
- Consumes: `httpPost` (Task 3), `setToken`/`clearToken` (Task 2).
- Produces:
  - `login(identifier: string, password: string): Promise<{ twoFactorRequired: boolean; challengeToken: string }>` — при `!twoFactorRequired` сохраняет токен.
  - `verifyTwoFactor(challengeToken: string, code: string): Promise<void>` — сохраняет токен.
  - `logout(): Promise<void>` — POST logout (ошибку глотает) + чистит токен.

- [ ] **Step 1: Написать падающий тест**

`frontend/src/auth/infrastructure/auth-login.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { login, verifyTwoFactor, logout } from "@/auth/infrastructure/auth-login";
import { getToken, setToken } from "@/auth/infrastructure/token-store";

function ok(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("auth-login", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("stores token on non-2FA login", async () => {
    vi.stubGlobal("fetch", ok({ token: "t1", twoFactorRequired: false, challengeToken: "" }));
    const r = await login("me", "pw");
    expect(r.twoFactorRequired).toBe(false);
    expect(getToken()).toBe("t1");
  });

  it("does NOT store token when 2FA required, returns challenge", async () => {
    vi.stubGlobal("fetch", ok({ token: "", twoFactorRequired: true, challengeToken: "chal" }));
    const r = await login("me", "pw");
    expect(r).toEqual({ twoFactorRequired: true, challengeToken: "chal" });
    expect(getToken()).toBeNull();
  });

  it("verifyTwoFactor stores token", async () => {
    vi.stubGlobal("fetch", ok({ token: "t2" }));
    await verifyTwoFactor("chal", "123456");
    expect(getToken()).toBe("t2");
  });

  it("logout clears token even if request fails", async () => {
    setToken("t3");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await logout();
    expect(getToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/auth-login.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Реализация**

`frontend/src/auth/infrastructure/auth-login.ts`:
```ts
import { httpPost } from "@/shared/infrastructure/http/client";
import { setToken, clearToken } from "@/auth/infrastructure/token-store";

interface LoginResponse {
  token: string;
  twoFactorRequired: boolean;
  challengeToken: string;
}

// Password login. On a non-2FA success the session token is stored; when 2FA is
// required nothing is stored and the challenge token is returned for step two.
export async function login(
  identifier: string,
  password: string,
): Promise<{ twoFactorRequired: boolean; challengeToken: string }> {
  const r = await httpPost<LoginResponse>("/api/auth/login", { identifier, password });
  if (!r.twoFactorRequired) setToken(r.token);
  return { twoFactorRequired: r.twoFactorRequired, challengeToken: r.challengeToken };
}

// Step two: exchange the TOTP/recovery code + challenge for a session token.
export async function verifyTwoFactor(challengeToken: string, code: string): Promise<void> {
  const r = await httpPost<{ token: string }>("/api/auth/login/2fa", { challengeToken, code });
  setToken(r.token);
}

// Best-effort server logout, then always drop the local token.
export async function logout(): Promise<void> {
  try {
    await httpPost<void>("/api/auth/logout");
  } catch {
    // ignore — clearing the local token is what matters
  }
  clearToken();
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/auth-login.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/infrastructure/auth-login.ts frontend/src/auth/infrastructure/auth-login.test.ts
git commit -m "feat(spa/phase1): auth login/verify2fa/logout against gateway"
```

---

## Task 5: TanStack Router + /login (end-to-end)

**Files:**
- Create: `frontend/src/routes/root.tsx`, `frontend/src/routes/login.tsx`, `frontend/src/routes/router.tsx`
- Create: `frontend/src/login/login-page.tsx`, `frontend/src/login/login-form.tsx`
- Modify (replace): `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `login`/`verifyTwoFactor` (Task 4); `LoginPage`.
- Produces: `router` (экспортируется для `main.tsx`); роут `/login` со `search: { next: string }`.

- [ ] **Step 1: Root route — `frontend/src/routes/root.tsx`**

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: () => <Outlet />,
});
```

- [ ] **Step 2: Login route — `frontend/src/routes/login.tsx`**

```tsx
import { createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import LoginPage from "@/login/login-page";

// Only same-origin relative paths survive as ?next= — reject schemes and
// protocol-relative URLs so login can't redirect off-site.
function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (s: Record<string, unknown>): { next: string } => ({ next: safeNext(s.next) }),
  component: LoginPage,
});

// Ф1: every other path redirects to /login. Real routes arrive in Ф2/Ф3.
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/login", search: { next: "/" } });
  },
});
```

- [ ] **Step 3: Router — `frontend/src/routes/router.tsx`**

```tsx
import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import { loginRoute, indexRoute } from "@/routes/login";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 4: Login form (SPA-порт) — `frontend/src/login/login-form.tsx`**

Порт `src/auth/presentation/login/login-form.tsx` с заменами: `fetch(...)` → `login`/`verifyTwoFactor`; `useSearchParams` → проп `next`; passkey-кнопка удалена (отложена). Разметку/классы Tailwind сохранить дословно.

```tsx
import { useState } from "react";
import PasswordField from "@/shared/presentation/components/password-field";
import OtpInput from "@/shared/presentation/components/otp-input";
import { login, verifyTwoFactor } from "@/auth/infrastructure/auth-login";

export default function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"creds" | "2fa">("creds");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await login(identifier, password);
      if (r.twoFactorRequired) { setChallenge(r.challengeToken); setStep("2fa"); }
      else window.location.assign(next); // hard nav → fresh SPA state with token
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  async function verify(codeVal: string) {
    if (busy || !codeVal) return;
    setBusy(true); setError("");
    try {
      await verifyTwoFactor(challenge, codeVal);
      window.location.assign(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  }

  const inputCls = "mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors duration-200 focus:border-cyan-300/60";
  const label = "block text-xs uppercase tracking-[0.2em] text-neutral-400";

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
        {step === "creds" ? "Sign in" : "Two-factor"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {step === "creds" ? "Welcome back" : "Enter your code"}
      </h1>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      {step === "creds" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submitCreds}>
          <div>
            <label className={label} htmlFor="id">Email or username</label>
            <input id="id" autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputCls} />
          </div>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <button type="submit" disabled={busy || !identifier || !password}
            className="mt-2 cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify(code); }}>
          {recovery ? (
            <div>
              <label className={label} htmlFor="code">Recovery code</label>
              <input id="code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxx-xxxxx"
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-mono text-lg tracking-[0.2em] text-white outline-none focus:border-cyan-300/60" />
            </div>
          ) : (
            <div>
              <p className={label}>Authenticator code</p>
              <div className="mt-2"><OtpInput value={code} onChange={setCode} onComplete={verify} autoFocus /></div>
            </div>
          )}
          <button type="submit" disabled={busy || (recovery ? !code : code.length !== 6)}
            className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-cyan-200 disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-cyan-200">
            {recovery ? "Use authenticator code instead" : "Use a recovery code instead"}
          </button>
          <button type="button" onClick={() => { setStep("creds"); setCode(""); setError(""); setRecovery(false); }}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-cyan-200">← Back</button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Login page — `frontend/src/login/login-page.tsx`**

Порт `src/app/login/page.tsx`; `next` берём из валидированного search роута через `getRouteApi("/login")` — так избегаем циклического импорта `login.tsx` ↔ `login-page.tsx`.

```tsx
import { getRouteApi } from "@tanstack/react-router";
import LoginForm from "@/login/login-form";
import TopographicMotif from "@/auth/presentation/login/topographic-motif";

const route = getRouteApi("/login");

export default function LoginPage() {
  const { next } = route.useSearch();
  return (
    <main className="grid min-h-screen grid-cols-1 bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white md:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-white/10 md:flex md:flex-col md:justify-end md:p-12">
        <TopographicMotif />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Andrey · 3D Platform</p>
          <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-tight tracking-tight">
            Territories &amp; models, rendered with precision.
          </h2>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <LoginForm next={next} />
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Заменить `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/routes/router";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 7: Билд проходит**

Run: `cd frontend && yarn build:spa`
Expected: успешный `vite build`; в бандл не попадают `next/*` импорты (если попал — значит что-то из Vite-графа тянет Next-файл; убрать импорт).

- [ ] **Step 8: End-to-end проверка `/login` (ручная, локальный backend)**

Поднять локальный backend-стек (gateway на `127.0.0.1:8080`, CORS `*`), затем:
```bash
cd frontend && yarn dev:spa
```
Открыть `http://localhost:5173/` → редиректит на `/login`. Ввести валидные локальные креды (bootstrap-админ локального стека) → при отсутствии 2FA попадаем на `/` (который снова редиректит на `/login` в Ф1 — это ожидаемо, реальный home в Ф3; главное: `localStorage["andrey.token"]` установлен, а сетевой запрос `POST http://localhost:8080/api/auth/login` вернул 200). Проверить в DevTools:
- Network: `POST /api/auth/login` → 200.
- Application → Local Storage: ключ `andrey.token` присутствует.

Если локальный стек не поднят — как временный вариант можно указать `VITE_API_URL=https://api.andrey.vbncursed.fun` и **временно** добавить `http://localhost:5173` в прод `GATEWAY_ALLOWED_ORIGINS` (иначе CORS заблокирует); после проверки убрать. Предпочтителен локальный стек.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/routes frontend/src/login frontend/src/main.tsx
git commit -m "feat(spa/phase1): tanstack router + working /login end-to-end"
```

---

## Self-Review

- **Покрытие спека (Ф1):** Vite-скаффолд (Task 1), token-store (Task 2), браузер-only api-client (Task 3), login-функции (Task 4), TanStack Router + `/login` end-to-end (Task 5). ✓
- **Плейсхолдеры:** нет TBD; весь код приведён целиком. ✓
- **Тип-консистентность:** `getToken/setToken/clearToken` (Task 2) используются в Task 3/4 с теми же именами; `httpGet/httpPost` сигнатуры неизменны; `login` возвращает `{twoFactorRequired, challengeToken}` и так же читается в форме (Task 5). ✓
- **200-строчный кап:** каждый новый файл сфокусирован и заведомо < 200 строк (форма ~120). ✓
- **server-only ловушка:** Ф1 не импортит `current-user.ts`; `login-page` тянет только `topographic-motif` (чистый presentation) + Task 4/2. ✓

## Отложено (за пределами Ф1, зафиксировано)

- Passkey-логин (кнопка убрана) — вернуть при переносе account-раздела.
- Шрифты IBM Plex (`--font-plex-*`) — сейчас дефолтный sans; self-host позже (Ф4-полировка).
- Preview-origin деплой + добавление его origin в CORS — при настройке preview.
- Next `eslint-config-next` остаётся до Ф5; новые файлы держать под max-lines:200.
