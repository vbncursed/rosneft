# Two-factor required gate — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A session whose account must enroll a second factor lands on a gate screen (mock `Two Factor Required v2`), goes through the existing wizard, sees "You're all set", and continues into a working app — instead of dead-ending on 403s everywhere.

**Architecture:** One pure rule, `mustEnroll(me)`, in `shared/session`. The router confines such a principal to two paths in the `beforeLoad` of `catalogRoute` and `consoleRoute` (pure decision `enrollmentRedirect` in `guard.ts`). A new root-level route `/two-factor-required` renders the gate/done page. The HTTP client turns a mid-session `403 twofa_enrollment_required` into a full load of the gate. The wizard's exits follow `me`.

**Tech Stack:** React 19, TanStack Router + Query, TypeScript 7, Tailwind 4, vitest + Testing Library, React Cosmos, Python Playwright for the live pass.

**Spec:** `docs/superpowers/specs/2026-09-24-two-factor-required-gate-design.md`

## Global Constraints

- Work in `frontend/` on branch `dev`. Code, comments, commits in English. yarn only, never npm.
- A parallel session may work in `backend/` of this clone: never `git stash`, `git checkout -- …`, `git reset`, `git restore`; commit by explicit pathspec only — `git add <paths> && git commit --no-verify -F <msg> -- <paths>`, paths written literally; check `git show --stat HEAD` for foreign files. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. `--no-verify` because the hook runs the Go gate; say so in the message. Don't push.
- Kill only processes you started (by PID). Never `pkill -f vite`.
- `yarn lint` is `tsc -b --noEmit && oxlint`; never trust a bare `tsc --noEmit`.
- Every module has its own `*.spec.ts(x)`; every slice rendering JSX has a `*.fixture.tsx` (`src/architecture.spec.ts`, `src/fixtures.spec.tsx`). Imports point inward only (`app → pages → widgets → features → entities → shared`); nothing reaches past another slice's `index.ts`.
- Product files under 200 non-blank, non-comment lines.
- Theme tokens only, no hex. One Tailwind property per element (`clsx` does not merge).
- A navigation is an `<a>`; one drawn as a button uses `linkButtonClass` from `@/shared/ui/button`.
- Icons come from `@/shared/ui/icon` (`lock`, `check`, `arrow-right`, `moon`/`sun` exist). Never a typed arrow as button content.
- The gate rule, verbatim from the spec: `mustEnroll(me) = me.totpRequired && me.totpEnabled === false` — `null` (unknown) does not gate.
- The allowed paths for a must-enroll principal: exactly `/two-factor-required` and `/account/two-factor`.
- The client-visible code: `twofa_enrollment_required`, held in one named constant.
- Mock copy, word for word:
  - gate badge `two-factor required`; h1 `Set up two-factor to continue`; body `An administrator requires a second factor on your account. Territories, models and the console stay closed until an authenticator app is linked.`
  - steps: `01` `Open an authenticator app` / `1Password, Google Authenticator or any TOTP app on your phone.`; `02` `Scan the code and confirm six digits` / `A manual key is there if the camera can't read the QR.`; `03` `Save the recovery codes` / `They are shown once. Each one gets you in if the phone is lost.`
  - gate footer: `Sign out`, `Set up two-factor` (+ arrow icon)
  - done badge `two-factor on`; h1 `You're all set`; body `From the next sign-in you'll be asked for a code after your password. Recovery codes can be regenerated from Account.`; button `Continue to territories`
  - header brand `Andrey Viewer`

## Rulings recorded while planning

- **`beforeLoad`, not `loader`, carries the enrollment redirect.** The spec says "loaders"; but TanStack runs a parent's and its children's loaders in parallel, so `consoleIndexRoute`'s own landing redirect could win the race. `beforeLoad` runs parent-first and serially. It awaits `ensureQueryData(meQuery)`, which the loaders then find cached.
- **The wizard's back links while gated read `← Overview` / `Back to the overview`** (the mock does not draw the wizard in the gated state; "Account" would name a page the session cannot open).

## File Structure

- Modify `frontend/src/shared/session/principal.ts` (+ spec), `index.ts` — `mustEnroll`.
- Modify `frontend/src/shared/api/client.ts` (+ spec) — the 403 branch.
- Create `frontend/src/pages/two-factor-required/` — `index.ts`, `ui/two-factor-required-page.tsx` (+ spec), `ui/two-factor-required-screen.tsx` (+ spec), `two-factor-required.fixture.tsx`.
- Modify `frontend/src/app/router/routes.tsx`, `router.tsx`, `guard.ts` (+ `guard.spec.ts`), `catalog-routes.tsx`, `router.spec.tsx`.
- Modify `frontend/src/pages/two-factor/model/use-two-factor.ts` (+ spec), `ui/two-factor-page.tsx` (+ spec), `two-factor.fixture.tsx`.

---

### Task 1: The rule and the mid-session redirect (shared)

**Files:**
- Modify: `frontend/src/shared/session/principal.ts`, `frontend/src/shared/session/index.ts`
- Modify: `frontend/src/shared/api/client.ts`
- Test: `frontend/src/shared/session/principal.spec.ts`, `frontend/src/shared/api/client.spec.ts`

**Interfaces:**
- Produces: `mustEnroll(me: Principal | null | undefined): boolean` exported from `@/shared/session`. Also `ENROLLMENT_PATH = "/two-factor-required"` exported from `@/shared/session` (the one place the gate's path is spelled; the client, the guard and the pages use it).

- [ ] **Step 1: Failing specs**

`principal.spec.ts`, new `describe("mustEnroll")`:

```ts
const PRINCIPAL: Principal = {
  id: "u-1", email: "a.ivanova@example.com", username: "a.ivanova", status: "active",
  totpEnabled: false, totpRequired: false, passkeyEnabled: null,
  roleSlugs: [], roleTitles: {}, permissions: [], isOwner: false, onboardingToursSeen: [],
};

describe("mustEnroll", () => {
  const base = PRINCIPAL;
  it.each<[string, boolean, boolean | null, boolean]>([
    ["required, not enrolled", true, false, true],
    ["required, enrolled", true, true, false],
    ["not required", false, false, false],
    // twofa unreachable: unknown is not "off" — the gateway still enforces,
    // and the client's 403 branch catches what this lets through.
    ["required, enrolment unknown", true, null, false],
  ])("%s", (_label, totpRequired, totpEnabled, want) => {
    expect(mustEnroll({ ...base, totpRequired, totpEnabled })).toBe(want);
  });
  it("is false with no principal", () => {
    expect(mustEnroll(null)).toBe(false);
    expect(mustEnroll(undefined)).toBe(false);
  });
});
```

(Neither spec file has a principal literal today; this one is the file's own.)

`client.spec.ts`, beside the 401 cases (it already stubs `location` with `pathname: "/console/users"` and an `assign` mock):

```ts
  // An administrator can require 2FA of a signed-in account; the gateway
  // applies it on the next request while the SPA holds a stale principal.
  it("sends a session that must enroll to the gate on its 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(403, { code: "twofa_enrollment_required", message: "enroll a second factor to continue" }),
      ),
    );
    await expect(httpGet("/api/territories")).rejects.toBeInstanceOf(HttpError);
    expect(assign).toHaveBeenCalledWith("/two-factor-required");
  });

  it("does not bounce an ordinary 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "forbidden", message: "no" })));
    await expect(httpGet("/api/territories")).rejects.toBeInstanceOf(HttpError);
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not reload the gate onto itself", async () => {
    vi.stubGlobal("location", { pathname: "/two-factor-required", search: "", assign });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "twofa_enrollment_required" })));
    await expect(httpGet("/api/x")).rejects.toBeInstanceOf(HttpError);
    expect(assign).not.toHaveBeenCalled();
  });
```

(Match the file's existing imports/helpers — `jsonResponse`, `httpGet`, `HttpError`.)

- [ ] **Step 2: Run, see them fail**

Run: `cd frontend && yarn vitest run src/shared/session src/shared/api/client.spec.ts`
Expected: FAIL — `mustEnroll` not exported; `assign` not called.

- [ ] **Step 3: Implement**

`principal.ts`, after `can`:

```ts
/** The gate's route: the one place its path is spelled. */
export const ENROLLMENT_PATH = "/two-factor-required";

/**
 * An administrator requires a second factor and none is enrolled — the rule
 * auth-service's ValidateToken applies (only TOTP counts; a passkey does not).
 * `totpEnabled === null` is unknown, not "off", so it does not gate: the
 * gateway still enforces, and client.ts sends its 403 here.
 */
export const mustEnroll = (me: Principal | null | undefined): boolean =>
  !!me && me.totpRequired && me.totpEnabled === false;
```

`index.ts`: export `mustEnroll` and `ENROLLMENT_PATH` beside `can`.

`client.ts`: import `ENROLLMENT_PATH` from `@/shared/session` (already imports `clearAuthed` from there). Add a module constant and, after `body` is parsed (the 403 needs the body's code), before `throw`:

```ts
/** The gateway's code for "this account must enroll a second factor first". */
const ENROLLMENT_REQUIRED = "twofa_enrollment_required";
```

```ts
    // 403 twofa_enrollment_required = an administrator required a second
    // factor of this account, possibly mid-session. A full load of the gate,
    // like the 401 bounce above: the cached principal is stale, and the load
    // drops it. Never from the gate itself — it would reload onto itself.
    if (
      res.status === 403 &&
      body?.code === ENROLLMENT_REQUIRED &&
      location.pathname !== ENROLLMENT_PATH
    ) {
      location.assign(ENROLLMENT_PATH);
    }
```

If `ApiError` has no `code` field, read it as `(body as { code?: string } | null)?.code` rather than widening the type.

- [ ] **Step 4: Run, see them pass; lint**

Run: `cd frontend && yarn vitest run src/shared && yarn lint`
Expected: PASS, lint exit 0.

- [ ] **Step 5: Commit** `feat(session): name the must-enroll rule; send its 403 to the gate` — paths: `frontend/src/shared/session/principal.ts frontend/src/shared/session/principal.spec.ts frontend/src/shared/session/index.ts frontend/src/shared/api/client.ts frontend/src/shared/api/client.spec.ts`.

---

### Task 2: The gate page and its route

**Files:**
- Create: `frontend/src/pages/two-factor-required/index.ts`
- Create: `frontend/src/pages/two-factor-required/ui/two-factor-required-page.tsx` (+ `.spec.tsx`)
- Create: `frontend/src/pages/two-factor-required/ui/two-factor-required-screen.tsx` (+ `.spec.tsx`)
- Create: `frontend/src/pages/two-factor-required/two-factor-required.fixture.tsx`
- Modify: `frontend/src/app/router/routes.tsx`, `frontend/src/app/router/router.tsx`, `frontend/src/app/router/guard.ts` (`CATALOG_PATHS`), `frontend/src/app/router/guard.spec.ts` (if it pins `CATALOG_PATHS`/`isCatalogHref`)

**Interfaces:**
- Consumes: `mustEnroll`, `ENROLLMENT_PATH` (Task 1); `meQuery` (`@/entities/user`); `useSignOut` (`@/features/sign-out`); `ThemeToggle` (`@/features/theme-toggle`); `Avatar` (`@/shared/ui/avatar`); `Badge` (`@/shared/ui/badge`); `Icon`; `linkButtonClass`.
- Produces: `TwoFactorRequiredScreen` from `@/pages/two-factor-required`; route `twoFactorRequiredRoute` at `/two-factor-required` with search `{ stage?: "done" }` (typed `navigate({ to: "/two-factor-required", search: { stage: "done" } })` works for Task 4).

- [ ] **Step 1: Failing specs**

`two-factor-required-page.spec.tsx` (props-only page):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorRequiredPage } from "./two-factor-required-page";

const props = { username: "a.ivanova", onSignOut: vi.fn(), signingOut: false };

describe("TwoFactorRequiredPage", () => {
  it("gate: says why, lists the three steps, and offers setup and sign-out", async () => {
    render(<TwoFactorRequiredPage {...props} stage="gate" />);
    expect(screen.getByRole("heading", { level: 1, name: "Set up two-factor to continue" })).toBeInTheDocument();
    expect(screen.getByText("two-factor required")).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Open an authenticator app",
      "Scan the code and confirm six digits",
      "Save the recovery codes",
    ]);
    expect(screen.getByRole("link", { name: "Set up two-factor" })).toHaveAttribute("href", "/account/two-factor");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(props.onSignOut).toHaveBeenCalled();
  });

  it("done: says it is on and continues to the territories", () => {
    render(<TwoFactorRequiredPage {...props} stage="done" />);
    expect(screen.getByRole("heading", { level: 1, name: "You're all set" })).toBeInTheDocument();
    expect(screen.getByText("two-factor on")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to territories" })).toHaveAttribute("href", "/territories");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows who is signed in, with no menu", () => {
    render(<TwoFactorRequiredPage {...props} stage="gate" />);
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("disables sign-out while it runs", () => {
    render(<TwoFactorRequiredPage {...props} stage="gate" signingOut />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  });
});
```

(Check the list-item assertion against your markup — the step title is the first `<p>` in each `<li>`; adjust the query if the markup differs, keeping the assertion on the three titles in order.)

`two-factor-required-screen.spec.tsx`: mock `@tanstack/react-query`'s `useQuery` (or seed a `QueryClient` with `meQuery` data inside a provider) and `@/features/sign-out`'s `useSignOut`; assert: a principal with `totpRequired: true, totpEnabled: false` renders the gate h1; `totpEnabled: true` renders the done h1; the Sign out button calls the mocked `signOut`. Follow the mocking style of an existing screen spec (e.g. `pages/two-factor/ui/two-factor-screen.spec.tsx`).

- [ ] **Step 2: Run, see them fail**

Run: `cd frontend && yarn vitest run src/pages/two-factor-required`
Expected: FAIL — modules missing.

- [ ] **Step 3: The page**

`ui/two-factor-required-page.tsx` — props only:

```tsx
export type TwoFactorRequiredStage = "gate" | "done";
export type TwoFactorRequiredPageProps = {
  stage: TwoFactorRequiredStage;
  username: string;
  onSignOut: () => void;
  signingOut: boolean;
};
```

Layout, per spec § The screen:
- Root: `flex min-h-dvh flex-col gap-10 bg-bg px-4 pb-14 pt-8 text-fg sm:px-8`.
- `<header>`: `flex flex-wrap items-center justify-between gap-5`. Left: `<span>` `Andrey Viewer` — `font-mono text-[10px] uppercase tracking-[0.24em] text-accent`. Right: `flex flex-wrap items-center gap-[9px]` with `<ThemeToggle variant="compact" />` and the identity chip `<span>`: `flex items-center gap-[9px] rounded-full border border-line-2 bg-panel py-[5px] pl-[5px] pr-[13px]` holding `<Avatar name={username} size={28} variant=… />` (pick the `AvatarVariant` whose skin in `avatar.tsx` is accent border + accent-soft ground; if none matches, the closest accent one) and `<span className="text-xs font-medium">{username}</span>`.
- `<main className="flex flex-1 items-center justify-center">` holding one `<section>`: `w-full max-w-[560px] overflow-hidden rounded-2xl border bg-panel shadow-elevation`, border colour per stage: `border-accent-line` (gate) / `border-ok` (done) — chosen in one expression, one border-colour utility on the element.
- Card head (`flex flex-col gap-3.5 px-[30px] pb-6 pt-[30px]`; done: `p-[30px]`): row `flex items-center gap-2.5` = icon tile (`flex size-[38px] items-center justify-center rounded-control-lg border` + gate `border-accent bg-accent-soft text-accent` / done `border-ok bg-ok-soft text-ok`, holding `<Icon name="lock" size={18} />` / `<Icon name="check" size={18} />`) + `<Badge tone="accent" fill="outline" size="status">two-factor required</Badge>` / `<Badge tone="ok" size="status">two-factor on</Badge>`; then `<h1 className="m-0 mt-1 text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-balance">`; then `<p className="m-0 max-w-[50ch] text-sm leading-[1.6] text-pretty text-muted">`.
- Gate steps: `<ol className="m-0 flex list-none flex-col px-[30px] pb-6">`, three `<li className="grid grid-cols-[28px_1fr] items-start gap-3 border-t border-line py-[13px] last:border-b">` — number `<span aria-hidden="true" className="pt-px font-mono text-[11px] text-accent">01</span>` (the list already numbers itself for a screen reader), then `<div><p className="m-0 text-[13px] font-semibold">title</p><p className="m-0 mt-[3px] text-xs leading-[1.5] text-muted">detail</p></div>`. Steps as a `const STEPS = [...] as const` array mapped once.
- Footer: `flex flex-wrap items-center gap-3 border-t border-line bg-panel-2 px-[30px] py-[18px]`, `justify-between` (gate) / `justify-end` (done) — one justify utility, chosen per stage.
  - gate: `<button type="button" onClick={onSignOut} disabled={signingOut} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-muted transition-[color,scale] duration-150 ease-out hover:text-fg enabled:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed">Sign out</button>` and `<a href="/account/two-factor" className={`${linkButtonClass("primary")} gap-2`}>Set up two-factor<Icon name="arrow-right" size={14} /></a>`.
  - done: `<a href="/territories" className={linkButtonClass("primary")}>Continue to territories</a>`.

`ui/two-factor-required-screen.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/entities/user";
import { useSignOut } from "@/features/sign-out";
import { mustEnroll } from "@/shared/session";
import { TwoFactorRequiredPage } from "./two-factor-required-page";

/**
 * The route leaf. The route's beforeLoad has already sent everyone who
 * belongs elsewhere away (no session → /login; enrolled without ?stage=done → /),
 * so what is left is the gate while enrolment is owed, "done" once it is not.
 */
export function TwoFactorRequiredScreen() {
  const me = useQuery(meQuery).data;
  const { signOut, pending } = useSignOut();
  if (!me) return null;
  return (
    <TwoFactorRequiredPage
      stage={mustEnroll(me) ? "gate" : "done"}
      username={me.username}
      onSignOut={() => void signOut()}
      signingOut={pending}
    />
  );
}
```

`index.ts`: `export { TwoFactorRequiredScreen } from "./ui/two-factor-required-screen";` and `export { TwoFactorRequiredPage, type TwoFactorRequiredPageProps } from "./ui/two-factor-required-page";`

`two-factor-required.fixture.tsx`: `{ gate: <TwoFactorRequiredPage stage="gate" username="a.ivanova" onSignOut={() => {}} signingOut={false} />, done: <… stage="done" … /> }` — full-page fixtures, no padding wrapper.

- [ ] **Step 4: The route**

`routes.tsx` — a root child beside `loginRoute`:

```tsx
// Outside every shell, like the 404: the page draws its own header, and a
// session that owes a second factor can load nothing a shell would ask for.
export const twoFactorRequiredRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/two-factor-required",
  validateSearch: (search: Record<string, unknown>): { stage?: "done" } =>
    search.stage === "done" ? { stage: "done" } : {},
  beforeLoad: async ({ context, location, search }) => {
    const target = redirectTarget(isAuthed(), location.href);
    if (target) throw redirect(target);
    const me = await context.queryClient.ensureQueryData(meQuery);
    // Enrolled: "done" is the one reason to be here; anything else goes home.
    if (!mustEnroll(me) && search.stage !== "done") throw redirect({ to: "/" });
  },
  component: TwoFactorRequiredScreen,
});
```

Register it in `router.tsx`'s `rootRoute.addChildren([...])`. Add `"/two-factor-required"` to `CATALOG_PATHS` in `guard.ts` so the done card's and wizard's in-app links route in the SPA; confirm `isTerritoryPage` and `isCatalogHref` specs still hold and add one `isCatalogHref("/two-factor-required?stage=done")` → true case to `guard.spec.ts`.

- [ ] **Step 5: Run; lint; line counts**

Run: `cd frontend && yarn vitest run src/pages/two-factor-required src/app/router src/architecture.spec.ts src/fixtures.spec.tsx && yarn lint`
Expected: PASS, lint 0. Page file under 200 lines (`grep -cvE '^\s*($|//|/\*|\*)' …`).

- [ ] **Step 6: Look at it** — Cosmos you start yourself (a new fixture file needs a restart; kill only your PID): both cards, dark and light, 1440 and 375. Compare with the mock: centred card, 560 max, step rows with rules, footer on `panel-2`.

- [ ] **Step 7: Commit** `feat(two-factor-required): the gate and done screen, on its own route` — all created files plus `routes.tsx router.tsx guard.ts guard.spec.ts`.

---

### Task 3: Confine a must-enroll principal

**Files:**
- Modify: `frontend/src/app/router/guard.ts` (+ `guard.spec.ts`)
- Modify: `frontend/src/app/router/catalog-routes.tsx` (`catalogRoute.beforeLoad`)
- Modify: `frontend/src/app/router/routes.tsx` (`consoleRoute.beforeLoad`)
- Test: `frontend/src/app/router/router.spec.tsx`

**Interfaces:**
- Consumes: `mustEnroll`, `ENROLLMENT_PATH` (Task 1); route `/two-factor-required` (Task 2).
- Produces: `enrollmentRedirect(me: Principal, pathname: string): "/two-factor-required" | null` in `guard.ts`.

- [ ] **Step 1: Failing specs**

`guard.spec.ts`:

```ts
const PRINCIPAL: Principal = {
  id: "u-1", email: "a.ivanova@example.com", username: "a.ivanova", status: "active",
  totpEnabled: false, totpRequired: false, passkeyEnabled: null,
  roleSlugs: [], roleTitles: {}, permissions: [], isOwner: false, onboardingToursSeen: [],
};

describe("enrollmentRedirect", () => {
  const owes = { ...PRINCIPAL, totpRequired: true, totpEnabled: false };
  it.each(["/", "/territories", "/territories/x", "/models", "/account", "/console", "/console/users"])(
    "sends a principal that must enroll from %s to the gate",
    (path) => expect(enrollmentRedirect(owes, path)).toBe("/two-factor-required"),
  );
  it.each(["/two-factor-required", "/account/two-factor"])("lets it through at %s", (path) =>
    expect(enrollmentRedirect(owes, path)).toBeNull(),
  );
  it("never redirects an account that owes nothing", () => {
    expect(enrollmentRedirect({ ...PRINCIPAL, totpRequired: true, totpEnabled: true }, "/")).toBeNull();
    expect(enrollmentRedirect({ ...PRINCIPAL, totpRequired: false, totpEnabled: false }, "/")).toBeNull();
  });
});
```

(`guard.spec.ts` has no principal literal today; import `type Principal` from `@/shared/session`.)

`router.spec.tsx` — reuse `renderAt`, but let the case choose the principal (add a second parameter defaulting to the existing `me`):

```tsx
  // A session that owes a second factor can open nothing but the gate and the
  // wizard; everything else 403s at the gateway, so the router sends it on.
  it.each(["/", "/territories", "/console/users"])("confines a must-enroll principal at %s", async (path) => {
    renderAt(path, { ...me, totpRequired: true, totpEnabled: false });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
    ).toBeInTheDocument();
  });

  it("lets a must-enroll principal open the wizard", async () => {
    renderAt("/account/two-factor", { ...me, totpRequired: true, totpEnabled: false });
    expect(await screen.findByRole("heading", { level: 1, name: "Enable two-factor" })).toBeInTheDocument();
  });

  it("sends an enrolled principal away from the gate", async () => {
    renderAt("/two-factor-required", me);
    expect(await screen.findByRole("heading", { level: 1, name: /Territories and models/ })).toBeInTheDocument();
  });
```

(Adjust the last case's expected heading to whatever Home renders as its h1 in this test setup — fetch is stubbed to hang, so assert on something Home draws before data, or assert `router.state.location.pathname === "/"` instead. The wizard's `setup` POST also hangs here — that is fine for asserting its h1.)

- [ ] **Step 2: Run, see them fail**

Run: `cd frontend && yarn vitest run src/app/router`
Expected: FAIL — `enrollmentRedirect` missing; gate never reached.

- [ ] **Step 3: Implement**

`guard.ts`:

```ts
/** Where a principal that owes a second factor may stand: the gate, and the wizard. */
const ENROLLMENT_OPEN = [ENROLLMENT_PATH, "/account/two-factor"] as const;

/**
 * The gateway answers everything else `403 twofa_enrollment_required` for this
 * session, so a screen there is a dead end. Exact paths, like the gateway's
 * own allow-list: a prefix would open whatever is added under them later.
 */
export function enrollmentRedirect(me: Principal, pathname: string): typeof ENROLLMENT_PATH | null {
  if (!mustEnroll(me)) return null;
  return (ENROLLMENT_OPEN as readonly string[]).includes(pathname) ? null : ENROLLMENT_PATH;
}
```

`catalogRoute.beforeLoad` and `consoleRoute.beforeLoad` become async; after the existing marker check:

```ts
    // beforeLoad, not loader: children's loaders run beside the parent's, and
    // the console index's landing redirect would race this one.
    const to = enrollmentRedirect(await context.queryClient.ensureQueryData(meQuery), location.pathname);
    if (to) throw redirect({ to });
```

Keep their loaders as they are (they now hit the cache).

- [ ] **Step 4: Run; lint**

Run: `cd frontend && yarn vitest run src/app src/architecture.spec.ts src/fixtures.spec.tsx && yarn lint`
Expected: PASS, lint 0.

- [ ] **Step 5: Commit** `feat(router): confine a session that owes a second factor to the gate` — `guard.ts guard.spec.ts catalog-routes.tsx routes.tsx router.spec.tsx`.

---

### Task 4: The wizard's exits follow the principal

**Files:**
- Modify: `frontend/src/pages/two-factor/model/use-two-factor.ts` (+ `use-two-factor.spec.tsx`)
- Modify: `frontend/src/pages/two-factor/ui/two-factor-page.tsx` (+ `two-factor-page.spec.tsx`)
- Modify: `frontend/src/pages/two-factor/two-factor.fixture.tsx` (and any other fixture/spec building `TwoFactorPageProps`)

**Interfaces:**
- Consumes: `mustEnroll` (Task 1); route `/two-factor-required` with search `{ stage: "done" }` (Task 2).
- Produces: `TwoFactorState.exit: { href: string; short: string; long: string }`.

- [ ] **Step 1: Failing specs**

`use-two-factor.spec.tsx` (it already mocks navigate and seeds `me` — follow its setup):
- a principal with `totpRequired: true, totpEnabled: false`: `exit` is `{ href: "/two-factor-required", short: "Overview", long: "Back to the overview" }`; `onCancel()` navigates `{ to: "/two-factor-required" }`.
- same principal, flow `enable`, after a successful confirm: `onDone()` navigates `{ to: "/two-factor-required", search: { stage: "done" } }`.
- a free principal (`totpRequired: false`): `exit` is `{ href: "/account", short: "Account", long: "Back to your account" }`; `onDone()` and `onCancel()` navigate `{ to: "/account" }` (unchanged behaviour).
- flow `regenerate` with `totpRequired: true, totpEnabled: true`: `onDone()` goes to `/account` (regenerating is not enrolling).

`two-factor-page.spec.tsx`: with `exit={{ href: "/two-factor-required", short: "Overview", long: "Back to the overview" }}` the top link reads `← Overview` and points there; in the setup-error state the back link reads `Back to the overview`. Existing cases pass the free `exit` and keep their assertions.

- [ ] **Step 2: Run, see them fail**

Run: `cd frontend && yarn vitest run src/pages/two-factor`
Expected: FAIL.

- [ ] **Step 3: Implement**

`use-two-factor.ts`:

```ts
const ACCOUNT_EXIT = { href: "/account", short: "Account", long: "Back to your account" } as const;
// While the gate holds, /account is a page this session cannot open.
const GATE_EXIT = { href: ENROLLMENT_PATH, short: "Overview", long: "Back to the overview" } as const;
```

Add `exit: { href: string; short: string; long: string }` to `TwoFactorState`. In the hook:

```ts
  const exit = mustEnroll(me) ? GATE_EXIT : ACCOUNT_EXIT;
  // An account that is required to carry 2FA finishes on the gate's "done"
  // card; `totpRequired` is policy and does not change when enrolment lands.
  const done = () =>
    void (flow === "enable" && me?.totpRequired
      ? navigate({ to: "/two-factor-required", search: { stage: "done" } })
      : navigate({ to: "/account" }));
```

Return `exit`, `onDone: done`, `onCancel: () => void navigate({ to: exit.href })` — if the typed `navigate` rejects a `string` `to`, branch on the two literals instead. Remove the old `leave`.

`two-factor-page.tsx`: the top link → `href={s.exit.href}` and text `← {s.exit.short}`; the setup-error "Back to your account" link → `href={s.exit.href}` and text `{s.exit.long}`. Update every `TwoFactorPageProps` literal (fixture, specs) with the free `exit`.

- [ ] **Step 4: Full gate**

Run: `cd frontend && yarn lint && yarn test:coverage`
Expected: lint 0; all tests pass; thresholds 90/85/90/90 hold.

- [ ] **Step 5: Commit** `feat(two-factor): the wizard leads a gated account back to the gate and on to done` — the modified files.

---

### Task 5: Live verification (Playwright, local stack)

No product code. Proves the whole flow against the running gateway (`127.0.0.1:8080`, compose stack) through `yarn dev` (port 3000 if the user's server is up — it proxies `/api`; otherwise start your own on a free port and kill only its PID). Python Playwright is installed (`python3 -c "import playwright"`). Work in the session scratchpad.

**Accounts:** root `admin` / `change-me-now`. Login body `{"identifier","password"}`; mutations need `X-CSRF-Token` from the login JSON's `csrfToken`. `enroll1` (password `Passw0rd!2026`, role `admin`, `totpRequired: true`) exists from the investigation. If it has since enrolled, reset it as root: `POST /api/auth/users/{id}/2fa/unrequire`, then create a fresh user `enroll<N>` (`POST /api/auth/users {email, username, password, roleSlugs:["admin"]}`) and `POST /api/auth/users/{id}/2fa/require`.

**TOTP without dependencies** (RFC 6238, SHA-1, 30 s, 6 digits):

```python
import base64, hmac, hashlib, struct, time
def totp(secret_b32: str, t: float | None = None) -> str:
    key = base64.b32decode(secret_b32.upper() + "=" * (-len(secret_b32) % 8))
    counter = struct.pack(">Q", int((t or time.time()) // 30))
    h = hmac.new(key, counter, hashlib.sha1).digest()
    o = h[-1] & 0x0F
    return f"{(struct.unpack('>I', h[o:o+4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"
```

Read the secret from the `POST /api/auth/2fa/setup` response (`page.on("response")`, JSON `secret`), or from the "Can't scan? Show manual key" text.

- [ ] **Step 1:** Sign in as the gated user via the UI. Expect the URL `/two-factor-required` and the h1 `Set up two-factor to continue`; record every `/api/*` response — none may be 403.
- [ ] **Step 2:** `goto` `/`, `/territories`, `/console/users`, `/account` → each ends on `/two-factor-required`, no 403 in the log.
- [ ] **Step 3:** Sign out from the gate → `/login`. Sign in again.
- [ ] **Step 4:** "Set up two-factor" → wizard. "← Overview" returns to the gate. Enter the wizard again, type the TOTP code, confirm → codes stage → finish → `/two-factor-required?stage=done`, h1 `You're all set`. "Continue to territories" → `/territories` renders its catalog (h1 present, no Callout "unavailable", `/api/territories` 200).
- [ ] **Step 5 (mid-session):** create a second user, sign them in (Playwright context B), open `/territories` (200). As root, require 2FA of them. In context B trigger any request (reload the list or navigate in-app) → lands on `/two-factor-required`.
- [ ] **Step 6:** screenshots (1440 and 375, dark and light) of gate and done into the scratchpad; compare to the mock.
- [ ] **Step 7:** leave the stack clean: unrequire and delete the throwaway users you created in Step 5 (keep `enroll1` — the user checks by hand with it; say its state in the report). Report every step's result with the evidence (URLs, status lines, screenshot paths).

## Out of scope

Backend changes; passkey-only accounts (gated by the backend's rule); the wizard's reload-during-codes 422 dead end.
