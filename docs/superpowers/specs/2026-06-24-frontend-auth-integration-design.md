# Frontend Auth Integration — Design

**Date:** 2026-06-24
**Scope:** Wire the existing `auth-service` into the Next.js frontend: a login screen (with 2FA), an authenticated app shell, and an `/admin` console (Users · Roles & Permissions · Content). Includes a focused **backend extension** for owner-scoped users (`created_by`).

## 1. Goals

- Gate the whole app behind login (the gateway now requires `Authorization: Bearer` on every `/api/*`).
- A beautiful, on-brand login page (password + optional TOTP 2FA challenge).
- A single permission-gated `/admin` console: **Users**, **Roles & Permissions**, **Content** (admin-only).
- Per-user actions (create/edit-roles/freeze/soft-delete/restore) and full role/permission management.
- **Owner scoping:** admin sees all users; owner sees only users they created.
- Account self-service: change password, enable/disable 2FA.

## 2. Auth plumbing & routing

- **Token storage:** opaque session token in an `httpOnly, Secure, SameSite=Lax` cookie named `session`. Never exposed to JS (XSS-safe).
- **BFF proxy:** replace the bare `next.config` `/api/*` rewrite with a Route Handler `app/api/[...path]/route.ts` that proxies every method to the gateway and injects `Authorization: Bearer <session cookie>`. Streams request/response bodies (uploads, SSE pass through). On a `401` from the gateway it clears the cookie.
- **RSC fetches:** the server HTTP client reads the `session` cookie via `next/headers` and sends the same `Authorization` header, so server components (scene bundle, etc.) authenticate.
- **Login:** `/login` route. Route Handler `POST`s `/api/auth/login`; on `twoFactorRequired` it returns the challenge to a second step (TOTP / recovery code → `/api/auth/login/2fa`). On success it sets the `session` cookie and redirects to `?next=` (or `/`).
- **Middleware** (`middleware.ts`): no `session` cookie → redirect to `/login?next=<path>`. `/login` and static assets are the only public matchers.
- **Logout:** Route Handler → `POST /api/auth/logout` + clear cookie → redirect `/login`.
- **Client 401 handling:** the client HTTP wrapper, on `401`, redirects to `/login` (covers token revoked/expired mid-session).

## 3. Login page (`/login`)

On-brand with the existing kit (dark glass, cyan accent, Geist, extreme-tracking uppercase eyebrows). Boldness spent in one signature element; the rest disciplined.

**Layout (desktop):** two columns, full height.
- **Left panel** (hidden < `md`): `bg-[radial-gradient(circle_at_top,#1c252f,#0b0d10,#060708)]` + a **topographic contour SVG motif** (territories = terrain) at low opacity, cyan-tinted, slow drift; freezes under `prefers-reduced-motion`. Brand eyebrow `text-xs uppercase tracking-[0.36em] text-cyan-300/80`, a large Geist line, one line of copy.
- **Right card:** `mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur`. Eyebrow `SIGN IN`, heading `text-2xl font-semibold tracking-tight`, identifier field (email or username), password field with show/hide, inline error (`bg-red-500/15 border-red-300/40 text-red-200`), pill submit `bg-white text-black rounded-full hover:bg-cyan-200` with `Signing in…` loading state.
- **2FA step:** same card, eyebrow `TWO-FACTOR`, heading `Enter your code`, 6-digit input (Geist Mono, `tracking-[0.3em]`, tabular-nums), "use a recovery code" toggle, `Verify` button, ← back.
- **Mobile:** single column — card centered on the gradient, brand eyebrow on top. Focus rings `focus-visible:ring-cyan-300`, touch targets ≥ 44px.

The login page loads no three.js (SVG-only motif) to keep LCP fast.

## 4. Console (`/admin`)

Shell: left sidebar (sections gated by permission) + main content; sidebar foot shows the user card (username, email, role chips, **Log out**). Default section: **Users**.

### Users (`users:read`)
Table: username, email, role chips, status badge (`active` emerald / `frozen` amber / `deleted` neutral), 2FA on/off, `⋯` actions. Filters: status + `include deleted`.
- `[+ New user]` → drawer/modal: email, username, password, multi-select roles → `POST /api/auth/users`.
- Actions by permission: **Edit roles** (`users:write` → `PATCH /users/{id}`), **Freeze/Unfreeze** (`users:freeze`), **Soft-delete/Restore** (`users:delete`). Destructive ops go through the existing `ConfirmModal`.
- Backend guards (self-target, last-admin) surface as friendly toasts (gateway maps to 422/403).
- **Scope:** the list reflects whatever `ListUsers` returns — all for admin, own for owner (see §5). Subheader: "All users" (admin) / "Showing users you created" (owner).

### Roles & Permissions (`roles:manage`)
Role list (slug, title, `system` badge, permission count) → role detail with a **permission matrix** (checkboxes grouped by resource: territory/model/placement/panorama/upload/users/roles/permissions), catalog from `GET /api/auth/permissions`, save via `PUT /roles/{slug}/permissions`. Create role (`POST /roles`), rename (`PATCH`), delete (`DELETE`, system roles locked).

### Content (admin-only)
A hub with **Territories** and **Models** cards (counts) linking to the existing `/territories` and `/models` grids (which already do create/delete/placement). Additionally, the New/Delete affordances on those existing pages become **permission-gated** by the current user's permissions.

## 5. Owner-scoping (backend extension)

The current `auth-service` has no user-ownership concept; this adds it.

- **Migration:** `ALTER TABLE users ADD COLUMN created_by UUID NULL REFERENCES users(id);` New permission **`users:read_all`** (see/manage all users, not only own), seeded and granted to the **admin** role only (admin already gets every permission; owner does not list it → owner is scoped).
- **Actor threading:** the session token is passed to `CreateUser`, `ListUsers`, `GetUser`, `UpdateUser`, `RestoreUser` (same pattern already used by `FreezeUser`/`SoftDeleteUser`). The service resolves the acting user + their permissions from it.
- **CreateUser:** sets `created_by = actor`.
- **ListUsers:** actor has `users:read_all` → all rows; else `WHERE created_by = actor`.
- **Ownership guard on mutations:** for an actor lacking `users:read_all`, `get/update/freeze/unfreeze/soft-delete/restore` are allowed only when the target's `created_by = actor`; otherwise return `not found` (don't leak existence by id).
- Gateway: pass the bearer token through to these RPCs (the HTTP routes are already permission-gated by `users:*`).

## 6. Account, header, self-service

- **User menu** (avatar with initials, top-right) on the catalog, the console, and inside the viewer overlay. Menu: **Console** (shown if the user has `users:read` / `roles:read` / any content permission), **Account**, **Log out**.
- **Account:** change password (`POST /api/auth/me/password`); **2FA**: `POST /2fa/setup` → `{secret, otpauthUrl}` → render a QR from `otpauthUrl` (+ secret for manual entry) → enter code → `POST /2fa/enable` → show recovery codes **once**; disable with a current code (`POST /2fa/disable`).
- QR is a lightweight client render from `otpauthUrl`; fallback is manual secret entry (no heavy dependency).

## 7. Frontend code architecture

New bounded context **`auth/`** (DDD layers, ≤200 lines/file):
- **infrastructure/** `auth-gateway.ts` — login/logout/me/users/roles/permissions, DTO→domain via the regenerated `dto.ts` (`yarn openapi:generate`, since `openapi.yaml` now covers `/api/auth/*`).
- **domain/** `principal` (current user: id, email, username, roles, permissions), `user`, `role`, `permission`.
- **application/** hooks: `use-login`, `use-current-user`, `use-users-admin`, `use-roles-admin`, `use-2fa`; a `can(permission)` helper.
- **presentation/** login, console (sidebar + Users/Roles/Content sections), user-menu, account, 2FA flow.
- **BFF / routing:** `app/api/[...path]/route.ts`, `app/login/page.tsx`, `app/admin/**`, `middleware.ts`, login/logout route handlers, a server `getCurrentUser()` (cookie → `GET /api/auth/me`) for RSC gating.
- **Permission provider:** the server `me` is passed into a client context so existing pages (territories/models) hide New/Delete by permission.

## 8. Out of scope / deferred

- Self-service registration (admin-created only, per the backend).
- A "downloader" role / `*:download` permissions.
- System-settings admin section (no backend).
- The Overview/dashboard (explicitly dropped).
- Email/SMS 2FA (TOTP only).
