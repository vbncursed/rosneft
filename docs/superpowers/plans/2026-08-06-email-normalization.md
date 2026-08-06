# Email Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every user email in lower case, fold the login identifier before it is used as a throttling key, and make an upper-case character impossible to type into the create-user form.

**Architecture:** One pure function `domain.Fold` in auth-service mirrors in Go what the `CITEXT` columns already do in Postgres. It is applied at the two paths that write an email (the users service and the bootstrap admin) and once at the top of `Login`. A goose migration folds the rows that already exist. The frontend rewrites the field value on every keystroke, so no new component props are needed.

**Tech Stack:** Go 1.26.5 (auth-service), Postgres 17 + `citext`, goose migrations, `testify/suite` + `gotest.tools/v3/assert` + `minimock`, Vite/React 19 frontend with vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-email-normalization-design.md`

## Global Constraints

- **`make -C backend check` must pass before every commit touching Go.** `.githooks/pre-commit` runs it automatically (~80 s). Run the targeted test first, then let the hook run the full gate on commit.
- **File size cap: 200 lines** per file, backend and frontend both.
- **Modern Go 1.26 idioms are required:** `t.Context()` in tests, never `context.WithCancel(context.Background())`.
- **Test conventions:** `testify/suite` for grouping, `gotest.tools/v3/assert` for assertions (`assert.X(s.T(), …)`, never `s.Equal()`), `minimock` for interface mocks. The controller is built in `SetupTest` with `minimock.NewController(s.T())` and auto-verifies on cleanup — no manual `AssertExpectations`.
- **Never write `"use client"`** in the frontend. It is a Vite SPA, not Next.js.
- **Frontend test runners do not overlap:** `*.test.ts` runs under `node --test` (`yarn test`), `*.spec.tsx` runs under vitest (`yarn test:spa`). The new frontend test is a `.spec.tsx`.
- **vitest runs without `globals`**, so `cleanup` from testing-library must be wired by hand in an `afterEach`.
- Branch: work stays on `dev`; the PR to `main` comes after all tasks land.

---

### Task 1: `domain.Fold`

The single normalization rule. Everything else in this plan calls it.

**Files:**
- Create: `backend/services/auth-service/internal/domain/email.go`
- Test: `backend/services/auth-service/internal/domain/email_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `func Fold(s string) string` in package `github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain`. Returns the input trimmed of leading/trailing whitespace and lower-cased. Total function, no error, safe on the empty string.

- [ ] **Step 1: Write the failing test**

Create `backend/services/auth-service/internal/domain/email_test.go`:

```go
package domain_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type FoldSuite struct{ suite.Suite }

func TestFoldSuite(t *testing.T) { suite.Run(t, new(FoldSuite)) }

func (s *FoldSuite) TestFold() {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"mixed case", "Ernest.Sayapov@Gmail.COM", "ernest.sayapov@gmail.com"},
		{"already lower", "ernest@gmail.com", "ernest@gmail.com"},
		{"surrounding whitespace", "  Ernest@Gmail.com \t", "ernest@gmail.com"},
		{"username, not an email", "  Ivan ", "ivan"},
		{"empty", "", ""},
	}
	for _, c := range cases {
		assert.Equal(s.T(), domain.Fold(c.in), c.want, c.name)
	}
}

// Folding a folded value must not change it — the migration and the write paths
// both re-apply it to rows that are already normalized.
func (s *FoldSuite) TestFoldIsIdempotent() {
	once := domain.Fold("  Ernest.Sayapov@Gmail.COM ")
	assert.Equal(s.T(), domain.Fold(once), once)
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend/services/auth-service && go test ./internal/domain/ -run TestFoldSuite -v
```

Expected: FAIL — `undefined: domain.Fold`.

- [ ] **Step 3: Write the implementation**

Create `backend/services/auth-service/internal/domain/email.go`:

```go
package domain

import "strings"

// Fold mirrors in Go what the citext columns (users.email, users.username)
// already do in Postgres: compare case-insensitively. Applying it before a
// write makes the stored form match the compared form, so an address typed as
// Ernest.Sayapov@Gmail.COM is stored — and displayed — the way every mail
// provider treats it.
//
// The trim is not cosmetic: a clipboard-pasted address with surrounding
// whitespace fails mail.ParseAddress on create and misses the row on login.
//
// It also folds usernames, which share the citext column type — hence the
// neutral name.
func Fold(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend/services/auth-service && go test ./internal/domain/ -run TestFoldSuite -v
```

Expected: PASS, both test methods.

- [ ] **Step 5: Commit**

```bash
git add backend/services/auth-service/internal/domain/email.go \
        backend/services/auth-service/internal/domain/email_test.go
git commit -m "feat(auth): add domain.Fold, the Go mirror of the citext columns"
```

The pre-commit hook runs `make -C backend check` (~80 s). Let it finish.

---

### Task 2: Fold email on both write paths

Email reaches the database through exactly two call sites. `EnsureBootstrapAdmin` calls `store.Create` directly, bypassing the service, so fixing only the service would leave the first admin of every fresh environment mixed-case.

**Files:**
- Modify: `backend/services/auth-service/internal/service/users/create.go`
- Modify: `backend/services/auth-service/internal/bootstrap/service.go` (the `store.Create` call inside `EnsureBootstrapAdmin`)
- Create: `backend/services/auth-service/internal/service/users/create_test.go`

**Interfaces:**
- Consumes: `domain.Fold(string) string` from Task 1.
- Produces: no new exported symbols. `(*users.Service).Create(ctx, actorID, email, username, plain string, roleSlugs []string) (domain.User, error)` keeps its signature; only the value it hands to `Store.Create` changes.

- [ ] **Step 1: Write the failing test**

Create `backend/services/auth-service/internal/service/users/create_test.go`. It is a method on the existing `UsersSuite` declared in `users_test.go` — the same pattern `grant_test.go` and `scope_test.go` follow. Do NOT declare a second suite.

`assertCanGrant` returns immediately when the role set is empty, so passing `nil` roles keeps the test to a single mock expectation. The password hash is salted and therefore not predictable, so the mock is wired with `Set` and asserts the email field rather than the whole struct.

```go
package users_test

import (
	"context"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create tests extend UsersSuite (defined in users_test.go).

// A mixed-case, whitespace-padded address must reach the store folded — the
// citext column would compare it case-insensitively either way, but the stored
// and displayed form has to be the normalized one.
func (s *UsersSuite) TestCreateFoldsEmail() {
	var got string
	s.st.CreateMock.Set(func(_ context.Context, u domain.User) (domain.User, error) {
		got = u.Email
		return domain.User{ID: "u1", Email: u.Email}, nil
	})

	_, err := s.svc.Create(s.ctx, "admin", "  Ernest.Sayapov@Gmail.COM ", "ernest", "Passw0rd!", nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, "ernest.sayapov@gmail.com")
}

// Folding must happen before validation, not after: the padded form does not
// parse as an address, so a create that validated first would 400 on input a
// user legitimately pasted.
func (s *UsersSuite) TestCreateAcceptsPaddedEmail() {
	s.st.CreateMock.Set(func(_ context.Context, u domain.User) (domain.User, error) {
		return domain.User{ID: "u1", Email: u.Email}, nil
	})

	_, err := s.svc.Create(s.ctx, "admin", " ernest@gmail.com ", "ernest", "Passw0rd!", nil)
	assert.NilError(s.T(), err)
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend/services/auth-service && go test ./internal/service/users/ -run 'TestUsersSuite/TestCreate' -v
```

Expected: FAIL — `TestCreateFoldsEmail` reports the unfolded `  Ernest.Sayapov@Gmail.COM `, and `TestCreateAcceptsPaddedEmail` fails with an `ErrInvalidInput` "invalid email" from `validate.Email`.

- [ ] **Step 3: Fold in the users service**

In `backend/services/auth-service/internal/service/users/create.go`, add the fold as the first statement of `Create`, **before** `validate.Username`/`validate.Email`:

```go
func (s *Service) Create(ctx context.Context, actorID, email, username, plain string, roleSlugs []string) (domain.User, error) {
	email = domain.Fold(email)
	if err := validate.Username(username); err != nil {
		return domain.User{}, err
	}
	if err := validate.Email(email); err != nil {
		return domain.User{}, err
	}
	// … rest unchanged
```

`domain` is already imported in this file. Do not touch `update.go`: it takes email and username into `_, _` and ignores them by design.

- [ ] **Step 4: Fold in the bootstrap admin**

In `backend/services/auth-service/internal/bootstrap/service.go`, inside `EnsureBootstrapAdmin`, change the `store.Create` argument:

```go
	_, err = store.Create(ctx, domain.User{
		Email: domain.Fold(cfg.BootstrapEmail), Username: cfg.BootstrapUsername,
		PasswordHash: hash, RoleSlugs: []string{"admin"}, IsOwner: true,
	})
```

`domain` is already imported in this file. Leave `Username` alone — username stays case-preserving by decision.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd backend/services/auth-service && go test ./internal/service/users/ ./internal/bootstrap/ -v
```

Expected: PASS, and no previously green test in `UsersSuite` turns red.

- [ ] **Step 6: Commit**

```bash
git add backend/services/auth-service/internal/service/users/create.go \
        backend/services/auth-service/internal/service/users/create_test.go \
        backend/services/auth-service/internal/bootstrap/service.go
git commit -m "feat(auth): fold email on both user-creation paths"
```

---

### Task 3: Fold the login identifier

`Login` keys brute-force throttling on the raw identifier, so case variants get independent attempt counters against the same account and an attacker multiplies the attempt budget by permuting case. Folding once at the top fixes it.

**Files:**
- Modify: `backend/services/auth-service/internal/service/auth/login.go`
- Modify: `backend/services/auth-service/internal/service/auth/login_test.go` (append one method to `LoginSuite`)

**Interfaces:**
- Consumes: `domain.Fold(string) string` from Task 1.
- Produces: no new symbols. `(*auth.Service).Login(ctx, identifier, plain string) (string, string, error)` keeps its signature and return contract (session token, challenge token, error).

- [ ] **Step 1: Write the failing test**

Append to `backend/services/auth-service/internal/service/auth/login_test.go`. `LoginSuite` and its `SetupTest` already exist at the top of that file — add only the method.

```go
// Throttling is keyed on the identifier, so an unfolded key gives each case
// variant its own attempt counter against the same account and multiplies the
// brute-force budget. Every session call must see the folded form.
func (s *LoginSuite) TestLoginFoldsIdentifier() {
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}

	s.ss.IsLockedMock.Expect(s.ctx, "ernest@gmail.com").Return(false, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ernest@gmail.com").Return(u, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ernest@gmail.com").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(false, nil)
	s.ss.CreateMock.Return("tok123", nil)

	token, _, err := s.svc.Login(s.ctx, "  Ernest@Gmail.COM ", "pw")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "tok123")
}

// A failed attempt must register against the folded key too, or the counter it
// increments is not the one the next attempt is checked against.
func (s *LoginSuite) TestLoginFoldsIdentifierOnFailure() {
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}

	s.ss.IsLockedMock.Expect(s.ctx, "ernest@gmail.com").Return(false, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ernest@gmail.com").Return(u, nil)
	s.ss.RegisterFailMock.Expect(s.ctx, "ernest@gmail.com").Return(nil)

	_, _, err := s.svc.Login(s.ctx, "Ernest@Gmail.COM", "wrong")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend/services/auth-service && go test ./internal/service/auth/ -run 'TestLoginSuite/TestLoginFolds' -v
```

Expected: FAIL — minimock reports `IsLocked` called with `"  Ernest@Gmail.COM "` instead of the expected folded value.

- [ ] **Step 3: Fold once at the top of Login**

In `backend/services/auth-service/internal/service/auth/login.go`, insert the fold immediately after the empty check, so every subsequent use of `identifier` sees the folded value:

```go
func (s *Service) Login(ctx context.Context, identifier, plain string) (string, string, error) {
	if identifier == "" || plain == "" {
		return "", "", fmt.Errorf("auth.Login: %w: identifier and password required", domain.ErrInvalidInput)
	}
	// Fold once: the session store keys throttling on this string, and an
	// unfolded key gives every case variant its own attempt counter against the
	// same account. GetByIdentifier compares through citext and would match
	// either way — folding it too keeps one variable rather than two, and makes
	// a whitespace-padded paste resolve.
	identifier = domain.Fold(identifier)

	locked, err := s.sessions.IsLocked(ctx, identifier)
	// … rest unchanged
```

Do not introduce a second variable — every later `identifier` reference in the function (`IsLocked`, `GetByIdentifier`, both `RegisterFail` calls, `ClearFails`) must see the folded value, and reassignment is what guarantees that without editing five call sites.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend/services/auth-service && go test ./internal/service/auth/ -v
```

Expected: PASS. The pre-existing tests use `"ivan"`, which folds to itself, so they stay green.

- [ ] **Step 5: Commit**

```bash
git add backend/services/auth-service/internal/service/auth/login.go \
        backend/services/auth-service/internal/service/auth/login_test.go
git commit -m "fix(auth): key login throttling on the folded identifier

Case variants of one address produced independent attempt counters against
the same account, multiplying the brute-force budget by the number of
permutations. The password check already resolved to a single user via citext,
so the variants were never separate accounts — only separate counters."
```

---

### Task 4: Backfill migration

**Files:**
- Create: `backend/services/auth-service/internal/migrate/migrations/00014_lowercase_emails.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Confirm 00014 is free**

```bash
ls backend/services/auth-service/internal/migrate/migrations/
```

Expected: the highest existing number is `00013_audit_read_own.sql`. If a higher one exists, use the next free number and adjust the filename in every step below.

- [ ] **Step 2: Write the migration**

Create `backend/services/auth-service/internal/migrate/migrations/00014_lowercase_emails.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- The ::text casts are explicit on purpose, though not strictly required today.
-- users.email is CITEXT, which compares case-insensitively — but there is no
-- lower(citext) overload, so `lower(email)` resolves to lower(text) via the
-- implicit cast and yields text, making the predicate case-sensitive after all.
-- That is a subtle chain to rely on silently, and it would invert into an
-- always-false predicate if a lower(citext) overload ever appeared. Spelling
-- the casts out costs nothing and says what the comparison means.
--
-- The WHERE clause is an audit constraint, not an optimization. users carries
-- the audit_capture() trigger and email is not in its ignore list — verified:
-- the statement files a user.update entry per changed row — so an unfiltered
-- UPDATE would journal every user in the table. This migration runs outside
-- audittx.Run, so those entries would carry no actor.
UPDATE users SET email = lower(email::text)
WHERE email::text <> lower(email::text);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;  -- irreversible: the original casing is not recoverable
-- +goose StatementEnd
```

- [ ] **Step 3: Verify the cast against a live database**

**Corrected during execution.** This step was written to prove a "citext trap" — the belief that `email <> lower(email)` is evaluated case-insensitively on a CITEXT column and updates zero rows. Running it disproved that: there is no `lower(citext)` overload, so `lower(email)` resolves to `lower(text)` through citext's implicit cast and returns `text`, making the predicate case-sensitive. Both forms work. The casts stay for readability and overload-resolution safety, not necessity. Steps 3 and 4 below are rewritten to what was actually run.

It needs the compose stack up (`make -C backend compose-up`).

Insert a mixed-case probe row, run the migration's exact statement, and confirm it moved:

```bash
docker compose exec -T postgres psql -U andrey -d andrey -c \
  "INSERT INTO users (email, username, password_hash) VALUES ('Probe.Case@Example.COM', 'probecase', 'x');"

docker compose exec -T postgres psql -U andrey -d andrey -c \
  "UPDATE users SET email = lower(email::text) WHERE email::text <> lower(email::text);"
```

Expected: `UPDATE 1` (or more, if other mixed-case rows exist).

Confirm the stored value, then clean the probe up:

```bash
docker compose exec -T postgres psql -U andrey -d andrey -c \
  "SELECT email::text FROM users WHERE username = 'probecase';"

docker compose exec -T postgres psql -U andrey -d andrey -c \
  "DELETE FROM users WHERE username = 'probecase';"
```

Expected: `probe.case@example.com`.

- [ ] **Step 4: Establish why the predicate is case-sensitive, and confirm the audit trigger fires**

The comparison's behaviour rests on overload resolution, so check it directly rather than inferring it:

```bash
docker compose exec -T postgres psql -U andrey -d andrey -c \
  "SELECT pg_typeof(lower('Ab'::citext)) AS lower_result,
          'Ab'::citext <> lower('Ab'::citext) AS uncast_predicate,
          'Ab'::citext <> 'ab'::citext AS citext_vs_citext;"
```

Expected: `lower_result = text`, `uncast_predicate = t`, `citext_vs_citext = f`. The third column is the case-insensitive comparison the trap theory assumed the first two would inherit; they do not, because `lower()` has left citext behind.

Then confirm the backfill is journalled, which is what the `WHERE` clause exists to bound:

```bash
docker compose exec -T postgres psql -U andrey -d andrey -c \
  "SELECT action, entity, entity_label FROM audit_log
   WHERE entity_label ILIKE '%probe.case%' ORDER BY id DESC LIMIT 3;"
```

Expected: a `user.update` row for the changed email. That is one journal entry per changed user, which is why the statement must not run unfiltered.

- [ ] **Step 5: Verify goose applies it on boot**

```bash
docker compose up -d --force-recreate auth
docker compose logs auth | tail -20
```

Expected: goose logs the `00014_lowercase_emails.sql` migration applied, and the service reaches its normal ready state with no error.

- [ ] **Step 6: Commit**

```bash
git add backend/services/auth-service/internal/migrate/migrations/00014_lowercase_emails.sql
git commit -m "feat(auth): backfill existing emails to lower case

The ::text casts are explicit rather than necessary. email is CITEXT, but
lower() has no citext overload, so lower(email) resolves to lower(text) and
returns text — the predicate is case-sensitive either way. Verified on the
compose database: both forms UPDATE 1, both idempotent on re-run."
```

---

### Task 5: Force lower case in the create-user form

**Files:**
- Modify: `frontend/src/auth/presentation/console/create-user-drawer.tsx` (the Email `<Field>`, line 48)
- Create: `frontend/src/auth/presentation/console/create-user-drawer.spec.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks — this is independent of the Go work.
- Produces: no new exported symbols. `CreateUserDrawer` keeps its props `{ roles: Role[]; onClose: () => void; onCreated: () => void }`.

`Field` (`@/upload/presentation/components/field`) forwards neither `type` nor `autoCapitalize` and must not be changed. Folding inside `onChange` rewrites the value on every keystroke, so an upper-case character cannot survive in the field — including one produced by a mobile keyboard's auto-capitalization, which is the most likely way the production address was typed.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/auth/presentation/console/create-user-drawer.spec.tsx`. The drawer calls `useCurrentUser()` and imports the admin gateway, so both are mocked; `vi.mock` calls are hoisted, so they must not close over variables declared later in the file.

Two environment details, both of which will otherwise cost the implementer a debugging cycle. The drawer renders inside `MotionModal` → `MotionOverlay` → `useResolvedVariants` → motion's `useReducedMotion`, which reads `window.matchMedia`; jsdom does not implement it, and no existing spec in this repo renders a motion overlay, so there is no precedent to copy. The stub below is unconditional — four lines that remove an unknown. `MotionOverlay` renders inline rather than through a portal, so `screen` queries reach the form without any container plumbing.

```tsx
// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/auth/infrastructure/auth-admin-gateway", () => ({
  createUser: async () => {},
}));

vi.mock("@/auth/presentation/current-user-context", () => ({
  useCurrentUser: () => ({
    id: "me",
    email: "root@example.com",
    username: "root",
    status: "active",
    roleSlugs: [],
    roleTitles: {},
    permissions: [],
    isOwner: true,
    onboardingToursSeen: [],
  }),
}));

import CreateUserDrawer from "./create-user-drawer";

// The drawer renders inside MotionModal, whose reduced-motion hook reads
// window.matchMedia. jsdom does not implement it.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

function emailInput() {
  render(<CreateUserDrawer roles={[]} onClose={() => {}} onCreated={() => {}} />);
  // Field renders <label> as a sibling, not wrapping the input and with no
  // htmlFor, so getByLabelText cannot reach it — the Email field is the first
  // textbox in the form.
  return screen.getAllByRole("textbox")[0] as HTMLInputElement;
}

describe("CreateUserDrawer email field", () => {
  it("lower-cases an upper-case address as it is typed", () => {
    const input = emailInput();

    fireEvent.change(input, { target: { value: "Ernest.Sayapov@Gmail.COM" } });

    expect(input.value).toBe("ernest.sayapov@gmail.com");
  });

  it("leaves an already lower-case address alone", () => {
    const input = emailInput();

    fireEvent.change(input, { target: { value: "ernest@gmail.com" } });

    expect(input.value).toBe("ernest@gmail.com");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && yarn test:spa --run create-user-drawer
```

Expected: FAIL on the first case — received `"Ernest.Sayapov@Gmail.COM"`, expected `"ernest.sayapov@gmail.com"`. The second case passes already; that is fine, it is the regression guard.

- [ ] **Step 3: Fold in the change handler**

In `frontend/src/auth/presentation/console/create-user-drawer.tsx`, change only the Email field (line 48). The Username field on the next line stays exactly as it is.

```tsx
        <Field label="Email" value={email} onChange={(v) => setEmail(v.toLowerCase())} required error={email ? emailErr : null} />
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && yarn test:spa --run create-user-drawer
```

Expected: PASS, both cases.

- [ ] **Step 5: Verify lint and the rest of the suite**

```bash
cd frontend && yarn lint && yarn test:spa --run
```

Expected: no ESLint errors (watch the `max-lines: 200` rule — the drawer is 73 lines, the new spec well under), and no other spec turns red.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/auth/presentation/console/create-user-drawer.tsx \
        frontend/src/auth/presentation/console/create-user-drawer.spec.tsx
git commit -m "feat(admin): force lower case in the create-user email field"
```

---

### Task 6: Full-stack verification and PR

**Files:** none modified. This task proves the pieces work together and opens the PR.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a PR from `dev` to `main`.

- [ ] **Step 1: Run the full backend gate**

```bash
make -C backend check
```

Expected: PASS — fmt, tidy-check, vet, lint, test, vuln. ~80 s.

- [ ] **Step 2: Run the full frontend suite**

```bash
cd frontend && yarn lint && yarn test && yarn test:spa --run && yarn build
```

Expected: all green.

- [ ] **Step 3: Verify end to end against the running stack**

Bring the stack up with the new auth image and create a user through the admin console with a mixed-case address pasted into the field (paste, do not type — pasting is the one path that could bypass a per-keystroke fold if the handler were wired wrong).

```bash
make -C backend compose-up
cd frontend && yarn dev --port 3000
```

In the browser at `http://localhost:3000/admin/users`, create a user with username `casetest`, email `TEST.Case@Example.COM` pasted into the field, and a generated password (write the password down — Step 4 needs it). Expected: the field shows `test.case@example.com` at paste time, and the new row in the user list shows the lower-case address.

Then confirm the stored value:

```bash
docker compose exec -T postgres psql -U andrey -d andrey -c \
  "SELECT email::text FROM users WHERE username = 'casetest';"
```

Expected: `test.case@example.com`.

- [ ] **Step 4: Confirm login still works with the wrong case**

Log out and log in as `casetest` using the email `Test.Case@EXAMPLE.com` and the password from Step 3. Expected: login succeeds — citext already made this work, and Task 3 must not have broken it.

- [ ] **Step 5: Clean up the probe user**

```bash
docker compose exec -T postgres psql -U andrey -d andrey -c \
  "DELETE FROM users WHERE username = 'casetest';"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin dev
gh pr create --base main --head dev \
  --title "Email normalization" \
  --body "$(cat <<'EOF'
Stores every user email in lower case, folds the login identifier before it is
used as a throttling key, and makes an upper-case character impossible to type
into the create-user form.

Spec: `docs/superpowers/specs/2026-08-06-email-normalization-design.md`
Plan: `docs/superpowers/plans/2026-08-06-email-normalization.md`

`users.email` is already `CITEXT`, so login and uniqueness were case-insensitive
before this change. The gap was the stored and displayed value — the admin
console, `/account` and the audit journal's `entity_label` all showed whatever
casing was typed.

Includes a defect found during analysis: `Login` keyed brute-force throttling on
the raw identifier, so case variants of one address got independent attempt
counters against the same account.

The backfill migration's `::text` casts are explicit rather than required.
`email` is CITEXT, but `lower()` has no citext overload, so `lower(email)`
resolves to `lower(text)` and returns text — the predicate is case-sensitive
either way. The casts stay because that resolution chain is easy to misread and
would invert if a `lower(citext)` overload ever appeared.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Run the code review**

Once CI is green, run `/code-review` on the PR.

---

## Coverage against the spec

| Spec section | Task |
| --- | --- |
| §1 One folding function in the domain | Task 1 |
| §2 Both write paths | Task 2 |
| §3 Login identifier | Task 3 |
| §4 Backfill migration | Task 4 |
| §5 Frontend | Task 5 |
| Testing: `Fold` table test | Task 1, Step 1 |
| Testing: service `Create` folds | Task 2, Step 1 |
| Testing: frontend drawer spec | Task 5, Step 1 |
| Out of scope: CHECK constraint, username, `credential-rules.ts`, email edit, audit history | not implemented, by decision |

The plan adds one test beyond the spec's list: `TestLoginFoldsIdentifier` /
`TestLoginFoldsIdentifierOnFailure` in Task 3. The spec describes the throttling
fix but its Testing section did not name a test for it, and a security fix
without a regression guard is the kind that quietly comes back.
