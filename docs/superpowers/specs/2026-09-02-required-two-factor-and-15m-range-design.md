# Required two-factor and the 15m metrics range — design

Date: 2026-09-02
Status: approved, ready for planning

## Problem

Two of the `frontend-v2` console screens draw controls the gateway cannot
serve. This is the smaller of the two backend gaps found while planning that
wiring; the rest were deferred (see *Deferred* below).

- **Users** offers a **Require 2FA** action. Nothing in the backend expresses
  "this account must use a second factor". `auth-service` asks
  `twofa.IsEnabled` at login and branches on the answer — a fact about the
  account, never a policy over it.
- **Metrics** offers a **15m** range. The server-side allow-list is
  `1h / 6h / 24h / 7d`, so the shortest window the dashboard draws is rejected
  with a 400.

The two are unrelated in every way but their origin. They share a spec because
each alone is too small to be worth its own cycle.

## Part 1 — the 15m range

`internal/metrics/query.go` holds the allow-list:

```go
// rangeSeconds is the allow-list of dashboard ranges → window in seconds.
var rangeSeconds = map[string]int{ ... }
```

Add `"15m": 900`, and `15m` to the `range` enum in
`api/openapi.yaml`. Nothing else moves:

- **Step derivation already handles it.** `stepSeconds` keeps ~200 points
  rounded to whole 15s scrapes: `round(900/200/15)*15 = 0`, and the
  `max(scrapeSeconds, …)` floor lifts that to one scrape. A 15-minute window
  therefore returns 60 points at 15s — denser than the other ranges relative to
  their window, which is the point of a short range.
- **No client change.** `frontend-v2` already types `MetricsRange` with `15m`
  (`src/pages/metrics/model/range.ts`); `frontend/`'s panel catalog is
  untouched and keeps offering the four it knows.

The existing `query_test.go` loops windows `{3600, 21600, 86400, 604800}` and
asserts the step is a whole number of scrapes. Extend the loop with `900`
rather than adding a case: the property is the same one.

## Part 2 — required two-factor

### Where the flag lives

`auth-service` owns the `users` table, so the flag goes there:

```sql
ALTER TABLE users ADD COLUMN totp_required BOOLEAN NOT NULL DEFAULT FALSE;
```

as migration `00016_totp_required.sql`, with `domain.User.TOTPRequired` beside
`Status` and `IsOwner`.

**It does not go in `twofa-service`.** That service answers whether a second
factor *is* enrolled; this column says whether one *must* be. Keeping fact and
policy in separate services is what lets the account screen keep telling
"enabled", "not enabled" and "we could not find out" apart — collapsing them
into one service would make a `twofa-service` outage indistinguishable from a
user who has not enrolled, which is the tri-state bug the frontend rule already
warns about.

### Setting it

`freeze` / `unfreeze` / `restore` / `owner` are each their own action endpoint
rather than fields on `UpdateUserRequest`, which carries roles only. Follow
that:

```
POST /api/auth/users/{id}/2fa/require     → 200 AuthUser
POST /api/auth/users/{id}/2fa/unrequire   → 200 AuthUser
```

Behind `users:write`, the grant that already carries every other change to
another account. Both are audited exactly as `freeze` is, and both are
idempotent — requiring an already-required account is a 200, not a 409, because
the caller's intent is a state, not a transition.

Self-targeting is **allowed** here, unlike freeze and delete: those guard
against an admin locking themselves or the last owner out, while requiring a
second factor of yourself is a hardening step with no lock-out (the enrollment
path below stays open to the flagged user). No last-owner guard applies.

### Enforcing it

This is the part that carries the risk. Login today
(`internal/service/auth/login.go`) ends in two branches:

```go
if enabled { challenge := PutPending(...); return "", challenge, nil }
token := issue(...); return token, "", nil
```

Add a third, for `required && !enabled`: **issue a session, and mark it
enrollment-pending.** The gateway then refuses that session every route except
an allow-list:

```
/api/auth/me
/api/auth/logout
/api/auth/2fa/setup
/api/auth/2fa/enable
/api/auth/2fa/recovery/regenerate
```

Refusal is **403 with code `twofa_enrollment_required`** — a distinct code, not
a bare 403, so the SPA routes to the enrollment screen instead of showing its
generic "you don't have permission" copy. `/api/auth/2fa/enable` clears the
flag on the session as its last step.

**The gate is keyed on the request path against that allow-list, checked before
anything else, and it denies by default.** A route added later is refused until
someone deliberately lists it. This is the same shape as — and is written for
the same reason as — the desktop shell's nonce gate, which classified the
request first and consequently waved the entire authenticated API through.

**Alternative rejected:** return a *setup* challenge from `login` and teach
`/api/auth/2fa/setup` and `/enable` to accept a challenge as well as a session.
It avoids a new session state, but spreads a second authentication path across
three endpoints that today understand only sessions — two ways to authenticate
the enrollment endpoints is a larger security surface than one way to restrict a
session.

### Blast radius on the live SPA

The column defaults to `FALSE`, so no existing session or login changes
behaviour. But `frontend/` is in production and **has no enrollment screen**:
the moment an admin flags a user there, that user meets a 403 they cannot act
on and is locked out of v1.

The sequencing is therefore part of the design, not an afterthought:

1. Ship this backend change. The flag exists and nothing sets it.
2. Wire the `frontend-v2` Users screen so the action can be issued, and its
   enrollment screen so a flagged user can act on the code.
3. Only then set the flag on a real account.

Until step 3, `POST .../2fa/require` is reachable by an admin and will lock a v1
user out. If that is not acceptable, gate the endpoint behind the owner flag
until v2 ships; this spec does not, because the console that exposes it is
itself Root-facing.

### Tests

- **Pure:** the allow-list decision (`path → allowed`) as a plain function over
  a string, unit-tested. The middleware calls it and holds no logic of its own —
  the repo's standing rule that a decision needing a test goes in a pure
  function, and the reason `dispatch()` and `allowed()` exist in the desktop
  crate.
- **Not only the predicate.** A pure predicate is not a route test: the desktop
  shell shipped a vulnerability with `allowed()` correct and its caller passing
  the wrong input. Drive the real router — an enrollment-pending session gets
  403 on `/api/territories` and 200 on `/api/auth/2fa/setup`.
- **Login:** `required && !enabled` → pending session; `required && enabled` →
  challenge, unchanged; `!required` → unchanged. Three table rows.
- **Endpoints:** require/unrequire are idempotent, audited, and refused without
  `users:write`.
- **Migration:** up and down.

## Deferred, with reasons

Named here so the next session does not rediscover them:

- **Admin password reset** — dropped by decision; not planned as a product
  feature.
- **Cancel job** — `mesh.v1` has no `JOB_STATUS_CANCELLED`; it needs a proto
  change, a worker that cooperates with an abort, and a reconciler that
  understands the new terminal state. Its own spec, later.
- **Silence alert** — alerts are read as `ALERTS{alertstate=~"firing|pending"}`
  straight from Prometheus, which is a read-only view. Silencing needs
  Alertmanager, which is not deployed anywhere in this repository. Its own
  spec, later.
- **Territory visibility / per-person grants** — investigated and dropped: the
  access model already expresses both. `scopeOwningAdmin` keys a guest's scope
  to their own id and everyone else's to their tenant admin, so a row in
  `territory_assignments` is a grant to one person or to a whole company
  depending on whose id it holds. The screen maps onto that; the model stays.
