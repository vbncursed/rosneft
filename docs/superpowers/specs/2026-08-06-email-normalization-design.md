# Email normalization — design

Date: 2026-08-06
Status: approved, ready for planning

## Problem

A production account was created as `Ernest.sayapov@gmail.com`. Email casing
carries no meaning — every mail provider folds it — so the stored form should be
lower-case, and the UI should make an upper-case one impossible to type.

## What already works, and why the scope is smaller than it looks

`users.email` and `users.username` are `CITEXT UNIQUE`
(`auth-service/internal/migrate/migrations/00001_init.sql`). Two consequences
that must not be re-solved:

- **Login is already case-insensitive.** `Store.GetByIdentifier`
  (`internal/storage/users/get.go`) compares through citext, so
  `Ernest.sayapov@…` and `ernest.sayapov@…` reach the same row today.
- **A case-variant duplicate cannot be inserted.** The UNIQUE index is
  case-insensitive, so `users_email_key` already rejects it.

The gap is therefore confined to the **stored and displayed** value: the admin
console, `/account`, and the audit journal's `entity_label` all show whatever
casing was typed.

## Defect found during analysis

`internal/service/auth/login.go` keys brute-force throttling on the raw
identifier:

```go
locked, err := s.sessions.IsLocked(ctx, identifier)
_ = s.sessions.RegisterFail(ctx, identifier)
_ = s.sessions.ClearFails(ctx, identifier)
```

Case variants produce independent counters against the same account, so an
attacker multiplies the attempt budget by permuting case. The password check
itself resolves to one user via citext, so the variants are not separate
accounts — only separate counters.

The fix is the same normalization this feature introduces, in the same file, so
it ships here rather than as a separate task.

## Design

### 1. One folding function in the domain

New file `auth-service/internal/domain/email.go`:

```go
// Fold mirrors in Go what the citext columns (users.email, users.username)
// already do in Postgres: compare case-insensitively. Applying it before a
// write makes the stored form match the compared form.
func Fold(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
```

Named `Fold`, not `NormalizeEmail`, because the third call site folds a login
identifier that may be a username. One function, three call sites, no duplicated
rule.

`TrimSpace` is not cosmetic: a clipboard-pasted `" ernest@… "` currently fails
`mail.ParseAddress` on create and misses the row on login.

### 2. Both write paths

Email reaches the database through exactly two paths. Verified by grepping every
caller of `store.Create`:

| Site | Change |
| --- | --- |
| `internal/service/users/create.go` | `email = domain.Fold(email)` **before** `validate.Email(email)` |
| `internal/bootstrap/service.go` | `Email: domain.Fold(cfg.BootstrapEmail)` |

`EnsureBootstrapAdmin` calls `store.Create` directly, bypassing the service
layer. Normalizing only the service would leave the first admin on every fresh
environment mixed-case — the shape of bug this feature exists to remove.

`internal/service/users/update.go` needs no change: it takes email and username
into `_, _` and ignores them by design, so there is no post-creation edit path.

### 3. Login identifier

In `internal/service/auth/login.go`, fold once immediately after the empty
check, then use the folded value for `IsLocked`, `RegisterFail`, `ClearFails`,
and `GetByIdentifier`. Folding for the lookup too is redundant against citext
but makes the trimmed form actually resolve, and keeps one variable rather than
two.

### 4. Backfill migration

`auth-service/internal/migrate/migrations/00014_lowercase_emails.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
UPDATE users SET email = lower(email::text)
WHERE email::text <> lower(email::text);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;  -- irreversible: the original casing is gone
-- +goose StatementEnd
```

**Correction, verified against a live database during implementation.** An
earlier draft of this spec claimed the `::text` casts were load-bearing —
that `email <> lower(email)` would be evaluated case-insensitively on a CITEXT
column and silently update zero rows. That is wrong. There is no
`lower(citext)` overload, so `lower(email)` resolves to `lower(text)` through
citext's implicit cast and returns `text`, which makes the predicate
case-sensitive. The uncast form works. Measured on the compose database: uncast
`UPDATE 1`, cast `UPDATE 1`, both idempotent on re-run.

The casts stay anyway, for a smaller and honest reason: the resolution chain is
subtle enough that a reader can reasonably misread the predicate as
case-insensitive, and it would invert into an always-false predicate if a
`lower(citext)` overload ever appeared. Explicit costs nothing.

The `WHERE` clause is an audit constraint, not an optimization, and this part
did hold up. `users` carries the `audit_capture()` trigger, and email is not in
the trigger's ignore list (`updated_at`, `onboarding_tours_seen`,
`rescale_baseline_max`) — confirmed by observing a `user.update` row appear for
each changed user. Without the filter every user would be journalled, attributed
to nobody, since the migration runs outside `audittx.Run`. With it, only
genuinely mixed-case rows are touched: one row on production.

### 5. Frontend

`auth/presentation/console/create-user-drawer.tsx`, the Email field:

```tsx
<Field label="Email" value={email} onChange={(v) => setEmail(v.toLowerCase())} ... />
```

`Field` (`upload/presentation/components/field.tsx`) forwards neither `type` nor
`autoCapitalize`, and does not need to: folding in `onChange` rewrites the value
on every keystroke, so an upper-case character cannot survive in the field —
including one produced by a mobile keyboard's auto-capitalization, which is the
most likely way the production address was typed.

`login/login-form.tsx` is deliberately unchanged. Its field is labelled "Email
or username", username stays case-preserving for display, and the server folds
the identifier per §3.

## Testing

- `internal/domain/email_test.go` — table test for `Fold`: mixed case,
  surrounding whitespace, idempotence, empty string.
- `internal/service/users/create_test.go` (new file) — a method on the existing
  `UsersSuite` declared in `users_test.go`, matching how `grant_test.go` and
  `scope_test.go` extend it. Asserts the minimock `StoreMock` receives a folded
  email when `Create` is called with `"  Ernest.Sayapov@Gmail.COM "`. This is
  the test that fails on regression; a `Fold` unit test alone would not.
- `frontend/src/auth/presentation/console/create-user-drawer.spec.tsx` (new) —
  typing `A@B.COM` leaves `a@b.com` in the field. Vitest, mirroring the existing
  `user-row.spec.tsx`.

Existing test conventions apply: `testify/suite` for grouping,
`gotest.tools/v3/assert` for assertions, `minimock` for the store.

## Out of scope

- **CHECK constraint** `email::text = lower(email::text)` — rejected. Both write
  paths are covered in Go and live in one service; the constraint would turn a
  future miss into a failed insert rather than a silent correction, at the cost
  of another migration.
- **Username normalization** — username is a display name where casing is
  meaningful; uniqueness and login are already case-insensitive via citext.
- **`credential-rules.ts`** — the input can no longer hold an upper-case
  character, so a validation rule would never fire.
- **Post-creation email edit** — does not exist today and this feature does not
  add it.
- **Audit journal history** — existing `entity_label` values keep their original
  casing. They are a record of what was true at the time, not current state.

## Files touched

| File | Kind |
| --- | --- |
| `backend/services/auth-service/internal/domain/email.go` | new |
| `backend/services/auth-service/internal/domain/email_test.go` | new |
| `backend/services/auth-service/internal/migrate/migrations/00014_lowercase_emails.sql` | new |
| `backend/services/auth-service/internal/service/users/create.go` | edit |
| `backend/services/auth-service/internal/service/users/create_test.go` | new |
| `backend/services/auth-service/internal/bootstrap/service.go` | edit |
| `backend/services/auth-service/internal/service/auth/login.go` | edit |
| `frontend/src/auth/presentation/console/create-user-drawer.tsx` | edit |
| `frontend/src/auth/presentation/console/create-user-drawer.spec.tsx` | new |
