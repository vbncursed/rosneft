# Ф3-account: `/account` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести страницу аккаунта `/account` (смена пароля, 2FA, passkeys). Переключить ссылку «Account» в UserMenu с `<a>` на TanStack `<Link>`.

**Architecture:** Все секции аккаунта (`ChangePasswordForm`, `TwoFactorSection`, `PasskeysSection`, `RecoveryCodes`) — **без next-импортов**, переиспользуются как есть. Роут `/account` под `authedLayoutRoute` (auth-guard уже даёт редирект на /login). Компонент берёт принципала из `useCurrentUser()` (контекст AppLayout). `next/link` → `<Link>`, `getCurrentUser`+`redirect` не нужны (гард слоя + контекст).

**Tech Stack:** TanStack Router (`createRoute`, `Link`), `useCurrentUser`, existing account sections.

## Global Constraints

- Hard cap 200 строк/файл. Бренд «Andrey». Alias `@/*`. Ветка `spa`.
- Гейты: `yarn build:spa` + `yarn test:spa` + `yarn lint`.
- next-freeness: grep бандла И dev-оптимизатор.

## Предпосылки (обнаружено при планировании)

- `src/app/account/page.tsx` (RSC): `getCurrentUser()` (→ `if(!p) redirect("/login")`), `next/link` (← Back to site), рендерит header (`p.username`,`p.email`) + `ChangePasswordForm` + `TwoFactorSection initiallyEnabled={p.totpEnabled}` + `PasskeysSection`.
- `src/auth/presentation/account/{change-password-form,two-factor-section,passkeys-section,recovery-codes}.tsx` — **без next-импортов**, гейтвеи `auth-gateway`/`passkey-gateway` браузерные. Переиспользуются напрямую.
- UserMenu (`app-shell/user-menu.tsx`, Ф2): `<a href="/account">Account</a>` (заглушка; роут появится здесь) и `<a href="/admin/users">Console</a>` (остаётся `<a>` — admin ещё не перенесён).
- Passkey-регистрация origin-bound: на реальном web-домене работает; на localhost dev / Electron клик «add passkey» может падать (RP-origin) — это окружение, не код.

## Вне области

- admin (`/admin/*`) — следующий под-план (Console-ссылка пока `<a>`).

## Структура файлов

```
frontend/src/
  routes/account.tsx            # /account
  app-shell/user-menu.tsx       # Account <a> → <Link>
  routes/router.tsx             # + accountRoute
```

---

## Task 1: роут `/account` + Account-ссылка на Link + wire

**Files:**
- Create: `frontend/src/routes/account.tsx`
- Modify: `frontend/src/app-shell/user-menu.tsx`
- Modify: `frontend/src/routes/router.tsx`

- [ ] **Step 1: `account.tsx`**

```tsx
import { createRoute, Link } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import ChangePasswordForm from "@/auth/presentation/account/change-password-form";
import TwoFactorSection from "@/auth/presentation/account/two-factor-section";
import PasskeysSection from "@/auth/presentation/account/passkeys-section";

function Account() {
  const p = useCurrentUser();
  if (!p) return null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16 sm:px-10">
        <header>
          <Link to="/" className="mb-3 inline-block text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">
            ← Back to site
          </Link>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Account</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{p.username}</h1>
          <p className="mt-1 text-sm text-neutral-400">{p.email}</p>
        </header>
        <ChangePasswordForm />
        <TwoFactorSection initiallyEnabled={p.totpEnabled} />
        <PasskeysSection />
      </section>
    </main>
  );
}

export const accountRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/account",
  component: Account,
});
```

- [ ] **Step 2: UserMenu — Account `<a>` → `<Link>`**

В `app-shell/user-menu.tsx`: импортировать `Link` из `@tanstack/react-router`; заменить
```tsx
<a href="/account" onClick={() => setOpen(false)} role="menuitem" className="…">Account</a>
```
на
```tsx
<Link to="/account" onClick={() => setOpen(false)} role="menuitem" className="…">Account</Link>
```
(Console-ссылку `<a href="/admin/users">` НЕ трогать — admin ещё не перенесён.)

- [ ] **Step 3: Подключить в `router.tsx`**

Импортировать `accountRoute`, добавить в `authedLayoutRoute.addChildren([...])`.

- [ ] **Step 4: build + lint**

Run: `cd frontend && yarn build:spa && yarn lint`
Expected: успех (секции аккаунта входят в граф — проверяем, что они браузер-safe), lint чист.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/account.tsx frontend/src/app-shell/user-menu.tsx frontend/src/routes/router.tsx
git commit -m "feat(spa/phase3-account): /account route + UserMenu Account link"
```

---

## Task 2: проверки

- [ ] **Step 1: build + lint + бандл-grep + тесты**

Run:
```bash
cd frontend && yarn build:spa && yarn lint && yarn test:spa && grep -oiE "next/(dynamic|link|navigation|headers|server|font)" dist/assets/*.js | sort -u || echo "no next/* (clean)"
```
Expected: build ок; lint чист; тесты — 25; grep пуст.

- [ ] **Step 2: E2E — механика (локальный стек)**

Стек `docker compose start`, `yarn dev:spa`, CDP: логин (`admin`/`change-me-now`), затем:
1. `/account` → рендер (имя `admin`, секции «Change password», «Two-factor», «Passkeys»/security). `JS_ERRORS: none`.
2. Открыть меню (клик по аватару) → «Account» → SPA-переход на `/account`.
3. `← Back to site` → `/`.
4. Без токена `/account` → `/login` (guard).

Assert: имя/секции присутствуют, пути верны, 0 JS-ошибок. (Passkey-регистрацию НЕ кликаем — origin-bound.)

- [ ] **Step 3: Dev-оптимизатор — нет next/***

`yarn dev:spa`, открыть `/account` в CDP, dev-лог: `next/*` быть не должно.

- [ ] **Step 4: Commit** — проверки код не меняют.

---

## Self-Review

- **Покрытие:** роут + Account-Link + wire (Task 1), проверки (Task 2). ✓
- **Плейсхолдеры:** нет TBD. ✓
- **Тип-консистентность:** `TwoFactorSection initiallyEnabled` берёт `p.totpEnabled`; секции — прежние сигнатуры. ✓
- **next-freeness:** секции без next; grep + dev-оптимизатор (Task 2). ✓
- **Гард:** `/account` под `authedLayoutRoute` (token→/login); `if(!p) return null` пока грузится me. ✓

## Отложено

- Console-ссылка UserMenu (`/admin/users`) → `<Link>` при переносе admin.
