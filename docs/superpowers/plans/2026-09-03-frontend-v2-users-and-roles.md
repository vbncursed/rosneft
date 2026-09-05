# frontend-v2 Users and Roles — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/console/users` and `/console/roles` render the finished `UsersPage` and `RolesPage` against the live gateway — people grouped by role with freeze/delete/restore/require-2FA and role editing, roles with an editable permission matrix, rename, create — inside a console shell that every later screen reuses.

**Architecture:** The pages are not touched except where a prop had no honest data behind it. Each screen gets a container hook in `pages/<screen>/model/` that owns queries, mutations and UI state, pure functions beside it for every decision (grouping, filtering, stats), and a `*-screen.tsx` that maps the hook onto the page plus its dialogs. Gateways live in `entities/<entity>/api/` with DTO→model mappers and `queryOptions`. The console chrome, the toast host and the per-screen permission gate arrive first because every screen needs them.

**Tech Stack:** Vite 8, React 19, TypeScript 7 (`tsc -b`), TanStack Router + Query, vitest + @testing-library/react, React Cosmos, Tailwind 4, oxlint.

**Spec:** `docs/superpowers/specs/2026-09-02-frontend-v2-gateway-wiring-design.md` (step 2 of its Order of work). Survey notes that informed the rulings below: `/private/tmp/claude-501/-Users-vbncursed-programming-rosneft/a7a29e0c-8fc1-409e-a981-d13cf3b48d0d/scratchpad/survey-users-roles.md` (may be gone in a later session; the rulings are self-contained).

## Global Constraints

- **yarn, never npm.** All commands run from `frontend-v2/`.
- **`yarn lint` is `tsc -b --noEmit && oxlint`. Keep the `-b`.**
- **`src/architecture.spec.ts` fails the build, not warns:** every non-barrel, non-fixture source file needs a sibling `*.spec.ts(x)`; every slice that renders JSX needs a `*.fixture.tsx` somewhere in it; layer imports point inward only (`shared → entities → features → widgets → pages → app`); cross-slice imports land exactly on the slice's `index.ts`; nothing sits loose in a layer root. `src/fixtures.spec.tsx` renders every fixture.
- **Wiring with no decision joins `EXEMPT_MODULES`** (`frontend-v2/exempt-modules.ts`); anything with a decision is a pure function with its own spec.
- **A page draws no chrome** and takes everything through props; the route applies `widgets/console-layout`.
- **"Loading" and "unavailable" are different states**; an inspector is absent until its data is loaded; an empty list answers with a sentence.
- **Never a confident wrong value:** `null` means "could not find out" and renders as "—"/"unknown", never as "No"/0.
- **A control with no endpoint behind it is not rendered.**
- **Accessible names are unique on screen**; state is never carried on colour alone.
- **No `Authorization` header; `X-CSRF-Token` on mutations only** — both already in `shared/api/client.ts`. **403 → the standing sentence** "You don't have permission to do this" (already `HttpError`'s fallback).
- **Coverage thresholds** (vite.config.ts): statements 90, branches 85, functions 90, lines 90 — `yarn test:coverage` must stay above them.
- **A parallel session may work in this clone.** Stage by path: `git add frontend-v2` (plus `docs/superpowers/plans/...` where a task says so) — never `git add -A`; check `git diff --cached --name-only`; never stage `.claude/settings.json`.
- **Commit with `--no-verify` and say so** — the pre-commit hook runs the Go gate and these tasks touch no Go. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Local accounts for live checks: Root `admin` / `change-me-now`; Company Owners `cotest` and `cotest2` / `Passw0rd!2026`. Gateway on `localhost:8080` (`docker compose ps` from the repo root); v2 dev server `yarn dev` on 3001 proxies `/api`.

## Rulings (decisions the survey forced)

Each is a decision made for this plan; the spec is silent on it. The executor follows them; the reviewer checks against them.

1. **`Person.territories` and `Person.lastSeen` become optional.** No endpoint names a user's territories short of Root-only per-territory calls, and nothing exposes sessions. The card's footer draws only what it has; the container passes neither.
2. **Inspector details** are `2FA`, `passkey`, `2FA required` — the three facts `AuthUser` carries. No created / last seen / sessions rows.
3. **Reset password is not rendered.** `onResetPassword` becomes optional on `PersonInspector` and `UsersPage`; the button draws only when handed.
4. **Require 2FA is wired** to `POST …/2fa/require` and `…/2fa/unrequire`. `User` gains `totpRequired: boolean` (the DTO always carries it). The button reads "Require 2FA" or "Stop requiring 2FA" from that flag.
5. **No owner toggle, no role delete, no territories block in the inspector.** None is drawn in the mocks. Deferred, not built.
6. **People are grouped by role:** "Owners" first (`isOwner`), then one group per role in the order `GET /api/auth/roles` returns, then "No role". A person appears once — owners under Owners, everyone else under the first of their roles that exists.
7. **Filters:** `role:<slug>`, `status:active|frozen|deleted`, `2fa:on|off|unknown`, `passkey:on|off|unknown`; free text matches username or email, case-insensitively. Unknown keys are ignored. Roles: `kind:system|custom`, `grants:<slug>` (`users.write` and `users:write` both accepted); free text matches slug or title.
8. **The users list is fetched with `includeDeleted=true`** and deleted accounts are shown (the card already dims them); `status:` narrows.
9. **`canManage` on Users is `users:write`.** Freeze/delete/2FA rely on the gateway's own per-route checks; a 403 reaches the operator as a toast. The inspector hides Freeze for a deleted account and turns Delete into Restore.
10. **`Role` gains `permissionSlugs: string[]`; `users` becomes `number | null`** (null when the users list is not readable by this actor, rendered "— users"); `grants` is `permissionSlugs.length`; `updated` is `"immutable"` for system roles and `""` for custom ones (nothing in the contract dates a role).
11. **Role save is two calls when both changed:** `PUT …/permissions` then `PATCH …` for the title, awaited in sequence. Not atomic; the toast says which failed through the gateway's message.
12. **`grantable` mirrors the backend's no-escalation rule:** an owner may grant everything, anyone else exactly the permissions they hold. `grantableSlugs(me, permissions)` in `shared/session`.
13. **Role cards:** tone `warn` for system, `ok` for custom, `accent` for the selected one; tag `system` / `editing` (accent, selected custom role with unsaved changes); chips = the first three of: `group.*` when the role holds a whole group, else `group.action` per held permission, `locked` tone when the viewer may not grant it; faces = up to four usernames holding the role, only when users are readable.
14. **Create role** is a dialog: title plus "Start from" (empty set, or copy an existing role's permissions). The new role is selected on success.
15. **Toasts:** a module store `shared/lib/notify.ts` (`notify.success/error/info/warning`) and a `widgets/toaster` host mounted by the console shell. Every mutation toasts its outcome.
16. **Screen gate:** each `/console/<screen>` route's loader redirects to `/console` when the principal cannot open it (`screenAllowed` in `guard.ts`). `/console`'s own landing logic already guarantees no loop.
17. **Navigation:** `ConsoleNav` keeps its `<a href>`; the shell intercepts clicks on console hrefs and hands them to the router so a click does not reload the page. Back link goes to `/` (the viewer has no v2).
18. **`viewer.roleTitle`** is the first role's title, else "Root" for an owner, else "—".
19. **Loading / unavailable:** the screen shows skeleton rows while the list is pending and a bad-toned callout with the gateway's message when it failed; the page renders only with data.

---

### Task 1: Console shell, toaster, screen gate

**Files:**
- Create: `frontend-v2/src/shared/lib/notify.ts`, `frontend-v2/src/shared/lib/notify.spec.ts`
- Modify: `frontend-v2/src/shared/api/http-error.ts`, `frontend-v2/src/shared/api/http-error.spec.ts`, `frontend-v2/src/shared/api/index.ts`
- Create: `frontend-v2/src/widgets/toaster/index.ts`, `frontend-v2/src/widgets/toaster/ui/toaster.tsx`, `frontend-v2/src/widgets/toaster/ui/toaster.spec.tsx`, `frontend-v2/src/widgets/toaster/toaster.fixture.tsx`
- Modify: `frontend-v2/src/app/router/guard.ts`, `frontend-v2/src/app/router/guard.spec.ts`
- Create: `frontend-v2/src/app/router/console-shell.tsx`
- Modify: `frontend-v2/src/app/router/routes.tsx`, `frontend-v2/exempt-modules.ts`

**Interfaces:**
- Consumes: `meQuery` (`@/entities/user`), `ConsoleLayout` (`@/widgets/console-layout`), `ConsoleNavItem` (`@/widgets/console-nav`), `Toast` (`@/shared/ui/toast`), `Principal`/`can` (`@/shared/session`).
- Produces: `notify.{success,error,info,warning}(message)`, `useNotices()`, `dismiss(id)`, `clearNotices()`; `messageOf(err, fallback?)` from `@/shared/api`; `screenAllowed(me, path)`, `consoleNav(me)`, `activeSection(pathname)`, `viewerOf(me)`, `isConsoleHref(href)` from `guard.ts`; `ConsoleShell` as `consoleRoute.component`; a `gate(path)` loader on every screen route.

- [ ] **Step 1: The notice store — failing spec**

`src/shared/lib/notify.spec.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, dismiss, notify, useNotices } from "./notify";

beforeEach(() => {
  vi.useFakeTimers();
  clearNotices();
});
afterEach(() => vi.useRealTimers());

describe("notify", () => {
  it("stacks the newest notice on top and dismisses it after five seconds", () => {
    const { result } = renderHook(() => useNotices());

    act(() => {
      notify.success("Saved");
      notify.error("Failed");
    });
    expect(result.current.map((n) => n.message)).toEqual(["Failed", "Saved"]);
    expect(result.current[0].tone).toBe("error");

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toEqual([]);
  });

  it("dismisses one notice by id and leaves the rest", () => {
    const { result } = renderHook(() => useNotices());
    let id = 0;
    act(() => {
      id = notify.info("First");
      notify.warning("Second");
    });

    act(() => dismiss(id));

    expect(result.current.map((n) => n.message)).toEqual(["Second"]);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `yarn vitest run src/shared/lib/notify.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: The store**

`src/shared/lib/notify.ts`:

```ts
import { useSyncExternalStore } from "react";
import type { ToastTone } from "@/shared/ui/toast";

export type Notice = { id: number; tone: ToastTone; message: string };

// Long enough to read a short sentence, short enough that a burst of them
// never lingers.
const AUTO_DISMISS_MS = 5000;

// Module-level on purpose: a mutation deep in a container hook reports
// through here without threading a context down, and the host is one
// component near the root.
let notices: readonly Notice[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const emit = () => listeners.forEach((listen) => listen());

function push(tone: ToastTone, message: string): number {
  const id = nextId++;
  // Newest first, so the host draws it on top.
  notices = [{ id, tone, message }, ...notices];
  emit();
  setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  return id;
}

export function dismiss(id: number): void {
  const next = notices.filter((n) => n.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit();
}

/** Test seam: a spec that pushed notices must not leak them into the next. */
export function clearNotices(): void {
  notices = [];
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// `notices` is replaced, never mutated, so the same reference means "unchanged"
// — what useSyncExternalStore needs from a snapshot.
const getSnapshot = () => notices;

export function useNotices(): readonly Notice[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const notify = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  warning: (message: string) => push("warning", message),
};
```

Run the spec — expected PASS.

- [ ] **Step 4: `messageOf` beside `HttpError`**

Append to `src/shared/api/http-error.ts`:

```ts
const GENERIC_ERROR = "Something went wrong. Try again.";

/**
 * What to tell the operator about a failure. The gateway's own message when
 * there is one — it names the actual refusal ("last admin", "self-target") —
 * and a plain sentence otherwise, since "Failed to fetch" helps nobody.
 */
export const messageOf = (err: unknown, fallback = GENERIC_ERROR): string =>
  err instanceof HttpError ? err.message : fallback;
```

Export it from `src/shared/api/index.ts` beside `HttpError`. Add to `http-error.spec.ts`:

```ts
  it("prefers the gateway's message and falls back for anything else", () => {
    expect(messageOf(new HttpError(422, null, "Cannot freeze the last admin."))).toBe(
      "Cannot freeze the last admin.",
    );
    expect(messageOf(new TypeError("Failed to fetch"))).toBe("Something went wrong. Try again.");
    expect(messageOf(null, "Export failed")).toBe("Export failed");
  });
```

Replace the private `GENERIC_ERROR`/`messageOf` in `src/pages/login/model/use-login.ts` with the import from `@/shared/api` (behaviour identical; its spec stays green).

- [ ] **Step 5: The toaster widget — spec, component, fixture, barrel**

`src/widgets/toaster/ui/toaster.spec.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { clearNotices, notify } from "@/shared/lib/notify";
import { Toaster } from "./toaster";

beforeEach(() => clearNotices());

describe("Toaster", () => {
  it("renders nothing until something is reported", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a reported failure as an alert and lets the reader dismiss it", async () => {
    render(<Toaster />);
    act(() => {
      notify.error("Cannot freeze the last admin.");
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Cannot freeze the last admin.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

`src/widgets/toaster/ui/toaster.tsx`:

```tsx
import { dismiss, useNotices } from "@/shared/lib/notify";
import { Toast } from "@/shared/ui/toast";

/**
 * The one place notices are drawn. Mounted by the console shell; the login
 * screen keeps its own single Toast because it has no shell.
 */
export function Toaster() {
  const notices = useNotices();
  if (notices.length === 0) return null;
  return (
    // pointer-events-none lets clicks reach the page between cards; each card
    // turns them back on for its own dismiss button.
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {notices.map((notice) => (
        <Toast
          key={notice.id}
          tone={notice.tone}
          onDismiss={() => dismiss(notice.id)}
          className="pointer-events-auto shadow-elevation"
        >
          {notice.message}
        </Toast>
      ))}
    </div>
  );
}
```

`src/widgets/toaster/index.ts`: `export { Toaster } from "./ui/toaster";`

`src/widgets/toaster/toaster.fixture.tsx`:

```tsx
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Toaster } from "./ui/toaster";

export default (
  <div className="flex gap-2 p-6">
    <Button onClick={() => notify.success("Permissions saved")}>Success</Button>
    <Button onClick={() => notify.error("Cannot freeze the last admin.")}>Error</Button>
    <Toaster />
  </div>
);
```

Run: `yarn vitest run src/widgets/toaster` — expected PASS.

- [ ] **Step 6: The guard grows the screen table — failing spec first**

Add to `src/app/router/guard.spec.ts` (keep the existing tests; `PRINCIPAL`-style helpers already exist there — reuse the file's own way of building a principal):

```ts
describe("screenAllowed", () => {
  it("opens a screen to the grant that names it and to an owner", () => {
    expect(screenAllowed(principal({ permissions: ["roles:read"] }), "/console/roles")).toBe(true);
    expect(screenAllowed(principal({ permissions: ["roles:read"] }), "/console/users")).toBe(false);
    expect(screenAllowed(principal({ isOwner: true, permissions: [] }), "/console/metrics")).toBe(true);
  });
});

describe("consoleNav", () => {
  // Every screen is listed so the reader learns what the console has; the
  // ones they cannot open are marked rather than hidden.
  it("lists every screen in navigation order and disables the closed ones", () => {
    const items = consoleNav(principal({ permissions: ["audit:read"] }));
    expect(items.map((i) => i.key)).toEqual(["users", "roles", "content", "access", "audit", "metrics"]);
    expect(items.find((i) => i.key === "audit")?.disabled).toBeUndefined();
    expect(items.find((i) => i.key === "users")?.disabled).toBe(true);
    expect(items.find((i) => i.key === "users")?.href).toBe("/console/users");
  });
});

describe("activeSection", () => {
  it("names the section from the path, deep links included", () => {
    expect(activeSection("/console/roles")).toBe("roles");
    expect(activeSection("/console/audit/123")).toBe("audit");
    expect(activeSection("/console")).toBe("");
  });
});

describe("viewerOf", () => {
  it("shows the first role's title, Root for an owner without roles, and a dash otherwise", () => {
    expect(viewerOf(principal({ roleSlugs: ["admin"], roleTitles: { admin: "Company Owner" } })).roleTitle).toBe("Company Owner");
    expect(viewerOf(principal({ isOwner: true, roleSlugs: [] })).roleTitle).toBe("Root");
    expect(viewerOf(principal({ roleSlugs: [] })).roleTitle).toBe("—");
  });
});

describe("isConsoleHref", () => {
  it("claims console paths and nothing else", () => {
    expect(isConsoleHref("/console/users")).toBe(true);
    expect(isConsoleHref("/")).toBe(false);
    expect(isConsoleHref("https://example.com/console")).toBe(false);
  });
});
```

(`principal(over)` — if the spec file has no such helper, add one that spreads over a complete `Principal` literal, like `me-query.spec.ts`'s `PRINCIPAL`.)

- [ ] **Step 7: Implement in `guard.ts`**

Replace the `ConsolePath` / `LANDINGS` / `consoleLanding` block with:

```ts
import type { ConsoleNavItem } from "@/widgets/console-nav";

/** Every screen the console has, in the order the navigation lists them. */
export type ConsolePath =
  | "/console/users"
  | "/console/roles"
  | "/console/content"
  | "/console/access"
  | "/console/audit"
  | "/console/metrics";

type Screen = {
  path: ConsolePath;
  key: string;
  label: string;
  allowed: (p: Principal) => boolean;
};

// What each screen needs before it is worth landing on. `can` answers true for
// anything an owner asks about, so an owner stops at the first entry and a
// non-owner falls through to whatever they actually hold — which is how
// Metrics, owner-only and last, is nobody's landing page and answers nobody a
// 403. Content mirrors the production console: either write grant opens it.
const SCREENS: readonly Screen[] = [
  { path: "/console/users", key: "users", label: "Users", allowed: (p) => can(p, "users:read") },
  { path: "/console/roles", key: "roles", label: "Roles & Permissions", allowed: (p) => can(p, "roles:read") },
  {
    path: "/console/content",
    key: "content",
    label: "Content",
    allowed: (p) => can(p, "territory:write") || can(p, "model:write"),
  },
  { path: "/console/access", key: "access", label: "Territory access", allowed: (p) => p.isOwner },
  { path: "/console/audit", key: "audit", label: "Audit journal", allowed: (p) => can(p, "audit:read") },
  { path: "/console/metrics", key: "metrics", label: "Metrics", allowed: (p) => p.isOwner },
];

/**
 * Where `/console` alone sends a caller: the first screen their permissions
 * actually open. (…keep the existing doc comment…)
 */
export function consoleLanding(me: Principal): ConsolePath | null {
  return SCREENS.find((s) => s.allowed(me))?.path ?? null;
}

/**
 * The per-screen gate. The console gate is an OR over several grants, so a
 * roles-only administrator gets past it and would reach /console/users, where
 * every request 403s. Each screen route's loader asks this and bounces to
 * /console, whose landing logic never picks a screen that fails it.
 */
export function screenAllowed(me: Principal, path: ConsolePath): boolean {
  return SCREENS.find((s) => s.path === path)?.allowed(me) ?? false;
}

/** The navigation column: every screen, the closed ones marked, never hidden. */
export function consoleNav(me: Principal): ConsoleNavItem[] {
  return SCREENS.map((s) => ({
    key: s.key,
    label: s.label,
    href: s.path,
    ...(s.allowed(me) ? {} : { disabled: true }),
  }));
}

/** "/console/audit/123" → "audit"; "/console" → "". */
export const activeSection = (pathname: string): string =>
  SCREENS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))?.key ?? "";

/** The identity line at the foot of the sidebar. */
export function viewerOf(me: Principal): { username: string; roleTitle: string } {
  const first = me.roleSlugs[0];
  const roleTitle = first ? (me.roleTitles[first] ?? first) : me.isOwner ? "Root" : "—";
  return { username: me.username, roleTitle };
}

/** A same-app console link the shell may hand to the router instead of the browser. */
export const isConsoleHref = (href: string): boolean => href.startsWith("/console");
```

Run: `yarn vitest run src/app/router/guard.spec.ts` — expected PASS.

- [ ] **Step 8: The shell**

`src/app/router/console-shell.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { meQuery } from "@/entities/user";
import { ConsoleLayout } from "@/widgets/console-layout";
import { Toaster } from "@/widgets/toaster";
import { activeSection, consoleNav, isConsoleHref, viewerOf } from "./guard";

/**
 * The chrome around every console screen, applied once here so no page draws
 * it. The principal is already in the cache — consoleRoute's loader awaited
 * it — so the null branch is a stale-cache edge, not a loading state.
 *
 * Clicks on console links are handed to the router: ConsoleNav renders plain
 * anchors so it stays router-agnostic and browsable in Cosmos, and a full
 * reload per click would throw away the query cache for nothing.
 */
export function ConsoleShell() {
  const { data: me } = useQuery(meQuery);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!me) return null;

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href || !isConsoleHref(href) || event.metaKey || event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    void navigate({ href });
  };

  return (
    // role="presentation": the wrapper exists for the click delegate only and
    // adds nothing to the accessibility tree.
    <div role="presentation" onClickCapture={onClickCapture}>
      <ConsoleLayout
        items={consoleNav(me)}
        active={activeSection(pathname)}
        backHref="/"
        viewer={viewerOf(me)}
      >
        <Outlet />
      </ConsoleLayout>
      <Toaster />
    </div>
  );
}
```

Add `"src/app/router/console-shell.tsx"` to `EXEMPT_MODULES` with the comment `// wiring; every decision is in guard.ts`.

- [ ] **Step 9: Routes use the shell and the gate**

In `routes.tsx`: import `ConsoleShell` and `screenAllowed, type ConsolePath`; set `consoleRoute`'s `component: ConsoleShell` (replacing `Outlet` there — keep the `Outlet` import only if still used). Add above the screen routes:

```tsx
// One loader for every screen: the console gate is an OR over several grants,
// so a screen must ask for its own. /console's landing never picks a screen
// that fails this, so the bounce cannot loop.
const gate =
  (path: ConsolePath) =>
  async ({ context }: { context: { queryClient: QueryClient } }) => {
    if (!screenAllowed(await context.queryClient.ensureQueryData(meQuery), path)) {
      throw redirect({ to: "/console" });
    }
  };
```

and give each of the six screen routes `loader: gate("/console/<screen>")`. Leave their placeholder components for now — Tasks 5 and 6 replace two of them.

- [ ] **Step 10: Lint, suite, live**

`yarn lint && yarn test`. Then `yarn dev`, sign in as `admin`, confirm: the sidebar renders with all six items, the active one highlighted; clicking "Roles & Permissions" changes the URL without a full reload (the Network tab shows no document request); signing in as `cotest` and opening `/console/metrics` by hand bounces to `/console` and lands on `/console/users`. Stop the dev server.

- [ ] **Step 11: Commit**

```bash
git add frontend-v2 docs/superpowers/plans/2026-09-03-frontend-v2-users-and-roles.md
git diff --cached --name-only
git commit --no-verify -m "feat(frontend-v2): the console shell, a toast host and a per-screen gate

Every /console/* route now renders inside ConsoleLayout, applied once by
ConsoleShell. The screen table in guard.ts grew from a landing list into
the thing that also gates each route's loader (screenAllowed), builds the
navigation (consoleNav) and names the active section — the console gate is
an OR over several grants, so a roles-only administrator could reach
/console/users and watch it 403.

shared/lib/notify is a module-level notice store; widgets/toaster draws it.
messageOf moves beside HttpError so every container reports failures the
same way the login screen does.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The users admin gateway

**Files:**
- Modify: `frontend-v2/src/entities/user/model/user.ts` (+ every `User` literal `yarn lint` then flags — fixtures and specs under `entities/user`, `widgets/people-groups`, `widgets/person-inspector`, `widgets/users-table`, `pages/users`)
- Create: `frontend-v2/src/entities/user/api/to-user.ts`, `to-user.spec.ts`, `users-gateway.ts`, `users-gateway.spec.ts`, `users-query.ts`, `users-query.spec.ts`
- Modify: `frontend-v2/src/entities/user/index.ts`

**Interfaces:**
- Consumes: `httpGet/httpPost/httpPatch/httpDelete` (`@/shared/api`), `components["schemas"]["AuthUser"]` (`@/shared/api/dto`).
- Produces: `User.totpRequired: boolean`; `toUser(dto): User`; `listUsers(): Promise<User[]>`; `type NewUser = { email; username; password; roleSlugs }`; `createUser(input: NewUser): Promise<User>`; `setUserRoles(id, roleSlugs): Promise<User>`; `freezeUser(id)`, `unfreezeUser(id)`, `restoreUser(id)`: `Promise<User>`; `deleteUser(id): Promise<void>`; `setTwoFactorRequired(id, required: boolean): Promise<User>`; `usersQuery` (key `["users"]`).

- [ ] **Step 1: `User.totpRequired`**

In `user.ts` add after `passkeyEnabled`:

```ts
  /** Policy, not fact: the account must carry a second factor. Always known. */
  totpRequired: boolean;
```

Run `yarn lint`; add `totpRequired: false` to every `User` literal it flags (fixtures' `make()` helpers, spec fixtures). Do not change what any of them asserts.

- [ ] **Step 2: Mapper spec, then mapper**

`to-user.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toUser } from "./to-user";

const dto = (over: Record<string, unknown> = {}) => ({
  id: "u-1",
  email: "a@example.com",
  username: "a.ivanova",
  status: "active",
  roleSlugs: ["admin"],
  permissions: ["users:read"],
  isOwner: false,
  totpRequired: false,
  ...over,
});

describe("toUser", () => {
  it("maps an absent factor to unknown, never to off", () => {
    const u = toUser(dto() as never);
    expect(u.totpEnabled).toBeNull();
    expect(u.passkeyEnabled).toBeNull();
  });

  it("keeps a present factor and the requirement flag", () => {
    const u = toUser(dto({ totpEnabled: false, passkeyEnabled: true, totpRequired: true }) as never);
    expect(u.totpEnabled).toBe(false);
    expect(u.passkeyEnabled).toBe(true);
    expect(u.totpRequired).toBe(true);
  });

  it("tolerates a missing title map", () => {
    expect(toUser(dto() as never).roleTitles).toEqual({});
  });
});
```

`to-user.ts`:

```ts
import type { components } from "@/shared/api/dto";
import type { User } from "../model/user";

type AuthUserDto = components["schemas"]["AuthUser"];

// The admin list item is the same wire shape as the principal, minus what
// only the signed-in caller needs (permissions, tours, csrf). `?? null` for
// the two tri-state factors: absent means the owning service did not answer.
export function toUser(d: AuthUserDto): User {
  return {
    id: d.id,
    username: d.username,
    email: d.email,
    status: d.status,
    totpEnabled: d.totpEnabled ?? null,
    passkeyEnabled: d.passkeyEnabled ?? null,
    totpRequired: d.totpRequired,
    roleSlugs: d.roleSlugs,
    roleTitles: d.roleTitles ?? {},
    isOwner: d.isOwner,
  };
}
```

- [ ] **Step 3: Gateway spec, then gateway**

`users-gateway.spec.ts` — stub `fetch` the way `auth-gateway.spec.ts` does, and set a CSRF token so mutations do not go looking for one:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  createUser,
  deleteUser,
  freezeUser,
  listUsers,
  setTwoFactorRequired,
  setUserRoles,
} from "./users-gateway";

const user = { id: "u-1", email: "a@x", username: "a", status: "active", roleSlugs: [], permissions: [], isOwner: false, totpRequired: false };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(json(user));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("users gateway", () => {
  // Deleted accounts stay visible: the card dims them and status: narrows.
  it("lists everyone, deleted included, as domain users", async () => {
    fetchMock.mockResolvedValueOnce(json([user]));
    const users = await listUsers();
    expect(request().url).toBe("/api/auth/users?includeDeleted=true");
    expect(users[0].totpEnabled).toBeNull();
  });

  it("creates with the whole input and replaces roles with a PATCH", async () => {
    await createUser({ email: "b@x", username: "b", password: "pw", roleSlugs: ["guest"] });
    expect(request()).toEqual({ url: "/api/auth/users", method: "POST", body: { email: "b@x", username: "b", password: "pw", roleSlugs: ["guest"] } });

    await setUserRoles("u 1", ["admin"]);
    expect(request(1)).toEqual({ url: "/api/auth/users/u%201", method: "PATCH", body: { roleSlugs: ["admin"] } });
  });

  it("posts the state changes to their own routes", async () => {
    await freezeUser("u-1");
    await setTwoFactorRequired("u-1", true);
    await setTwoFactorRequired("u-1", false);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteUser("u-1");
    expect(fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      "POST /api/auth/users/u-1/freeze",
      "POST /api/auth/users/u-1/2fa/require",
      "POST /api/auth/users/u-1/2fa/unrequire",
      "DELETE /api/auth/users/u-1",
    ]);
  });
});
```

`users-gateway.ts`:

```ts
import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { User } from "../model/user";
import { toUser } from "./to-user";

type AuthUserDto = components["schemas"]["AuthUser"];

const at = (id: string) => `/api/auth/users/${encodeURIComponent(id)}`;

export type NewUser = { email: string; username: string; password: string; roleSlugs: string[] };

// Deleted accounts included: the screen shows them dimmed and lets status:
// narrow, rather than hiding a restore target behind a switch.
export const listUsers = async (): Promise<User[]> =>
  (await httpGet<AuthUserDto[]>("/api/auth/users?includeDeleted=true")).map(toUser);

export const createUser = async (input: NewUser): Promise<User> =>
  toUser(await httpPost<AuthUserDto>("/api/auth/users", input));

/** Replaces the whole set — the gateway's PATCH semantics for roleSlugs. */
export const setUserRoles = async (id: string, roleSlugs: string[]): Promise<User> =>
  toUser(await httpPatch<AuthUserDto>(at(id), { roleSlugs }));

export const freezeUser = async (id: string): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/freeze`));

export const unfreezeUser = async (id: string): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/unfreeze`));

export const deleteUser = (id: string): Promise<void> => httpDelete(at(id));

export const restoreUser = async (id: string): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/restore`));

// Idempotent on the gateway; requiring twice is a 200. Unrequire does not
// disable an enrolled factor.
export const setTwoFactorRequired = async (id: string, required: boolean): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/2fa/${required ? "require" : "unrequire"}`));
```

- [ ] **Step 4: Query options**

`users-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { listUsers } from "./users-gateway";

/** The people list, one cache entry; every mutation invalidates this key. */
export const usersQuery = queryOptions({ queryKey: ["users"], queryFn: listUsers });
```

`users-query.spec.ts` — mirror `me-query.spec.ts`: the key is `["users"]`, the function delegates to `listUsers` (mock `./users-gateway`).

- [ ] **Step 5: Barrel, lint, suite, commit**

Add to `entities/user/index.ts`:

```ts
export {
  createUser,
  deleteUser,
  freezeUser,
  listUsers,
  restoreUser,
  setTwoFactorRequired,
  setUserRoles,
  unfreezeUser,
  type NewUser,
} from "./api/users-gateway";
export { usersQuery } from "./api/users-query";
```

`yarn lint && yarn test`. Commit (`--no-verify`, stage `frontend-v2` only):

`feat(frontend-v2): the users admin gateway, and totpRequired on User` — body: what the gateway covers, that deleted accounts are listed on purpose, that `User.totpRequired` is always known and why it is not tri-state, the `--no-verify` note, the trailer.

---

### Task 3: Roles and permissions gateways, `grantableSlugs`

**Files:**
- Modify: `frontend-v2/src/entities/role/model/role.ts`, `role.spec.ts` (+ every `Role` literal `yarn lint` flags: `entities/role/ui/*`, `widgets/role-groups`, `widgets/role-inspector`, `pages/roles`)
- Create: `frontend-v2/src/entities/role/api/to-role.ts`, `to-role.spec.ts`, `roles-gateway.ts`, `roles-gateway.spec.ts`, `roles-query.ts`, `roles-query.spec.ts`
- Create: `frontend-v2/src/entities/permission/api/permissions-gateway.ts`, `permissions-gateway.spec.ts`, `permissions-query.ts`, `permissions-query.spec.ts`
- Modify: `frontend-v2/src/entities/role/index.ts`, `frontend-v2/src/entities/permission/index.ts`
- Modify: `frontend-v2/src/shared/session/principal.ts`, `principal.spec.ts`, `frontend-v2/src/shared/session/index.ts`

**Interfaces:**
- Produces: `Role = { slug; title; kind; permissionSlugs: string[]; grants: number; users: number | null; updated: string }`; `usersLabel(role)` → `"— users"` for null; `toRole(dto): Role` (users null); `listRoles()`, `createRole(title, permissionSlugs)`, `renameRole(slug, title)`, `setRolePermissions(slug, permissionSlugs)`: `Promise<Role>`; `rolesQuery` (key `["roles"]`); `listPermissions(): Promise<Permission[]>`, `permissionsQuery` (key `["permissions"]`); `grantableSlugs(me, permissions): Set<string>`.

- [ ] **Step 1: The model**

In `role.ts`:

```ts
export type Role = {
  slug: string;
  title: string;
  kind: "system" | "custom";
  /** What it grants, as the gateway names them ("users:write"). */
  permissionSlugs: string[];
  /** How many permissions of `total` this role grants. */
  grants: number;
  /** People holding it — null when the people list is not readable by this actor. */
  users: number | null;
  /** Free-form, e.g. "immutable"; empty when nothing dates the role. */
  updated: string;
};
```

and

```ts
/** "1 user" / "11 users" / "— users" when the count could not be read. */
export const usersLabel = (role: Role) =>
  role.users === null ? "— users" : `${role.users} ${role.users === 1 ? "user" : "users"}`;
```

Add to `role.spec.ts`: `expect(usersLabel(role({ users: null }))).toBe("— users");`. Run `yarn lint`; add `permissionSlugs: []` (or the slugs the fixture already implies) to every `Role` literal it flags without changing what any test asserts.

- [ ] **Step 2: `toRole` — spec, then mapper**

`to-role.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toRole } from "./to-role";

describe("toRole", () => {
  it("counts grants, marks system roles immutable, and leaves the people count unknown", () => {
    const r = toRole({ slug: "admin", title: "Company Owner", isSystem: true, permissionSlugs: ["users:read", "users:write"] });
    expect(r).toEqual({
      slug: "admin", title: "Company Owner", kind: "system",
      permissionSlugs: ["users:read", "users:write"], grants: 2, users: null, updated: "immutable",
    });
  });

  it("dates nothing on a custom role and tolerates absent fields", () => {
    const r = toRole({ slug: "ops", title: "Ops", isSystem: false });
    expect(r.kind).toBe("custom");
    expect(r.permissionSlugs).toEqual([]);
    expect(r.updated).toBe("");
  });
});
```

`to-role.ts`:

```ts
import type { components } from "@/shared/api/dto";
import type { Role } from "../model/role";

type AuthRoleDto = components["schemas"]["AuthRole"];

// `users` is null here on purpose: the contract has no role→people count, so
// the Roles screen derives it from the people list when it may read one. A
// system role is defined by migrations, which is what "immutable" says.
export function toRole(d: AuthRoleDto): Role {
  const permissionSlugs = d.permissionSlugs ?? [];
  const kind = d.isSystem ? "system" : "custom";
  return {
    slug: d.slug ?? "",
    title: d.title ?? "",
    kind,
    permissionSlugs,
    grants: permissionSlugs.length,
    users: null,
    updated: kind === "system" ? "immutable" : "",
  };
}
```

- [ ] **Step 3: Roles gateway and query**

`roles-gateway.ts`:

```ts
import { httpGet, httpPatch, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Role } from "../model/role";
import { toRole } from "./to-role";

type AuthRoleDto = components["schemas"]["AuthRole"];

const at = (slug: string) => `/api/auth/roles/${encodeURIComponent(slug)}`;

export const listRoles = async (): Promise<Role[]> =>
  (await httpGet<AuthRoleDto[]>("/api/auth/roles")).map(toRole);

/** The gateway derives the slug from the title; nothing here invents one. */
export const createRole = async (title: string, permissionSlugs: string[]): Promise<Role> =>
  toRole(await httpPost<AuthRoleDto>("/api/auth/roles", { title, permissionSlugs }));

export const renameRole = async (slug: string, title: string): Promise<Role> =>
  toRole(await httpPatch<AuthRoleDto>(at(slug), { title }));

/** Replaces the whole set. */
export const setRolePermissions = async (slug: string, permissionSlugs: string[]): Promise<Role> =>
  toRole(await httpPut<AuthRoleDto>(`${at(slug)}/permissions`, { permissionSlugs }));
```

`roles-gateway.spec.ts` — same fetch-stub shape as Task 2: list maps to domain roles; create posts `{title, permissionSlugs}` to `/api/auth/roles`; rename PATCHes `/api/auth/roles/<slug>` with `{title}`; set-permissions PUTs `…/permissions` with `{permissionSlugs}`; a slug with a space is URL-encoded.

`roles-query.ts`: `export const rolesQuery = queryOptions({ queryKey: ["roles"], queryFn: listRoles });` with a spec like `users-query.spec.ts`.

- [ ] **Step 4: Permissions gateway and query**

`permissions-gateway.ts`:

```ts
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Permission } from "../model/permission";

type AuthPermissionDto = components["schemas"]["AuthPermission"];

// An empty description is "none", which the model spells as absent.
export const listPermissions = async (): Promise<Permission[]> =>
  (await httpGet<AuthPermissionDto[]>("/api/auth/permissions")).map((d) => ({
    slug: d.slug ?? "",
    ...(d.description ? { description: d.description } : {}),
  }));
```

`permissions-gateway.spec.ts`: hits `/api/auth/permissions`; an empty description becomes an absent key. `permissions-query.ts`: key `["permissions"]`, plus spec.

- [ ] **Step 5: `grantableSlugs`**

In `shared/session/principal.ts` append:

```ts
/**
 * Which permissions this principal may hand out. Mirrors the backend's
 * no-escalation rule so the matrix never offers a grant the gateway would
 * refuse: an owner may grant anything, everyone else exactly what they hold.
 */
export const grantableSlugs = (
  me: Principal | null,
  permissions: readonly { slug: string }[],
): Set<string> => new Set(permissions.map((p) => p.slug).filter((slug) => can(me, slug)));
```

Export from `shared/session/index.ts`. Spec in `principal.spec.ts`: an owner with no permissions gets every slug; a holder of `users:read` gets `users:read` and not `users:write`; `null` gets an empty set.

- [ ] **Step 6: Barrels, lint, suite, commit**

`entities/role/index.ts` adds `createRole, listRoles, renameRole, setRolePermissions` and `rolesQuery`; `entities/permission/index.ts` adds `listPermissions` and `permissionsQuery`. `yarn lint && yarn test`. Commit (`--no-verify`):

`feat(frontend-v2): roles and permissions gateways, a people count that can be unknown` — body: the Role model change and why `users` is nullable, `toRole`'s "immutable", `grantableSlugs` mirroring the backend, the `--no-verify` note, the trailer.

---

### Task 4: The dialogs — confirm, create user, add role, create role

**Files:**
- Create: `frontend-v2/src/shared/ui/confirm-dialog/{index.ts,confirm-dialog.tsx,confirm-dialog.spec.tsx,confirm-dialog.fixture.tsx}`
- Create: `frontend-v2/src/features/create-user/{index.ts,create-user.fixture.tsx,ui/create-user-dialog.tsx,ui/create-user-dialog.spec.tsx}`
- Create: `frontend-v2/src/features/role-assign/ui/add-role-dialog.tsx`, `add-role-dialog.spec.tsx`; modify `features/role-assign/index.ts` and `role-assign.fixture.tsx`
- Create: `frontend-v2/src/features/create-role/{index.ts,create-role.fixture.tsx,ui/create-role-dialog.tsx,ui/create-role-dialog.spec.tsx}`

**Interfaces:**
- Consumes: `Modal`, `Button`, `TextField`, `PasswordField`, `Checkbox`, `Dropdown` from `@/shared/ui/*`; `RoleChip` from `@/features/role-assign`; `NewUser` from `@/entities/user`.
- Produces:
  - `ConfirmDialogProps = { open; title: string; description: ReactNode; confirmLabel: string; tone?: "default" | "danger"; busy?: boolean; onConfirm(); onCancel() }`
  - `CreateUserDialogProps = { open; roles: RoleChip[]; busy?: boolean; onClose(); onCreate(input: NewUser) }`
  - `AddRoleDialogProps = { open; options: RoleChip[]; busy?: boolean; onClose(); onAdd(slug: string) }`
  - `CreateRoleDialogProps = { open; startFrom: { slug: string; title: string; permissionSlugs: string[] }[]; busy?: boolean; onClose(); onCreate(input: { title: string; permissionSlugs: string[] }) }`

- [ ] **Step 1: ConfirmDialog**

Spec (`confirm-dialog.spec.tsx`): renders title and description in a dialog; the confirm button carries `confirmLabel` and calls `onConfirm`; Cancel calls `onCancel`; `busy` disables Cancel and shows the confirm button loading; `tone="danger"` gives the confirm button the danger variant (assert via the accessible name plus `aria-busy`/disabled — not class names, except one variant assertion is allowed).

```tsx
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  /** Names the action exactly as the button that opened this did. */
  confirmLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A yes/no question with one irreversible answer, built on the native dialog. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      tone={tone}
      overline={tone === "danger" ? "Confirm · danger" : "Confirm"}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
```

Fixture: a button that opens a danger confirm "Delete d.smirnov?".

- [ ] **Step 2: CreateUserDialog**

Spec: typing email, username and password enables "Create user"; ticking a role includes its slug; submitting calls `onCreate` with `{ email, username, password, roleSlugs }`; the button stays disabled while any of the three is empty; `busy` shows it loading.

```tsx
import { useState, type FormEvent } from "react";
import type { NewUser } from "@/entities/user";
import type { RoleChip } from "@/features/role-assign";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Modal } from "@/shared/ui/modal";
import { PasswordField } from "@/shared/ui/password-field";
import { TextField } from "@/shared/ui/text-field";

export type CreateUserDialogProps = {
  open: boolean;
  /** Every role that exists, for the initial grant. */
  roles: RoleChip[];
  busy?: boolean;
  onClose: () => void;
  onCreate: (input: NewUser) => void;
};

const FORM_ID = "create-user";

/**
 * The fields the gateway's CreateUserRequest takes and nothing more. Mount it
 * only while open — its state resets by unmounting, not by an effect.
 */
export function CreateUserDialog({ open, roles, busy = false, onClose, onCreate }: CreateUserDialogProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const complete = email.trim() !== "" && username.trim() !== "" && password !== "";

  const toggle = (slug: string) =>
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    onCreate({ email: email.trim(), username: username.trim(), password, roleSlugs: picked });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="New account"
      title="Create user"
      description="They sign in with this password and can change it themselves."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!complete} loading={busy}>
            Create user
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <TextField label="Username" mono autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} />
        <PasswordField label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        {roles.length > 0 ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Roles</legend>
            {roles.map((role) => (
              <Checkbox key={role.slug} label={role.title} checked={picked.includes(role.slug)} onChange={() => toggle(role.slug)} disabled={busy} />
            ))}
          </fieldset>
        ) : null}
      </form>
    </Modal>
  );
}
```

If `Button` does not forward `type`/`form` to its `<button>`, check `shared/ui/button/button.tsx` — it spreads rest props in the login form (`type="submit"`), so it does. Barrel: `export { CreateUserDialog, type CreateUserDialogProps } from "./ui/create-user-dialog";`. Fixture: opens the dialog with three roles.

- [ ] **Step 3: AddRoleDialog (in `features/role-assign`)**

Spec: with options, a dropdown offers them and "Add role" calls `onAdd` with the picked slug (defaults to the first); with no options, the body says every role is already granted and there is no Add button.

```tsx
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import type { RoleChip } from "./role-chips";

export type AddRoleDialogProps = {
  open: boolean;
  /** Roles the person does not hold yet. */
  options: RoleChip[];
  busy?: boolean;
  onClose: () => void;
  onAdd: (slug: string) => void;
};

/** One pick from what is left. Mount only while open so the pick resets. */
export function AddRoleDialog({ open, options, busy = false, onClose, onAdd }: AddRoleDialogProps) {
  const [slug, setSlug] = useState(options[0]?.slug ?? "");
  const exhausted = options.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Roles"
      title="Add role"
      description={exhausted ? "Every role is already granted." : "The person gains everything the role grants."}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {exhausted ? null : (
            <Button variant="primary" onClick={() => onAdd(slug)} loading={busy}>
              Add role
            </Button>
          )}
        </>
      }
    >
      {exhausted ? null : (
        <Dropdown
          label="Role"
          options={options.map((r) => ({ value: r.slug, label: r.title }))}
          value={slug}
          onChange={setSlug}
          disabled={busy}
        />
      )}
    </Modal>
  );
}
```

Add to the barrel and to `role-assign.fixture.tsx` (a second fixture entry opening the dialog with two options, and one with none).

- [ ] **Step 4: CreateRoleDialog**

Spec: title enables "Create role"; "Start from" defaults to an empty set and copies a chosen role's slugs; submit calls `onCreate({ title, permissionSlugs })`.

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { TextField } from "@/shared/ui/text-field";

export type StartFrom = { slug: string; title: string; permissionSlugs: string[] };

export type CreateRoleDialogProps = {
  open: boolean;
  /** Roles whose set may be copied as the starting point. */
  startFrom: StartFrom[];
  busy?: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; permissionSlugs: string[] }) => void;
};

const EMPTY = "__empty__";
const FORM_ID = "create-role";

/** What the page's dashed card promises: start from Guest, or duplicate a set. */
export function CreateRoleDialog({ open, startFrom, busy = false, onClose, onCreate }: CreateRoleDialogProps) {
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(EMPTY);
  const complete = title.trim() !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    const source = startFrom.find((r) => r.slug === from);
    onCreate({ title: title.trim(), permissionSlugs: source?.permissionSlugs ?? [] });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="New role"
      title="Create role"
      description="The slug is derived from the title. Permissions can be edited right after."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!complete} loading={busy}>
            Create role
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        <Dropdown
          label="Start from"
          options={[{ value: EMPTY, label: "Empty set" }, ...startFrom.map((r) => ({ value: r.slug, label: r.title, hint: `${r.permissionSlugs.length}` }))]}
          value={from}
          onChange={setFrom}
          disabled={busy}
        />
      </form>
    </Modal>
  );
}
```

Barrel: `export { CreateRoleDialog, type CreateRoleDialogProps, type StartFrom } from "./ui/create-role-dialog";`. Fixture: open, with two roles to start from.

- [ ] **Step 5: Lint, suite, commit**

`yarn lint && yarn test` (architecture and fixtures specs must accept the four new slices). Commit (`--no-verify`): `feat(frontend-v2): confirm, create-user, add-role and create-role dialogs` — body: each is the gateway's request shape and nothing more; state resets by unmounting; the `--no-verify` note; the trailer.

---

### Task 5: The Users screen

**Files:**
- Modify: `frontend-v2/src/widgets/people-groups/ui/people-groups.tsx` (`Person.territories?`, `lastSeen?`), `frontend-v2/src/entities/user/ui/person-card.tsx` (+ spec: footer absent when neither is given)
- Modify: `frontend-v2/src/widgets/person-inspector/ui/person-inspector.tsx` (+ spec), `frontend-v2/src/pages/users/ui/users-page.tsx` (+ spec: `onResetPassword` optional)
- Create: `frontend-v2/src/pages/users/model/people.ts`, `people.spec.ts`, `use-users.ts`, `use-users.spec.tsx`
- Create: `frontend-v2/src/pages/users/ui/users-screen.tsx`, `users-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/users/index.ts`, `frontend-v2/src/app/router/routes.tsx`

**Interfaces:**
- Consumes: Task 2's gateway and `usersQuery`; Task 3's `rolesQuery`; Task 1's `notify`, `messageOf`; Task 4's dialogs; `meQuery`, `can`.
- Produces: `matchesPerson(user, query)`, `groupPeople(users, roles): PeopleGroup[]`, `coverageOf(users)`, `statsOf(users, roles)`, `inspectorDetails(user)`; `useUsers()`; `UsersScreen` rendered by `/console/users`.

- [ ] **Step 1: Widgets learn the honest shapes**

`people-groups.tsx`: `territories?: string; lastSeen?: string;` on `Person` (doc: "absent when nothing can say"). `person-card.tsx`: the same two props optional; the footer `<div>` renders only when at least one is present, each `<span>` only when its value is. Spec: a card with neither has no footer text; a card with `lastSeen` only shows it.

`person-inspector.tsx`:
- `onResetPassword?: () => void`; the "Reset password" button renders only when it is given (the `flex gap-2` row keeps "Require 2FA" alone otherwise).
- The 2FA button reads `user.totpRequired ? "Stop requiring 2FA" : "Require 2FA"`.
- Freeze/Unfreeze renders only when `user.status !== "deleted"`.
- The last button reads `user.status === "deleted" ? "Restore" : "Delete"`, variant `primary` for Restore, `danger` for Delete.
Spec: no "Reset password" button without the callback; the 2FA label flips with `totpRequired`; a deleted user gets Restore and no Freeze.

`users-page.tsx`: `onResetPassword?: () => void` passed through. Spec: renders without it.

- [ ] **Step 2: The pure decisions — spec first**

`people.spec.ts` (build users with a local `make()` like the fixture's, `totpRequired: false` included):

```ts
describe("matchesPerson", () => {
  it("applies role, status and factor chips and free text on username or email", () => {
    const u = make("u-1", "a.ivanova", ["admin"], { totpEnabled: false, passkeyEnabled: null });
    expect(matchesPerson(u, "role:admin")).toBe(true);
    expect(matchesPerson(u, "role:guest")).toBe(false);
    expect(matchesPerson(u, "2fa:off passkey:unknown")).toBe(true);
    expect(matchesPerson(u, "status:frozen")).toBe(false);
    expect(matchesPerson(u, "IVAN")).toBe(true);
    expect(matchesPerson(u, "colour:blue")).toBe(true); // unknown keys are ignored
  });
});

describe("groupPeople", () => {
  it("puts owners first, then one group per role in the gateway's order, then the roleless", () => {
    const roles = [role("admin", "Company Owner"), role("guest", "Guest")];
    const groups = groupPeople(
      [make("u-1", "root", [], { isOwner: true }), make("u-2", "g", ["guest"]), make("u-3", "a", ["admin", "guest"]), make("u-4", "n", [])],
      roles,
    );
    expect(groups.map((g) => [g.key, g.people.map((p) => p.user.username)])).toEqual([
      ["owners", ["root"]],
      ["admin", ["a"]],
      ["guest", ["g"]],
      ["none", ["n"]],
    ]);
    expect(groups[1].label).toBe("Company Owner");
  });
});

describe("coverageOf and statsOf", () => {
  it("counts second factors without ever counting an unknown as off", () => {
    const users = [
      make("1", "both", [], { totpEnabled: true, passkeyEnabled: true }),
      make("2", "one", [], { totpEnabled: true, passkeyEnabled: false }),
      make("3", "none", [], { totpEnabled: false, passkeyEnabled: false }),
      make("4", "unknown", [], { totpEnabled: null, passkeyEnabled: null }),
      make("5", "gone", [], { status: "deleted", totpEnabled: false, passkeyEnabled: false }),
    ];
    const c = coverageOf(users);
    expect(c.detail).toBe("2 / 4");
    expect(c.segments.map((s) => [s.label, s.value])).toEqual([
      ["2FA + passkey", 1], ["one factor", 1], ["password only", 1], ["unknown", 1],
    ]);
    const s = statsOf(users, [role("admin", "Company Owner", "system"), role("ops", "Ops", "custom")]);
    expect(s[0]).toEqual({ label: "Accounts", value: "4", hint: "4 active · 0 frozen" });
    expect(s[2]).toEqual({ label: "Needs attention", value: "1", hint: "no second factor", tone: "bad" });
  });
});

describe("inspectorDetails", () => {
  it("reads the three facts the account carries", () => {
    const d = inspectorDetails(make("1", "a", [], { totpEnabled: null, passkeyEnabled: true, totpRequired: true }));
    expect(d.map((x) => [x.label, x.value])).toEqual([["2FA", "—"], ["passkey", "Yes"], ["2FA required", "yes"]]);
  });
});
```

`people.ts`:

```ts
import { knownLabel, knownTone, type Known, type User } from "@/entities/user";
import type { Role } from "@/entities/role";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { PeopleGroup, Person } from "@/widgets/people-groups";
import type { PersonDetail } from "@/widgets/person-inspector";
import type { UsersPageStat } from "../ui/users-page";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";

const known = (value: Known) => (value === null ? "unknown" : value ? "on" : "off");

/** role:, status:, 2fa:, passkey: chips plus free text on username or email. */
export function matchesPerson(user: User, query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "role" && !user.roleSlugs.includes(value)) return false;
    if (key === "status" && user.status !== value) return false;
    if (key === "2fa" && known(user.totpEnabled) !== value) return false;
    if (key === "passkey" && known(user.passkeyEnabled) !== value) return false;
  }
  const text = freeText(query).trim().toLowerCase();
  return (
    text === "" ||
    user.username.toLowerCase().includes(text) ||
    user.email.toLowerCase().includes(text)
  );
}

const person = (user: User): Person => ({ user });

/**
 * Owners first, then one group per role in the order the gateway lists them,
 * then whoever holds none. A person appears once: under Owners if they are
 * one, else under the first of their roles that still exists.
 */
export function groupPeople(users: User[], roles: Role[]): PeopleGroup[] {
  const slugs = new Set(roles.map((r) => r.slug));
  const others = users.filter((u) => !u.isOwner);
  const firstRole = (u: User) => u.roleSlugs.find((s) => slugs.has(s));
  return [
    { key: "owners", label: "Owners", people: users.filter((u) => u.isOwner).map(person) },
    ...roles.map((role) => ({
      key: role.slug,
      label: role.title,
      people: others.filter((u) => firstRole(u) === role.slug).map(person),
    })),
    { key: "none", label: "No role", people: others.filter((u) => firstRole(u) === undefined).map(person) },
  ];
}

const live = (users: User[]) => users.filter((u) => u.status !== "deleted");
const hasFactor = (u: User) => u.totpEnabled === true || u.passkeyEnabled === true;

export function coverageOf(users: User[]): { label: string; detail: string; segments: CoverageSegment[] } {
  const people = live(users);
  const both = people.filter((u) => u.totpEnabled === true && u.passkeyEnabled === true).length;
  const withFactor = people.filter(hasFactor).length;
  const none = people.filter((u) => u.totpEnabled === false && u.passkeyEnabled === false).length;
  // Anything left is unknown on at least one side and known on neither as on.
  const unknown = people.length - withFactor - none;
  return {
    label: "2FA coverage",
    detail: `${withFactor} / ${people.length}`,
    segments: [
      { tone: "ok", value: both, label: "2FA + passkey" },
      { tone: "warn", value: withFactor - both, label: "one factor" },
      { tone: "bad", value: none, label: "password only" },
      { tone: "neutral", value: unknown, label: "unknown" },
    ],
  };
}

export function statsOf(users: User[], roles: Role[]): UsersPageStat[] {
  const people = live(users);
  const frozen = people.filter((u) => u.status === "frozen").length;
  const inUse = new Set(people.flatMap((u) => u.roleSlugs));
  const system = roles.filter((r) => r.kind === "system" && inUse.has(r.slug)).length;
  const weak = people.filter((u) => u.totpEnabled === false && u.passkeyEnabled === false).length;
  return [
    { label: "Accounts", value: String(people.length), hint: `${people.length - frozen} active · ${frozen} frozen` },
    { label: "Roles in use", value: String(inUse.size), hint: `${system} system · ${inUse.size - system} custom` },
    { label: "Needs attention", value: String(weak), hint: "no second factor", tone: weak > 0 ? "bad" : "ok" },
  ];
}

/** The three facts AuthUser carries about a person's second factor. */
export function inspectorDetails(user: User): PersonDetail[] {
  return [
    { label: "2FA", value: knownLabel(user.totpEnabled), tone: knownTone(user.totpEnabled) },
    { label: "passkey", value: knownLabel(user.passkeyEnabled), tone: knownTone(user.passkeyEnabled) },
    // Policy, not health: no ok/bad tone, only emphasis.
    { label: "2FA required", value: user.totpRequired ? "yes" : "no", tone: user.totpRequired ? "fg" : "dim" },
  ];
}
```

`DetailTone` is `"fg" | "ok" | "warn" | "bad" | "dim" | "muted"`; `knownTone` returns `ok | bad | dim`, all members. Run the spec — PASS.

- [ ] **Step 3: The container hook — spec, then hook**

`use-users.spec.tsx` drives the real gateways through a stubbed `fetch` and a fresh `QueryClient`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useUsers } from "./use-users";

const PRINCIPAL = { id: "me", email: "me@x", username: "me", status: "active", totpEnabled: true, totpRequired: false, passkeyEnabled: null, roleSlugs: ["admin"], roleTitles: { admin: "Company Owner" }, permissions: ["users:read", "users:write"], isOwner: false, onboardingToursSeen: [] };
const USER = { id: "u-1", email: "a@x", username: "a.ivanova", status: "active", roleSlugs: ["guest"], permissions: [], isOwner: false, totpRequired: false };
const ROLE = { slug: "guest", title: "Guest", isSystem: true, permissionSlugs: ["territory:read"] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  clearNotices();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/auth/users") && (init?.method ?? "GET") === "GET") return json([USER]);
    if (url === "/api/auth/roles") return json([ROLE]);
    if (url.endsWith("/freeze")) return json({ ...USER, status: "frozen" });
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useUsers", () => {
  it("is loading, then ready with the people and roles", async () => {
    const { result } = renderHook(() => useUsers(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.users?.map((u) => u.username)).toEqual(["a.ivanova"]);
    expect(result.current.roles.map((r) => r.slug)).toEqual(["guest"]);
    expect(result.current.canManage).toBe(true);
  });

  // The confirm dialog is the only route to a state change; nothing freezes
  // on a single click.
  it("freezes only after confirmation, then reports and refetches", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));

    act(() => result.current.users.select("u-1"));
    act(() => result.current.users.ask("freeze"));
    expect(result.current.users.pending?.kind).toBe("freeze");
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/freeze"))).toBe(false);

    act(() => result.current.users.confirm());
    await waitFor(() => expect(result.current.users.pending).toBeNull());
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/freeze"))).toBe(true);
    expect(result.current.notices[0]?.message).toBe("Account frozen");
    // The list was invalidated: a second GET went out.
    expect(fetchMock.mock.calls.filter(([u, i]) => u === "/api/auth/users?includeDeleted=true" && !(i as RequestInit)?.method).length).toBe(2);
  });

  it("surfaces the gateway's refusal as an error notice", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.select("u-1"));
    act(() => result.current.users.ask("delete"));
    act(() => result.current.users.confirm());
    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
    expect(result.current.notices[0].message).toBe("You don't have permission to do this");
  });

  it("is unavailable, not empty, when the list cannot be read", async () => {
    fetchMock.mockImplementation(async () => json({ code: "forbidden", message: "no" }, 403));
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("no");
  });
});
```

`use-users.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { rolesQuery, type Role } from "@/entities/role";
import {
  createUser,
  deleteUser,
  freezeUser,
  meQuery,
  restoreUser,
  setTwoFactorRequired,
  setUserRoles,
  unfreezeUser,
  usersQuery,
  type NewUser,
  type User,
} from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { can, type Principal } from "@/shared/session";

export type ActionKind = "freeze" | "unfreeze" | "delete" | "restore" | "require-2fa" | "unrequire-2fa";
export type PendingAction = { kind: ActionKind; user: User };

const DONE: Record<ActionKind, string> = {
  freeze: "Account frozen",
  unfreeze: "Account unfrozen",
  delete: "Account deleted",
  restore: "Account restored",
  "require-2fa": "2FA now required",
  "unrequire-2fa": "2FA no longer required",
};

const run = ({ kind, user }: PendingAction): Promise<unknown> => {
  switch (kind) {
    case "freeze": return freezeUser(user.id);
    case "unfreeze": return unfreezeUser(user.id);
    case "delete": return deleteUser(user.id);
    case "restore": return restoreUser(user.id);
    case "require-2fa": return setTwoFactorRequired(user.id, true);
    case "unrequire-2fa": return setTwoFactorRequired(user.id, false);
  }
};

export type UsersState = {
  me: Principal | null;
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  users: User[] | null;
  roles: Role[];
  canManage: boolean;
  query: string;
  setQuery: (q: string) => void;
  selected: User | null;
  select: (id: string | null) => void;
  /** The confirm dialog's question, or null when none is open. */
  pending: PendingAction | null;
  ask: (kind: ActionKind) => void;
  confirm: () => void;
  dismiss: () => void;
  busy: boolean;
  creating: boolean;
  setCreating: (open: boolean) => void;
  create: (input: NewUser) => void;
  addingRole: boolean;
  setAddingRole: (open: boolean) => void;
  setRoles: (roleSlugs: string[]) => void;
  rolesBusy: boolean;
};

/**
 * Everything the Users screen decides. Every state change goes through a
 * pending action the confirm dialog must answer; every outcome reports
 * through notify and invalidates the list so the cards redraw from the
 * gateway's answer rather than a guess.
 */
export function useUsers(): UsersState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const users = useQuery(usersQuery);
  const roles = useQuery(rolesQuery);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingRole, setAddingRole] = useState(false);

  const selected = users.data?.find((u) => u.id === selectedId) ?? null;
  const refresh = () => client.invalidateQueries({ queryKey: ["users"] });
  const fail = (err: unknown) => notify.error(messageOf(err));

  const action = useMutation({
    mutationFn: run,
    onSuccess: (_, { kind }) => {
      notify.success(DONE[kind]);
      void refresh();
    },
    onError: fail,
    onSettled: () => setPending(null),
  });

  const creation = useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      notify.success("User created");
      setCreating(false);
      setSelectedId(user.id);
      void refresh();
    },
    onError: fail,
  });

  const roleChange = useMutation({
    mutationFn: ({ id, roleSlugs }: { id: string; roleSlugs: string[] }) => setUserRoles(id, roleSlugs),
    onSuccess: () => {
      notify.success("Roles updated");
      setAddingRole(false);
      void refresh();
    },
    onError: fail,
  });

  return {
    me,
    status: users.isPending ? "loading" : users.isError ? "unavailable" : "ready",
    error: users.isError ? messageOf(users.error) : null,
    users: users.data ?? null,
    roles: roles.data ?? [],
    canManage: can(me, "users:write"),
    query,
    setQuery,
    selected,
    select: setSelectedId,
    pending,
    ask: (kind) => selected && setPending({ kind, user: selected }),
    confirm: () => pending && action.mutate(pending),
    dismiss: () => setPending(null),
    busy: action.isPending,
    creating,
    setCreating,
    create: creation.mutate,
    addingRole,
    setAddingRole,
    setRoles: (roleSlugs) => selected && roleChange.mutate({ id: selected.id, roleSlugs }),
    rolesBusy: roleChange.isPending,
  };
}
```

- [ ] **Step 4: The screen**

`users-screen.tsx`:

```tsx
import { useMemo } from "react";
import { roleTitle } from "@/entities/user";
import { CreateUserDialog } from "@/features/create-user";
import { AddRoleDialog, RoleChips } from "@/features/role-assign";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { coverageOf, groupPeople, inspectorDetails, matchesPerson, statsOf } from "../model/people";
import { useUsers, type PendingAction } from "../model/use-users";
import { UsersPage } from "./users-page";

const QUESTION: Record<PendingAction["kind"], (name: string) => { title: string; description: string; confirmLabel: string; tone: "default" | "danger" }> = {
  freeze: (n) => ({ title: `Freeze ${n}?`, description: "They are signed out everywhere and cannot sign in until unfrozen.", confirmLabel: "Freeze", tone: "danger" }),
  unfreeze: (n) => ({ title: `Unfreeze ${n}?`, description: "They can sign in again.", confirmLabel: "Unfreeze", tone: "default" }),
  delete: (n) => ({ title: `Delete ${n}?`, description: "The account is soft-deleted and can be restored later.", confirmLabel: "Delete", tone: "danger" }),
  restore: (n) => ({ title: `Restore ${n}?`, description: "The account comes back with the roles it had.", confirmLabel: "Restore", tone: "default" }),
  "require-2fa": (n) => ({ title: `Require 2FA for ${n}?`, description: "They keep signing in, but reach only the enrollment screens until a second factor is enrolled.", confirmLabel: "Require 2FA", tone: "default" }),
  "unrequire-2fa": (n) => ({ title: `Stop requiring 2FA for ${n}?`, description: "An enrolled second factor stays enabled.", confirmLabel: "Stop requiring", tone: "default" }),
};

const LABEL = "m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted";

/** Maps the container onto the page and draws the dialogs beside it. */
export function UsersScreen() {
  const s = useUsers();

  const groups = useMemo(
    () => (s.users ? groupPeople(s.users.filter((u) => matchesPerson(u, s.query)), s.roles) : []),
    [s.users, s.roles, s.query],
  );

  if (s.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading people" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.users) {
    return <Callout tone="bad">People are unavailable: {s.error}</Callout>;
  }

  const selected = s.selected;
  const held = new Set(selected?.roleSlugs ?? []);
  const question = s.pending ? QUESTION[s.pending.kind](s.pending.user.username) : null;

  return (
    <>
      <UsersPage
        groups={groups}
        coverage={coverageOf(s.users)}
        stats={statsOf(s.users, s.roles)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedId={selected?.id ?? null}
        onSelect={s.select}
        onCloseInspector={() => s.select(null)}
        inspected={
          selected && {
            user: selected,
            details: inspectorDetails(selected),
            body: (
              <div>
                <p className={LABEL}>Roles</p>
                <RoleChips
                  roles={selected.roleSlugs.map((slug) => ({ slug, title: roleTitle(selected, slug) }))}
                  onRemove={(slug) => s.setRoles(selected.roleSlugs.filter((x) => x !== slug))}
                  onAdd={() => s.setAddingRole(true)}
                  readOnly={!s.canManage}
                />
              </div>
            ),
          }
        }
        canManage={s.canManage}
        onCreateUser={() => s.setCreating(true)}
        onRequire2fa={() => s.ask(selected?.totpRequired ? "unrequire-2fa" : "require-2fa")}
        onFreeze={() => s.ask(selected?.status === "frozen" ? "unfreeze" : "freeze")}
        onDelete={() => s.ask(selected?.status === "deleted" ? "restore" : "delete")}
      />

      {question ? (
        <ConfirmDialog open {...question} busy={s.busy} onConfirm={s.confirm} onCancel={s.dismiss} />
      ) : null}
      {s.creating ? (
        <CreateUserDialog
          open
          roles={s.roles.map((r) => ({ slug: r.slug, title: r.title }))}
          onClose={() => s.setCreating(false)}
          onCreate={s.create}
        />
      ) : null}
      {s.addingRole && selected ? (
        <AddRoleDialog
          open
          options={s.roles.filter((r) => !held.has(r.slug)).map((r) => ({ slug: r.slug, title: r.title }))}
          busy={s.rolesBusy}
          onClose={() => s.setAddingRole(false)}
          onAdd={(slug) => s.setRoles([...selected.roleSlugs, slug])}
        />
      ) : null}
    </>
  );
}
```

`users-screen.spec.tsx`: mock `../model/use-users` (`vi.mock` returning a controllable `UsersState`) and assert: loading renders the busy region and no heading; unavailable renders the callout with the message; ready renders the "Users" heading, the person card, and clicking "Freeze" in the inspector opens a dialog titled "Freeze a.ivanova?" (i.e. `ask` was called with "freeze" — with the mock, assert `ask` was called; render the dialog by feeding `pending` in the mocked state). Keep it to what a user observes.

`pages/users/index.ts`: add `export { UsersScreen } from "./ui/users-screen";`. Nothing here needs a new fixture — the slice already has `users-page.fixture.tsx`.

- [ ] **Step 5: The route**

`routes.tsx`: `import { UsersScreen } from "@/pages/users";` and `component: UsersScreen` on `consoleUsersRoute`.

- [ ] **Step 6: Lint, suite, coverage, live**

`yarn lint && yarn test && yarn test:coverage`. Live as `admin`: people grouped, the filter narrows, selecting a person opens the inspector with three detail rows; add a role through the dialog and watch the chip appear after the refetch; freeze `cotest2` → confirm → "Account frozen" toast and a warn dot; unfreeze; "Require 2FA" flips the label; New user creates `livecheck.user` with role Guest and selects it; delete it → Restore appears → restore. Sign in as `cotest` (Company Owner, no `users:read_all`): the list is the tenant's own. Record what you saw in the report.

- [ ] **Step 7: Commit**

`feat(frontend-v2): the Users screen, live` — body: the container/pure/screen split, the rulings that touched widgets (optional territories/lastSeen, no Reset password, Require 2FA wired, Restore for a deleted account), the `--no-verify` note, the trailer.

---

### Task 6: The Roles screen, docs and the live pass

**Files:**
- Create: `frontend-v2/src/pages/roles/model/roles-view.ts`, `roles-view.spec.ts`, `use-roles.ts`, `use-roles.spec.tsx`
- Create: `frontend-v2/src/pages/roles/ui/roles-screen.tsx`, `roles-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/roles/index.ts`, `frontend-v2/src/app/router/routes.tsx`
- Modify: `frontend-v2/README.md`, `frontend-v2/CLAUDE.md`, root `CLAUDE.md` (the "Two frontends" paragraph)

**Interfaces:**
- Consumes: Task 3's gateways/queries and `grantableSlugs`; Task 2's `usersQuery`; Task 4's `CreateRoleDialog`; Task 1's `notify`, `messageOf`.
- Produces: `matchesRole`, `withUserCounts`, `roleChips`, `groupRoles`, `distributionOf`, `statsOf`; `useRoles()`; `RolesScreen` on `/console/roles`.

- [ ] **Step 1: Pure view functions — spec, then code**

`roles-view.spec.ts` cases:
- `matchesRole`: `kind:custom` excludes a system role; `grants:users.write` and `grants:users:write` both match a role holding `users:write`; free text matches slug or title.
- `withUserCounts`: counts live holders per role; `null` users leaves every count null.
- `roleChips`: a role holding both `users:read` and `users:write` out of a two-permission `users` group gets `users.*` (strong); a partial holder gets `users.read`; a slug outside `grantable` is `locked`; at most three chips.
- `groupRoles`: system roles under "System roles" with note "read-only · defined by migrations", custom under "Custom roles" with note "2 roles · editable"; the selected custom role gets tag `editing` only when dirty; faces are empty when users are null.
- `distributionOf`/`statsOf`: with users null the detail is "unavailable", segments empty, and Root holders is "—".

`roles-view.ts`:

```ts
import { actionOf, groupPermissions, type Permission } from "@/entities/permission";
import type { Role, RoleCardChip } from "@/entities/role";
import type { User } from "@/entities/user";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";
import type { RoleEntry, RoleGroup } from "@/widgets/role-groups";
import type { RolesPageStat } from "../ui/roles-page";

/** The mock writes users.write; the gateway says users:write. Both work. */
const toSlug = (value: string) => value.replace(".", ":");

export function matchesRole(role: Role, query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "kind" && role.kind !== value) return false;
    if (key === "grants" && !role.permissionSlugs.includes(toSlug(value))) return false;
  }
  const text = freeText(query).trim().toLowerCase();
  return text === "" || role.slug.includes(text) || role.title.toLowerCase().includes(text);
}

const live = (users: User[]) => users.filter((u) => u.status !== "deleted");

/** Fills `users` from the people list; null people leave every count unknown. */
export function withUserCounts(roles: Role[], users: User[] | null): Role[] {
  if (!users) return roles;
  const people = live(users);
  return roles.map((role) => ({ ...role, users: people.filter((u) => u.roleSlugs.includes(role.slug)).length }));
}

const MAX_CHIPS = 3;
const MAX_FACES = 4;

/** `group.*` for a whole group held, else one chip per grant; locked when not grantable. */
export function roleChips(role: Role, all: Permission[], grantable?: Set<string>): RoleCardChip[] {
  const held = new Set(role.permissionSlugs);
  const chips: RoleCardChip[] = [];
  for (const group of groupPermissions(all)) {
    const mine = group.permissions.filter((p) => held.has(p.slug));
    if (mine.length === 0) continue;
    if (mine.length === group.permissions.length) {
      chips.push({ label: `${group.name}.*`, tone: "strong" });
      continue;
    }
    for (const p of mine) {
      chips.push({ label: `${group.name}.${actionOf(p.slug)}`, ...(grantable && !grantable.has(p.slug) ? { tone: "locked" as const } : {}) });
    }
  }
  return chips.slice(0, MAX_CHIPS);
}

type Selection = { slug: string | null; dirty: boolean };

export function groupRoles(
  roles: Role[],
  users: User[] | null,
  all: Permission[],
  grantable: Set<string> | undefined,
  selection: Selection,
): RoleGroup[] {
  const entry = (role: Role): RoleEntry => {
    const selected = role.slug === selection.slug;
    const editing = selected && role.kind === "custom" && selection.dirty;
    return {
      role,
      tone: selected ? "accent" : role.kind === "system" ? "warn" : "ok",
      ...(role.kind === "system" ? { tag: "system", tagTone: "dim" as const } : editing ? { tag: "editing", tagTone: "accent" as const } : {}),
      chips: roleChips(role, all, grantable),
      faces: users ? live(users).filter((u) => u.roleSlugs.includes(role.slug)).map((u) => u.username).slice(0, MAX_FACES) : [],
    };
  };
  const system = roles.filter((r) => r.kind === "system");
  const custom = roles.filter((r) => r.kind === "custom");
  return [
    { key: "system", label: "System roles", note: "read-only · defined by migrations", roles: system.map(entry) },
    { key: "custom", label: "Custom roles", note: `${custom.length} ${custom.length === 1 ? "role" : "roles"} · editable`, roles: custom.map(entry) },
  ];
}

const TONES: CoverageSegment["tone"][] = ["accent", "ok", "neutral", "warn", "bad"];

/** Every grant counts: a person with two roles sits in two segments. */
export function distributionOf(roles: Role[], users: User[] | null): { label: string; detail: string; segments: CoverageSegment[] } {
  if (!users) return { label: "People by role", detail: "unavailable", segments: [] };
  const people = live(users);
  const segments = roles
    .map((role, i) => ({ tone: TONES[i % TONES.length], value: people.filter((u) => u.roleSlugs.includes(role.slug)).length, label: role.slug }))
    .filter((s) => s.value > 0);
  return { label: "People by role", detail: `${people.length} accounts`, segments };
}

export function statsOf(roles: Role[], permissions: Permission[], users: User[] | null): RolesPageStat[] {
  const system = roles.filter((r) => r.kind === "system").length;
  const owners = users ? String(live(users).filter((u) => u.isOwner).length) : "—";
  return [
    { label: "Roles", value: String(roles.length), hint: `${system} system · ${roles.length - system} custom` },
    { label: "Permissions", value: String(permissions.length), hint: `${groupPermissions(permissions).length} resource groups` },
    { label: "Root holders", value: owners, hint: "unrestricted access", tone: "accent" },
  ];
}
```

(`RoleCardChip` is exported from `@/entities/role` already.)

- [ ] **Step 2: The container hook — spec, then hook**

`use-roles.spec.tsx` (same fetch-stub harness as Task 5, with `/api/auth/roles`, `/api/auth/permissions` and `/api/auth/users?includeDeleted=true` answered): ready state carries roles, permissions and user counts; selecting a role seeds the draft from its slugs and is not dirty; toggling a slug makes it dirty; save PUTs the permissions and, when the title changed, PATCHes it, then toasts "Role saved"; a principal without `users:read` never requests the users list (`fetchMock` sees no `/api/auth/users` call) and counts stay null; create posts and selects the new slug.

`use-roles.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { permissionsQuery, type Permission } from "@/entities/permission";
import { createRole, renameRole, rolesQuery, setRolePermissions, type Role } from "@/entities/role";
import { meQuery, usersQuery, type User } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { can, grantableSlugs, type Principal } from "@/shared/session";

type Draft = { title: string; granted: string[] };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export type RolesState = {
  me: Principal | null;
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  roles: Role[];
  permissions: Permission[];
  /** null when this actor may not read people — counts and faces stay unknown. */
  users: User[] | null;
  grantable: Set<string>;
  canManage: boolean;
  query: string;
  setQuery: (q: string) => void;
  selected: Role | null;
  draft: Draft | null;
  dirty: boolean;
  select: (slug: string | null) => void;
  toggle: (slug: string) => void;
  rename: (title: string) => void;
  reset: () => void;
  save: () => void;
  saving: boolean;
  creating: boolean;
  setCreating: (open: boolean) => void;
  create: (input: { title: string; permissionSlugs: string[] }) => void;
  creatingBusy: boolean;
};

/**
 * The draft is the inspector's truth until saved; dirty is computed against
 * the role as the gateway last returned it, so a successful save clears it by
 * the refetch alone and a failed one leaves the edits in place.
 */
export function useRoles(): RolesState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const roles = useQuery(rolesQuery);
  const permissions = useQuery(permissionsQuery);
  // Not asked for when it would only 403: the count is then honestly unknown.
  const users = useQuery({ ...usersQuery, enabled: can(me, "users:read") });
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = roles.data?.find((r) => r.slug === selectedSlug) ?? null;
  const dirty = !!selected && !!draft && (draft.title !== selected.title || !sameSet(draft.granted, selected.permissionSlugs));
  const refresh = () => client.invalidateQueries({ queryKey: ["roles"] });
  const fail = (err: unknown) => notify.error(messageOf(err));

  const select = (slug: string | null) => {
    setSelectedSlug(slug);
    const role = roles.data?.find((r) => r.slug === slug);
    setDraft(role ? { title: role.title, granted: role.permissionSlugs } : null);
  };

  const saving = useMutation({
    // Two calls when both changed; the gateway has no single "update role".
    mutationFn: async () => {
      if (!selected || !draft) return;
      if (!sameSet(draft.granted, selected.permissionSlugs)) await setRolePermissions(selected.slug, draft.granted);
      if (draft.title !== selected.title) await renameRole(selected.slug, draft.title);
    },
    onSuccess: () => {
      notify.success("Role saved");
      void refresh();
    },
    onError: fail,
  });

  const creation = useMutation({
    mutationFn: ({ title, permissionSlugs }: { title: string; permissionSlugs: string[] }) => createRole(title, permissionSlugs),
    onSuccess: (role) => {
      notify.success("Role created");
      setCreating(false);
      setSelectedSlug(role.slug);
      setDraft({ title: role.title, granted: role.permissionSlugs });
      void refresh();
    },
    onError: fail,
  });

  const pending = roles.isPending || permissions.isPending;
  const failed = roles.isError || permissions.isError;

  return {
    me,
    status: pending ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(roles.error ?? permissions.error) : null,
    roles: roles.data ?? [],
    permissions: permissions.data ?? [],
    users: users.data ?? null,
    grantable: grantableSlugs(me, permissions.data ?? []),
    canManage: can(me, "roles:manage"),
    query,
    setQuery,
    selected,
    draft,
    dirty,
    select,
    toggle: (slug) => setDraft((d) => d && { ...d, granted: d.granted.includes(slug) ? d.granted.filter((s) => s !== slug) : [...d.granted, slug] }),
    rename: (title) => setDraft((d) => d && { ...d, title }),
    reset: () => selected && setDraft({ title: selected.title, granted: selected.permissionSlugs }),
    save: () => saving.mutate(),
    saving: saving.isPending,
    creating,
    setCreating,
    create: creation.mutate,
    creatingBusy: creation.isPending,
  };
}
```

- [ ] **Step 3: The screen**

`roles-screen.tsx`:

```tsx
import { useMemo } from "react";
import { CreateRoleDialog } from "@/features/create-role";
import { Callout } from "@/shared/ui/callout";
import { Skeleton } from "@/shared/ui/skeleton";
import { distributionOf, groupRoles, matchesRole, statsOf, withUserCounts } from "../model/roles-view";
import { useRoles } from "../model/use-roles";
import { RolesPage } from "./roles-page";

export function RolesScreen() {
  const s = useRoles();
  const counted = useMemo(() => withUserCounts(s.roles, s.users), [s.roles, s.users]);
  const groups = useMemo(
    () => groupRoles(counted.filter((r) => matchesRole(r, s.query)), s.users, s.permissions, s.grantable, { slug: s.selected?.slug ?? null, dirty: s.dirty }),
    [counted, s.users, s.permissions, s.grantable, s.query, s.selected, s.dirty],
  );

  if (s.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading roles" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable") {
    return <Callout tone="bad">Roles are unavailable: {s.error}</Callout>;
  }

  const selected = s.selected && counted.find((r) => r.slug === s.selected?.slug);

  return (
    <>
      <RolesPage
        groups={groups}
        allPermissions={s.permissions}
        distribution={distributionOf(counted, s.users)}
        stats={statsOf(counted, s.permissions, s.users)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedSlug={s.selected?.slug ?? null}
        onSelect={s.select}
        onCloseInspector={() => s.select(null)}
        edited={
          selected && s.draft
            ? { role: { ...selected, title: s.draft.title }, granted: s.draft.granted, dirty: s.dirty, saving: s.saving }
            : null
        }
        grantable={s.grantable}
        onTogglePermission={s.toggle}
        onRenameRole={s.rename}
        onResetRole={s.reset}
        onSaveRole={s.save}
        onCreateRole={() => s.setCreating(true)}
        canManage={s.canManage}
      />
      {s.creating ? (
        <CreateRoleDialog
          open
          startFrom={s.roles.map((r) => ({ slug: r.slug, title: r.title, permissionSlugs: r.permissionSlugs }))}
          busy={s.creatingBusy}
          onClose={() => s.setCreating(false)}
          onCreate={s.create}
        />
      ) : null}
    </>
  );
}
```

`roles-screen.spec.tsx`: mock `../model/use-roles`; loading / unavailable / ready (heading "Roles & Permissions", a role card, the inspector present when `selected` and `draft` are set, "+ New role" absent when `canManage` is false).

`pages/roles/index.ts`: export `RolesScreen`. `routes.tsx`: `component: RolesScreen` on `consoleRolesRoute`.

- [ ] **Step 4: Docs**

- `frontend-v2/README.md` and `frontend-v2/CLAUDE.md`: the "console screens are placeholders" paragraphs now say Users and Roles are live (containers in `pages/{users,roles}/model`, the console shell in `app/router/console-shell.tsx`, toasts via `shared/lib/notify`), and that Content, Territory access, Audit and Metrics remain placeholders. Add the rulings that a future reader would trip on: Reset password is not rendered; no owner toggle or role delete; people counts on roles are null without `users:read`.
- Root `CLAUDE.md`, "Two frontends": "its console screens are still placeholders" → "Users and Roles are wired; the other four console screens are placeholders".

- [ ] **Step 5: Lint, suite, coverage, live**

`yarn lint && yarn test && yarn test:coverage`. Live as `admin`: roles in two groups with chips and faces; select Guest (system) → read-only matrix with the callout; select or create a custom role → toggle a permission, rename, Save → "Role saved" toast, tag returns from `editing`; Reset restores; as `cotest` (Company Owner, holds `roles:read`/`roles:manage` but not everything) locked chips appear for what they do not hold; a Guest-level account never reaches the screen (bounces to `/console`). Record the observations in the report.

- [ ] **Step 6: Commit**

`feat(frontend-v2): the Roles screen, live` — body: the draft/dirty design, the two-call save, counts that are honestly unknown, docs updated, the `--no-verify` note, the trailer.

---

## After this plan

Content and Territory access (step 3 of the spec's order), then Audit and Metrics (step 4), each in its own plan. Both reuse this plan's shell, toaster, gate, dialogs and the container/pure/screen split.
