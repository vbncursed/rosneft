# frontend-v2 → gateway wiring — design

Date: 2026-09-02
Status: draft, awaiting review

## Problem

`frontend-v2` is eight finished screens that fetch nothing. Every page takes its
data and its callbacks as props, which is what made them testable and
browsable — and also what leaves them inert. This spec covers giving them a
router, a session and live data from the gateway.

Scope is **development only**: `yarn dev` on port 3001, `/api` proxied to the
gateway on 8080, which `vite.config.ts` already does. No nginx location, no
Docker stage, no deploy. Those come when v2 is a candidate to replace v1, which
it is not yet — the catalogs, the home screen, the upload forms and the 3D
viewer exist only in `Andrey Viewer Mockup.dc.html` and have no v2.

## What is being wired

| Screen | Gateway |
| --- | --- |
| Login | `POST /api/auth/login`, `POST /api/auth/login/2fa`, `GET /api/auth/me`, `POST /api/auth/passkey/login/{begin,finish}`, `POST /api/auth/logout` |
| Users | `GET/POST /api/auth/users`, `GET/PATCH/DELETE /api/auth/users/{id}`, `POST .../{freeze,unfreeze,restore,owner}`, `GET /api/auth/roles` for role titles |
| Roles | `GET/POST /api/auth/roles`, `GET/PATCH/DELETE /api/auth/roles/{slug}`, `PUT /api/auth/roles/{slug}/permissions`, `GET /api/auth/permissions` |
| Content | `GET /api/territories`, `GET /api/models`, `PATCH`/`DELETE` on each, `POST /api/territories/{slug}/source`, `GET /api/jobs/{id}/events` (SSE) for the conversion stage |
| Territory access | `GET /api/territories`, `GET/PUT /api/territories/{slug}/admins`, `GET /api/auth/users` to name the ids |
| Audit | `GET /api/audit` (cursor-paged), `GET /api/audit/actors`, `GET /api/audit.csv` |
| Metrics | `GET /api/metrics/query?panel=…&range=…` |

Two screens carry a decision worth stating rather than discovering:

**Territory access is a Root screen.** `/api/territories/{slug}/admins` is
Root-only by design. The screen's per-person grants map onto
`territory_assignments` exactly as it stands: `scopeOwningAdmin` keys a guest's
scope to their own id and everyone else's to their tenant admin, so one row is a
grant to a single person or to a whole company depending on whose id it holds.
The mock's three-way visibility switch has nothing behind it and **is not
rendered**; the access model is deliberate and stays as written.

**Metrics is owner-only** and answers 403 to a non-owner with a valid session.
The screen is reachable only when `/api/auth/me` reports the owner flag.

## Actions with no endpoint

Not rendered, rather than rendered and inert. A control that does nothing
teaches the operator that the console lies.

- Users → *Reset password*: dropped by product decision.
- Users → *Require 2FA*: arrives with the companion spec
  (`2026-09-02-required-two-factor-and-15m-range-design.md`); the button is
  wired in the same pass that ships it.
- Content → *Cancel job*: deferred, needs a proto change and a cooperating
  worker.
- Metrics → *Silence alert*: deferred, needs Alertmanager, which is not
  deployed.

Anything leading to a screen v2 does not have — *Open in viewer*, the entity
links in Audit, *Upload territory/model* — is an absolute link into the old SPA.
Same origin, same cookie, so it just works.

## Layout

The data layer of `frontend/` already speaks to this gateway and encodes things
that cost a production incident to learn. It is ported, not reinvented — but
re-laid out for Feature-Sliced Design rather than copied with its Clean
Architecture folders.

```
src/
  shared/api/          http client (+CSRF), http-error, query client,
                       dto.ts (generated), asset-url
  shared/session/      session marker, principal + permission predicates
  app/router/          route tree, guard
  app/providers/       QueryClientProvider + RouterProvider
  entities/*/api/      one gateway per entity + DTO→model mappers
  pages/*/model/       one container hook per screen: queries, mutations,
                       UI state; returns exactly the page's props
```

The pages themselves are not touched. A container hook returning the page's own
prop type is what keeps that true, and keeps the Cosmos fixtures working — they
feed the same props by hand.

### What the port must carry over verbatim

- **No `Authorization` header.** The session is an httpOnly cookie and the SPA
  is single-origin with the API in dev and prod. This is not a preference: it
  is what lets the cookie ride on `<img>`, the pdf.js `<iframe>` and three.js
  loader requests, none of which can carry a header.
- **`X-CSRF-Token` on mutations only**, fetched lazily so the normal path pays
  nothing. Bearer callers are exempt by construction; cookie callers are not.
- **401 → drop the session marker and bounce to `/login?next=…`**, except when
  already on `/login`, where a bad password also 401s and must surface as an
  error rather than a redirect loop.
- **ETag/304 comes free.** Every JSON GET carries a strong ETag; React Query's
  cache plus the browser's revalidation is why no hand-rolled cache is being
  written.

## Routing

TanStack Router, as in production. Not for familiarity: Audit and Content own
filter state that belongs in the URL, and typed search params are the reason to
take a router rather than a `switch` over `location.pathname`.

```
/login
/console/users   /console/roles    /console/content
/console/access  /console/audit    /console/metrics
```

The guard reads the session marker in `localStorage` and redirects to `/login`
with `?next=`. The marker is a marker, never a credential — the cookie is the
credential, and the guard exists so a signed-out visitor sees the login screen
instead of a flash of console chrome followed by a 401.

`/console` alone redirects to the first screen the caller's permissions allow,
which is also how a non-owner never lands on Metrics and takes a 403.

## Loading, empty and error states

The screens already have the vocabulary; the containers must use it rather than
inventing a second one.

- **"Loading" and "unavailable" are different states.** Collapsing them hides
  an outage behind a spinner.
- **An inspector is absent until its data has arrived** — never half-empty.
- **A list that matches nothing answers with a sentence**, not a blank frame.
- **A mutation reports through a toast** and rolls the row back on failure.
  `HttpError` carries the gateway's own message; 403 gets the standing
  "You don't have permission to do this".

## Testing

`src/architecture.spec.ts` is not advisory here — it will fail the build:

- **Every non-barrel module needs a neighbouring `*.spec.ts(x)`.** Every
  gateway, every mapper, every container hook. Gateways are tested against a
  `fetch` stub; mappers are pure and unit-tested; containers go through
  `renderHook`.
- **Every slice rendering JSX needs a `*.fixture.tsx`.**
- **Cross-slice imports go through `index.ts`**, and layer imports point inward
  only: `shared → entities → features → widgets → pages → app`.
- Wiring carrying no decision — the route tree, the providers, the generated
  `dto.ts` — joins `main.tsx` in the spec's `EXEMPT` set. Anything with a
  decision in it (the guard, the 401 branch, the enrollment redirect) is a pure
  function with its own spec instead. That is the same rule the desktop crate
  follows and for the same reason.
- `yarn lint` is `tsc -b --noEmit && oxlint`. Keep the `-b`: the root
  `tsconfig.json` is solution-style, so a bare `tsc --noEmit` compiles an empty
  set and passes whatever is in `src`.

DTOs are generated from the gateway's own contract:

```
openapi-typescript ../backend/services/gateway-service/api/openapi.yaml \
  -o src/shared/api/dto.ts
```

as `yarn openapi:generate`, exactly as `frontend/` does it. Generated output is
an implementation detail: DTO types never leave `entities/*/api`, and the rest
of the app sees domain models only.

## New dependencies

`@tanstack/react-router`, `@tanstack/react-query`, and `openapi-typescript` as a
dev dependency. Installed with **yarn** — a stray `npm` leaves a
`package-lock.json` describing something nobody installed.

## Order of work

Each step ends green: `yarn lint`, `yarn test`, and the screen usable against a
local gateway.

1. **Foundation and login.** `shared/api`, `shared/session`, DTO generation,
   query client, router skeleton, guard, and the Login screen end to end —
   password, 2FA, passkey, logout, `?next=`. Nothing else can be verified until
   a session exists.
2. **Users and Roles.** One auth-domain gateway serves both, and Roles is the
   screen with real mutation shape (permission matrix, rename, reset, save).
3. **Content and Territory access.** Catalog domain, plus the SSE subscription
   for conversion stage.
4. **Audit and Metrics.** Cursor paging and CSV export; then the panel queries,
   which are read-only and the least entangled.

## Deferred

The catalogs, home, upload forms and 3D viewer have no v2 design and are not in
scope; links reach the old SPA instead. Deployment of v2 is not in scope. Cancel
job, silence alert, and admin password reset are covered in the companion
spec's *Deferred* section.
