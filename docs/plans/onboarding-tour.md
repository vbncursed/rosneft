# Onboarding tours for `/territories/[slug]`

> **Update (2026-07-10).** Shipped as **two** tours, not one. The viewer tour runs on
> arrival; a second, `panorama`, runs the first time the user stands inside a panorama —
> its whole edit panel (Switch to 3D view, Calibrate, Set from camera, Yaw, Save anchor,
> Delete) does not exist in the DOM until then, so the viewer tour could never point at
> it. "Seen" is therefore a **set**, `users.onboarding_tours_seen TEXT[]`, not a single
> timestamp, and the endpoint is `POST /api/auth/me/onboarding/{tour}`. A third tour is
> now frontend-only work: a step list, a tour id, and `data-tour` attributes.
>
> The backend validates the tour id's *shape* (lower-case slug, ≤32 chars, ≤16 per user)
> and never its membership — that keeps the list of tours in the frontend where it belongs,
> while still guarding a value the client can append to an array.

First-run guided tour: a new user opens the territory viewer, each button gets
spotlighted in turn with a one-line explanation, and the whole thing is
skippable. "Seen" is persisted server-side on the user.

**Cost note (decided, not up for debate):** the server-side flag costs ~15 files
across auth-service, proto regen, a migration, gateway, openapi and the frontend
principal. A `localStorage` flag would have been ~1 file. The user chose
server-side; it survives device changes. Noted, moving on.

---

## Phase 0 — Allowed APIs (discovery output)

Everything below was read from source, not assumed. Do not invent alternatives.

### Backend, auth-service (owns the `users` table)

| Thing | Location | Shape |
|---|---|---|
| Latest migration | `internal/migrate/migrations/00010_drop_totp.sql` | next file is `00011_*.sql` |
| Goose format | same file | `-- +goose Up` / `-- +goose Down`, plain `ALTER TABLE`, no `StatementBegin` for single statements |
| Domain struct | `internal/domain/user.go:16-29` | already imports `time`; `DeletedAt *time.Time`, `CreatedBy *string` |
| NULL scanning | `internal/storage/users/get.go:15-20` | bare `*time.Time` scanned by address; pgx v5 maps SQL NULL → nil. **No `sql.NullTime`, no `COALESCE` anywhere** |
| Column list | `internal/storage/users/models.go:4` | `const userColumns` — read only by `get.go:24,37` and `list.go:14`, both via `scanUser`. `create.go` does **not** use it |
| Self setter to mirror | `internal/storage/users/change_password.go:14-24` | `UPDATE … RETURNING id` + `Scan(&got)` + `pgx.ErrNoRows` → `domain.ErrUserNotFound`, returns `error` |
| Service `Store` iface | `internal/service/users/users.go:12-41` | carries `//go:generate minimock -i Store,Sessions -o ./mocks -s _mock.go` |
| Self service method to mirror | `internal/service/users/change_password.go:13-33` | actor operates on own `userID`, no owner check |
| gRPC self handlers | `internal/transport/grpcapi/self.go:9-30` | `uid, err := s.userIDFromToken(ctx, req.GetToken())` then `mapError(err)` |
| Token resolver | `internal/transport/grpcapi/server.go:70-74` | `userIDFromToken` |
| Transport iface | `internal/transport/grpcapi/server.go:31-42` | `UsersSvc` — **a second interface that also needs the new method** |
| Proto → domain | `internal/transport/grpcapi/converters.go:10-24` | `userToProto`; already imports `timestamppb` |
| Proto | `backend/proto/rosneft/auth/v1/auth.proto:48-59` | `message User` uses tags 1-10 → **next tag is 11**. `import "google/protobuf/timestamp.proto"` already present (line 7) |
| Empty-response RPC pattern | `auth.proto:120-125` | `ChangePasswordRequest{token,…}` → `message ChangePasswordResponse {}` |
| Codegen | `backend/Makefile:46-47` | `proto-gen: cd proto && buf generate`. **Generated code is committed** (`backend/proto/gen/go/…/auth.pb.go`) |
| Go test style | `internal/service/users/users_test.go:1-49` | external pkg `users_test`; `testify/suite`; `gotest.tools/v3/assert` (never `s.Equal`); `minimock.NewController(s.T())` in `SetupTest`; `s.T().Context()` |

### Backend, gateway-service (thin passthrough)

| Thing | Location |
|---|---|
| Route group | `internal/transport/authhttp/handlers.go:35-78` — `pr.Use(h.Authenticate)`; self routes need **no** `h.require(...)` |
| Handler to mirror | `handlers.go:136-146` `changePassword` — inline `var req struct{…}`, `decode(w,r,&req)`, `bearer(r)`, `w.WriteHeader(http.StatusNoContent)` |
| DTO | `internal/transport/authhttp/dto.go:17-39` — `userJSON` + `userToJSON`. **Repo rule: `omitzero`, never `omitempty`** |
| gRPC client wrapper | `internal/clients/auth/session.go:38-45` |
| OpenAPI schema | `api/openapi.yaml:423-433` `AuthUser` |
| OpenAPI self-mutation to mirror | `api/openapi.yaml:1318-1331` `POST /api/auth/me/password` |

### Frontend

| Thing | Location |
|---|---|
| Principal | `src/auth/domain/principal.ts` |
| Gateway + mapping | `src/auth/infrastructure/auth-gateway.ts` — `mapPrincipal`, `getMe`, `changePassword` |
| HTTP client | `src/shared/infrastructure/http/client.ts` — `httpPost<T>(path, body?)`, **body optional**; returns `undefined` on 204 |
| **Client-component POST works with no extra config** | `client.ts:8-22` — on the client `apiBase()` is `""` → same-origin fetch → httpOnly `session` cookie sent automatically. No `credentials: "include"` needed |
| Provider | `src/app/layout.tsx:33,40-43` → `<CurrentUserProvider value={principal}>` |
| Client mutation style | `src/auth/presentation/account/change-password-form.tsx:14-27` — busy flag, try/await, `notify.error(e instanceof Error ? e.message : "…")`, `finally` |
| Anchoring hook | `src/shared/presentation/components/dropdown/use-anchored-position.ts` — `(anchorRef, enabled) => AnchorRect \| null`; re-measures on capture-phase `scroll` + `resize` |
| Positioning precedent | `dropdown-menu.tsx:21-28` — `position: fixed` + inline `top`/`left` from the rect, **not** `transform` |
| Overlay precedent | `confirm-modal.tsx:58-66` — plain `fixed inset-0`, no portal, mounted at root layout; `document` keydown listener for Escape (`:42-46`); body scroll lock (`:37-38,49`); auto-focus, **no focus trap** (none exists anywhere in the repo) |
| Store precedent | `toast-store.ts` — singleton + `Set` listeners + `getSnapshot`/`getServerSnapshot` |
| z-index ladder | toasts `z-[100]`, dialogs `z-[110]`, dropdown `z-[1000]` → tour must sit **above `z-[1000]`** |
| Glass panel class | `overlays-panel.tsx:61` — `rounded-2xl border border-white/15 bg-black/55 p-4 text-neutral-100 shadow-2xl backdrop-blur-md` |
| Accent / focus ring | `focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300` (≈8 sites). Cyan is a raw-Tailwind convention, **not** a `@theme` token |
| Reduced motion | Tailwind `motion-safe:` variant only (`panorama-marker.tsx:83`). No `@media (prefers-reduced-motion)` block exists |
| `data-*` convention | **None.** Only `data-index` in `dropdown-menu.tsx:82`. `data-tour` is free to claim |
| Test style | `src/panorama/domain/marker-drag.test.ts` — `node:test` + `node:assert/strict`, imports domain with an explicit `.ts` extension |

### Anti-patterns (things that do NOT exist — do not reach for them)

- ❌ `mutate.go` in `storage/users/` — no shared exec helper. Each setter inlines its own query.
- ❌ `useConfirm()` / `useToast()` React hooks — despite the filenames, both are plain facades.
- ❌ A focus trap. Repo-wide there is only initial `.focus()`.
- ❌ `sql.NullTime` / `COALESCE`.
- ❌ `omitempty` on Go JSON tags.
- ❌ jsdom / React Testing Library / Playwright / any CI. `yarn test` is `node --test 'src/**/*.test.ts'` and every existing test is a pure-domain assert.
- ❌ A new npm dependency. No `driver.js`, no `react-joyride`, no `intro.js`.

---

## Architecture decisions

**New bounded context `frontend/src/onboarding/`.** The tour is page-scoped, not
global: it mounts inside `ModelViewer`, not in the root layout. That means
**no store is needed at all** — no `useSyncExternalStore`, no singleton. The
toast/confirm store pattern is a precedent we deliberately *don't* follow,
because those are invoked imperatively from anywhere and this isn't.

**Targeting is by `data-tour="<step-id>"` on existing buttons.** No refs
threaded through the memoized `UIOverlay`, no `forwardRef` churn. A step whose
target isn't in the DOM is skipped. That single rule subsumes all three gating
mechanisms at once — permissions (`can("panorama:write")`), emptiness
(`panoramas.length > 0`), and the count badge (`measurementCount > 0`) — because
each already controls whether the button renders.

**Panel reveal, and why the DOM check can't be an upfront filter.** Targets on
the collapsed panel or the inactive "Placements" tab are *not in the DOM* while
that tab is inactive, so filtering the step list once at start would silently
drop them — and the requirement is that every button gets a step. So:

- Lift `collapsed` and `tab` out of `OverlaysPanel`'s local `useState` into the
  viewer, making them controlled props. `OverlaysPanel` already adjusts `tab`
  during render from the `selectedPlacementId` prop, so a controlled `tab` is
  the same shape it is already written for; it just calls `onTabChange` instead
  of `setTab`.
- A step may declare `tab?: "view" | "placements"`. Before measuring step *i*,
  the tour expands the panel and switches to `step.tab`, then checks in a layout
  effect whether the target exists. If it doesn't, it advances.
- Consequence: advancing is **incremental**, one step at a time, not a
  precomputed filtered array. The reducer stays pure; the reveal + existence
  check is the one effect that touches the DOM.

**Where the seam is drawn.** `document.querySelector` never appears in
`domain/` — it lives only in `presentation/tour-overlay.tsx`, which reports a
missing target by calling `tour.next()`. The reducer stays pure and is unit
tested; the overlay is **not** unit-tested — there is no jsdom in this repo and
adding one is out of scope. It is covered by the manual script in Phase 5, plus
a test that cross-checks every step id against the `data-tour` attributes in
the source (the one coupling no type system can see).

**The existence check must run in a layout effect, not a passive one.** Reading
it off `useAnchoredPosition`'s `rect === null` conflates "anchor is gone" with
"not measured yet". React can flush a commit's passive effects before the
hook's own layout effect has re-run, so the first anchored step after a centred
one would be skipped even though its button is on screen.

**`ModelViewer` is at 235 raw lines against a 200-line lint cap** (which skips
blanks and comments, so it currently passes with little headroom). All tour
wiring therefore lands in one hook, `onboarding/application/use-viewer-tour.ts`,
adding ~3 lines to `ModelViewer`.

**Widen `useAnchoredPosition` rather than write a second hook.** Its measure
effect keys on `[anchorRef, enabled]`, so a mutated `ref.current` would not
re-measure when the step changes. Widen the first parameter to
`RefObject<HTMLElement | null> | string`, where a string is a CSS selector
resolved inside the effect and included in the dep array. ~6 lines changed;
`dropdown-menu.tsx` keeps working untouched.

**No `router.refresh()` after marking seen.** The subagent recon suggested one;
it is wrong here. `router.refresh()` remounts `ModelViewer` and destroys camera,
selection and measurement state. Local state already hides the tour for this
session, and the server flag only needs to be correct on the *next* full load.

---

## Phase 1 — Backend: the `onboarding_seen_at` flag

Independently shippable: the column exists, is always `NULL`, nothing reads it.

### 1.1 Migration

`backend/services/auth-service/internal/migrate/migrations/00011_user_onboarding_seen.sql`

```sql
-- +goose Up
ALTER TABLE users ADD COLUMN onboarding_seen_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE users DROP COLUMN onboarding_seen_at;
```

Nullable, `NULL` = never seen. Mirrors `deleted_at` / `recovery_codes.used_at`.

### 1.2 Domain

`internal/domain/user.go` — add to the struct, after `IsOwner`:

```go
OnboardingSeenAt *time.Time // nil = the first-run tour has not been completed
```

### 1.3 Storage

- `storage/users/models.go` — append `, u.onboarding_seen_at` to `userColumns`.
- `storage/users/get.go` — append `&u.OnboardingSeenAt` as the **last** scan
  target in `scanUser` (order must match `userColumns`).
  *This covers all three SELECT sites:* `get.go:24`, `get.go:37`, `list.go:14`
  all route through `scanUser`. `create.go` builds its own INSERT and needs no
  change.
- **New** `storage/users/set_onboarding_seen.go` — copy `change_password.go`
  verbatim, swap the statement:

```go
// SetOnboardingSeen stamps the first-run tour as completed.
func (s *Store) SetOnboardingSeen(ctx context.Context, id string) error {
	const q = `UPDATE users SET onboarding_seen_at = now(), updated_at = now() WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.SetOnboardingSeen: %w", err)
	}
	return nil
}
```

`now()` is set by the database — the service takes no `time.Time` parameter, so
there is no clock to inject and no clock to fake in tests.

### 1.4 Service (this is where the tested logic lives)

- `service/users/users.go` — add to the `Store` interface:
  `SetOnboardingSeen(ctx context.Context, id string) error`
- **New** `service/users/mark_onboarding_seen.go`:

```go
// MarkOnboardingSeen stamps the first-run tour as completed for the caller.
// Idempotent: a client that fires this twice (skip, then a late finish) must
// not rewrite the timestamp.
func (s *Service) MarkOnboardingSeen(ctx context.Context, userID string) error {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.OnboardingSeenAt != nil {
		return nil
	}
	return s.store.SetOnboardingSeen(ctx, userID)
}
```

The idempotency guard is the reason this method is worth testing — without it
the method would be a passthrough and a test would assert nothing.

### 1.5 Regenerate mocks

```bash
cd backend/services/auth-service && go generate ./...
```

Skipping this makes the whole `users_test` package fail to compile, because
`mocks.StoreMock` will no longer satisfy the widened `Store` interface.

### 1.6 Go tests

**New** `service/users/mark_onboarding_seen_test.go`, matching `users_test.go`
style exactly (external package, `gotest.tools/v3/assert`, minimock controller
from `SetupTest` — it auto-verifies expectations on cleanup, so a
`SetOnboardingSeenMock` that is never armed *and* never called is the assertion
that no write happened).

Add to the existing `UsersSuite`:

1. `TestMarkOnboardingSeenStampsFirstRun` — `GetByIDMock` returns a user with
   `OnboardingSeenAt: nil`; expect `SetOnboardingSeenMock.Expect(ctx, "u1").Return(nil)`;
   assert `err == nil`.
2. `TestMarkOnboardingSeenIsIdempotent` — `GetByIDMock` returns a user with a
   non-nil `OnboardingSeenAt`; **arm no `SetOnboardingSeenMock`**; assert
   `err == nil`. Minimock fails the test if the store is written to.
3. `TestMarkOnboardingSeenPropagatesLookupError` — `GetByIDMock` returns
   `domain.ErrUserNotFound`; assert `assert.ErrorIs(s.T(), err, domain.ErrUserNotFound)`.

### 1.7 Proto

`backend/proto/rosneft/auth/v1/auth.proto`:

```proto
// inside message User, next free tag is 11
google.protobuf.Timestamp onboarding_seen_at = 11;

// inside the service's "--- self ---" block
rpc MarkOnboardingSeen(MarkOnboardingSeenRequest) returns (MarkOnboardingSeenResponse);

message MarkOnboardingSeenRequest { string token = 1; }
message MarkOnboardingSeenResponse {}
```

Then `cd backend && make proto-gen` and **commit** the regenerated
`auth.pb.go` + `auth_grpc.pb.go` (generated code is tracked in this repo).

### 1.8 gRPC transport

- `grpcapi/converters.go` — in `userToProto`, guard the nil pointer.
  `timestamppb.New` on a nil deref would panic; `CreatedAt`/`UpdatedAt` are
  non-nullable values, this one is not:

```go
if u.OnboardingSeenAt != nil {
	out.OnboardingSeenAt = timestamppb.New(*u.OnboardingSeenAt)
}
```

- `grpcapi/server.go` — add `MarkOnboardingSeen(ctx context.Context, userID string) error`
  to the `UsersSvc` interface (**the second interface**, distinct from the
  service-layer `Store`).
- `grpcapi/self.go` — new handler, mirroring `ChangePassword`:

```go
func (s *Server) MarkOnboardingSeen(ctx context.Context, req *authv1.MarkOnboardingSeenRequest) (*authv1.MarkOnboardingSeenResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.MarkOnboardingSeen(ctx, uid); err != nil {
		return nil, mapError(err)
	}
	return &authv1.MarkOnboardingSeenResponse{}, nil
}
```

No new error sentinel → no `mapError` change.

### 1.9 Gateway

- `clients/auth/session.go`:

```go
func (c *Client) MarkOnboardingSeen(ctx context.Context, token string) error {
	_, err := c.cc.MarkOnboardingSeen(ctx, &authv1.MarkOnboardingSeenRequest{Token: token})
	return err
}
```

- `transport/authhttp/dto.go` — add to `userJSON` and map it in `userToJSON`:

```go
OnboardingSeenAt string `json:"onboardingSeenAt,omitzero"`
```

Map from the proto with a nil guard:
`if ts := u.GetOnboardingSeenAt(); ts != nil { out.OnboardingSeenAt = ts.AsTime().Format(time.RFC3339) }`

- `transport/authhttp/handlers.go` — register right after `pr.Post("/me/password", …)`:
  `pr.Post("/me/onboarding", h.markOnboardingSeen)` (inside the
  `pr.Use(h.Authenticate)` group, **no** `h.require(...)` — it's a self route).
  Handler takes **no body**, so no `decode(...)` call:

```go
func (h *Handlers) markOnboardingSeen(w http.ResponseWriter, r *http.Request) {
	if err := h.client.MarkOnboardingSeen(r.Context(), bearer(r)); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

### 1.10 OpenAPI

`backend/services/gateway-service/api/openapi.yaml`:

- In `AuthUser` (line ~423), after `isOwner`:
  `onboardingSeenAt: { type: string, format: date-time }`
- New path, mirroring `/api/auth/me/password` but with **no `requestBody`**:

```yaml
  /api/auth/me/onboarding:
    post:
      tags: [auth]
      summary: Mark the first-run tour as seen
      security: [{ bearerAuth: [] }]
      responses:
        '204': { description: Marked }
        '401': { $ref: '#/components/responses/Unauthorized' }
```

### Verification (Phase 1)

```bash
cd backend && make proto-gen
cd services/auth-service && go generate ./... && go test ./...
cd ../gateway-service && go build ./...
git status --short backend/proto/gen   # regenerated pb.go must be staged
```

Anti-pattern guard: `grep -rn "omitempty" backend/services/gateway-service/internal/transport/authhttp/` must stay empty.

---

## Phase 2 — Frontend plumbing

Independently shippable: the flag reaches the client, nothing consumes it.

1. `cd frontend && yarn openapi:generate` → `src/shared/infrastructure/api/dto.ts`
   picks up `onboardingSeenAt`. (This file is lint-exempt; do not hand-edit it.)
2. `src/auth/domain/principal.ts` — add `onboardingSeenAt: string | null;`
3. `src/auth/infrastructure/auth-gateway.ts`:
   - `mapPrincipal`: `onboardingSeenAt: d.onboardingSeenAt ?? null,`
   - new mutation, mirroring `changePassword`:
     ```ts
     export function markOnboardingSeen(): Promise<void> {
       return httpPost<void>("/api/auth/me/onboarding");
     }
     ```
     `httpPost`'s body is optional and it returns `undefined` on 204 — no
     special-casing needed.

No change to `current-user.ts`, `layout.tsx`, or `current-user-context.tsx`: the
field rides along on `Principal` automatically.

### Verification (Phase 2)

```bash
cd frontend && yarn lint && yarn build
grep -n "onboardingSeenAt" src/shared/infrastructure/api/dto.ts   # proves regen ran
```

---

## Phase 3 — Onboarding domain (pure, fully tested, no UI)

Independently shippable: pure modules, zero imports into the app yet.

### 3.1 `src/onboarding/domain/tour-step.ts`

```ts
export interface TourStep {
  id: string;                          // also the data-tour attribute value
  title: string;
  body: string;
  tab?: "view" | "placements";         // reveal this OverlaysPanel tab first
  center?: true;                       // no anchor: render centred, no spotlight
}
```

`center` exists for the intro and the keyboard-shortcuts steps, which describe
the page rather than a button.

### 3.2 `src/onboarding/domain/tour-state.ts`

A pure state machine, mirroring `panorama/domain/marker-drag.ts` (the
established convention: an interface, an `IDLE` constant, pure transitions).

```ts
export interface TourState { steps: TourStep[]; index: number; active: boolean }
export const IDLE: TourState;
export function start(steps: TourStep[]): TourState;   // [] → stays inactive
export function next(s: TourState): TourState;         // past the last step → finish
export function prev(s: TourState): TourState;         // clamps at 0
export function skip(s: TourState): TourState;         // → IDLE-like, active:false
export function current(s: TourState): TourStep | null;
```

### 3.3 `src/onboarding/domain/viewer-tour-steps.ts`

The step data for the territory viewer, in visiting order. Copy lives here, in
`domain/` — never inline in a component.

| # | `id` (= `data-tour`) | Target | `tab` | Renders only when |
|---|---|---|---|---|
| 1 | — (`center`) | intro card | | always |
| 2 | `catalog-link` | `model-info-panel.tsx:26` "← Catalog" | | always |
| 3 | `reset-camera` | `reset-camera-button.tsx:9` | | always |
| 4 | `measure` | `measure-button.tsx:10` | | always |
| 5 | `overlays-tabs` | `overlays-panel.tsx:82` tab bar | | panel expanded |
| 6 | `panorama-picker` | `panorama-picker.tsx:62` "View" dropdown | `view` | `panoramas.length \|\| documents.length` |
| 7 | `toggle-markers` | `panorama-section.tsx:96` | `view` | `panoramas.length > 0` |
| 8 | `move-points` | `panorama-section.tsx:107` | `view` | `panorama:write` ∧ panoramas |
| 9 | `external-link` | `external-panorama-control.tsx:77` | `view` | `territory:write` |
| 10 | `add-panorama` | `panorama-section.tsx:145` | `view` | `panorama:write` |
| 11 | `add-document` | `panorama-section.tsx:154` | `view` | `document:write` |
| 12 | `add-object` | `create-placement-row.tsx:29` | `placements` | `placement:write` |
| 13 | `objects-list` | `objects-list.tsx` root | `placements` | always |
| 14 | `user-menu` | `user-menu.tsx:25` avatar | | always |
| 15 | — (`center`) | keyboard shortcuts card (`M`/`T`/`R`/`S`/`G`/`P`/`V`/`Esc`) | | always |

Steps 6–12 auto-skip when their target is absent. `Clear (N)`, `ModeToggle` and
`SnapToggle` get **no step**: they only exist after the user has measured or
selected something, which by definition hasn't happened on a first run. Their
behaviour is described in the copy of steps 4 and 13 respectively.

### 3.4 Tests — `src/onboarding/domain/tour-state.test.ts`

`node:test` + `node:assert/strict`, importing with the explicit `.ts` extension,
exactly as `marker-drag.test.ts` does.

- `start([])` → `active: false` (nothing to show; the overlay must never mount)
- `start(steps)` → `active: true`, `index: 0`, `current()` is step 0
- `next` walks forward one step at a time
- `next` on the last step → `active: false` (finish), `current()` is `null`
- `prev` clamps at index 0 and does not deactivate
- `prev` after `next` returns the previous step
- `skip` from any index → `active: false`
- `next`/`prev`/`skip` on `IDLE` are no-ops (never throw, never go negative)
- `current(IDLE)` is `null`

And `src/onboarding/domain/viewer-tour-steps.test.ts`:

- every `id` is unique (a duplicate would make `querySelector` ambiguous and
  spotlight the wrong button)
- every non-`center` step has a non-empty `id`, `title` and `body`
- every `center` step has no `tab`

Run: `cd frontend && yarn test`

---

## Phase 4 — Presentation and wiring

### 4.1 Widen `useAnchoredPosition`

`src/shared/presentation/components/dropdown/use-anchored-position.ts`:

```ts
export function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null> | string,
  enabled: boolean,
): AnchorRect | null
```

Inside the effect, resolve `typeof anchor === "string" ? document.querySelector(anchor) : anchor.current`,
and put `anchor` in the dep array so a changing selector re-measures. Returning
`null` for a missing element is already the contract. `dropdown-menu.tsx` is
unaffected.

### 4.2 `src/onboarding/presentation/tour-overlay.tsx`

Three stacked layers, following `confirm-modal.tsx` (plain `fixed inset-0`, no
portal — it is mounted deep inside `ModelViewer` rather than at the root, so
give it `z-[1200]` to clear the `z-[1000]` dropdown):

1. **Blocker** — `fixed inset-0 z-[1200]`, transparent, catches clicks so the
   user can't fire the button being explained. Click → next step.
2. **Spotlight** — `fixed` at the anchor rect, `pointer-events-none`,
   `rounded-lg ring-2 ring-cyan-300` and
   `shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]`. That one huge outer shadow *is* the
   dimmed backdrop with a hole punched in it — no SVG mask, no clip-path.
   Omitted entirely for `center` steps.
3. **Tooltip** — `z-[1210]`, `pointer-events-auto`, positioned with
   `position: fixed` + inline `top`/`left` derived from the rect, exactly as
   `dropdown-menu.tsx:21-28` does. Flip above the anchor when
   `rect.top + rect.height + tooltipHeight > innerHeight`. Styled with the
   `overlays-panel.tsx:61` glass string + `shadow-[0_20px_60px_rgba(0,0,0,0.6)]`.
   Contents: step title, body, `Back` / `Next` (`Done` on the last), and a
   `Skip` link. Transitions gated behind `motion-safe:`.
   **No `Step i of n` counter:** steps are skipped incrementally, so the
   denominator is unknowable without mounting the inactive tab just to count.
   A wrong total is worse than no total.

Accessibility: `role="dialog" aria-modal="true"` with `aria-labelledby` on the
title (as `confirm-modal.tsx:59-61`); `aria-live="polite"` on the body so a
screen reader announces each step; auto-`.focus()` the `Next` button on every
step change. Cyan focus rings (`focus-visible:ring-2 focus-visible:ring-cyan-300`).
**No focus trap** — the repo has none and inventing one here is out of scope
(see Deferred).

### 4.3 `src/onboarding/application/use-viewer-tour.ts`

Owns everything stateful. This is the only place `document.querySelector` runs.

- Input: `{ seen: boolean; setTab; setCollapsed }`.
- On mount, if `!seen`, `start(VIEWER_TOUR_STEPS)`.
- `useLayoutEffect` on `state.index`: reveal (`setCollapsed(false)`, and
  `setTab(step.tab)` when present), then if the step is not `center` and
  `document.querySelector('[data-tour="' + step.id + '"]')` is null → `next()`.
  Reveal-then-check runs in a layout effect so the tab has committed to the DOM
  before the query. Advancing is one step per commit, so a run of missing
  targets drains across successive commits and terminates at `active: false`.
- `document` keydown listener (as `confirm-modal.tsx:42-46`): `Escape` → skip,
  `ArrowRight`/`Enter` → next, `ArrowLeft` → prev. Register it **before** the
  viewer's own shortcuts see the key — the tour is modal, so `M`/`T`/`R`/`S`
  must not fire while it is up. `stopPropagation` + `preventDefault` on every
  handled key.
- On finish **or** skip: `markOnboardingSeen().catch(() => {})`.
  `// ponytail: swallow — worst case the tour replays on next login.`
  No `router.refresh()` (see Architecture decisions).

Returns `{ state, next, prev, skip, restart }`.

### 4.4 Control lift

- `overlays-panel.tsx` — replace the two local `useState`s with props
  `collapsed` / `onCollapsedChange`, `tab` / `onTabChange`. The existing
  render-time tab adjustment on `selectedPlacementId` calls `onTabChange`
  instead of `setTab`. Net line change ≈ 0.
- `model-viewer.tsx` — hold `tab` and `collapsed`, call `useViewerTour(...)`,
  render `<TourOverlay .../>` next to `<UIOverlay>`. Budget: ~3 added lines.
  Re-check the cap with `yarn lint` — if it trips, move the two `useState`s into
  `useViewerTour` and return them.

### 4.5 `data-tour` attributes

Add `data-tour="<id>"` to the 13 anchored targets from the §3.3 table. Pure
additive attributes — no ref plumbing, and `UIOverlay`'s `memo` is untouched
because nothing new is passed to it.

### 4.6 Restart affordance — **in scope**

Without it, `Skip` is irreversible and the flag is server-side, so a user who
skips can never see the tour again without a DBA. One `?` button in
`ui-overlay.tsx`, beside the existing hint bubble, calling `restart()`. It does
not clear the server flag; it just re-runs the tour in this session.

### Verification (Phase 4)

```bash
cd frontend && yarn lint && yarn test && yarn build
grep -rn 'data-tour="' src | wc -l   # expect 13
```

Anti-pattern guard: `grep -rn "querySelector" src/onboarding/domain/` must be empty.

---

## Phase 5 — End-to-end verification

There is no CI and no e2e harness, so this is a manual script. Run the app
(`yarn dev`), then:

1. **First run.** `UPDATE users SET onboarding_seen_at = NULL WHERE username = '<you>';`
   Reload `/territories/<slug>`. The tour starts automatically at step 1.
2. **Every button.** Walk `Next` to the end. Assert: the panel auto-expands at
   step 5; the tab flips to `view` at step 6 and to `placements` at step 12; the
   spotlight lands on the correct control each time; the tooltip never leaves the
   viewport at the top or bottom edge.
3. **Auto-skip.** Log in as a read-only user (no `panorama:write`,
   `placement:write`, `territory:write`, `document:write`). Steps 8–12 must be
   silently skipped; the tour must not stall, blank, or flash a card at the
   previous step's position.
4. **Empty territory.** Open a territory with zero panoramas and zero documents.
   Steps 6–8 skip; the tour still reaches the end.
5. **Skip persists.** Press `Esc` mid-tour. `curl` / DevTools: the
   `POST /api/auth/me/onboarding` returns `204`. Hard-reload → no tour.
   `SELECT onboarding_seen_at FROM users WHERE …` is non-null.
6. **Idempotency.** Fire the endpoint a second time; the timestamp must not
   change (that's the Phase 1.6 guard, verified live).
7. **Restart.** Click `?` → the tour replays. Reload → it does not.
   Then finish the tour and navigate catalog → territory **without reloading**:
   it must not replay. The principal is fetched once by the server layout and
   still says "unseen", so `seenThisSession` in `use-viewer-tour.ts` guards it.
8. **Modality.** While the tour is up, press `M` and `T`. Neither measure mode
   nor gizmo mode may activate. `Esc` exits the tour, and only then do the
   viewer shortcuts respond again.
9. **Reduced motion.** With "Reduce motion" enabled in the OS, no spotlight
   transition animates.

Final gate:

```bash
cd backend && make proto-gen && (cd services/auth-service && go test ./...)
cd ../frontend && yarn lint && yarn test && yarn build
```

---

## Deliberately skipped

| Not built | Add it when |
|---|---|
| **i18n of tour copy** | Nothing in the app is translated today — every string is English in the component. Add when a second locale lands, and do it app-wide, not for the tour alone. |
| **Tour versioning** (`onboarding_seen_version`) | A timestamp answers "has this user seen a tour", not "which one". Add an int column when the viewer's controls change enough that veterans should be re-onboarded. |
| **Analytics** (which step users skip at) | No analytics pipeline exists in this repo. Add when one does. |
| **e2e / jsdom tests of the overlay** | Would mean adding Playwright or jsdom + RTL to a repo with neither, plus a CI to run them. The pure reducer is unit-tested; the DOM layer is covered by the Phase 5 script. Add when CI exists. |
| **Focus trap in the tooltip** | The repo has no focus trap anywhere; the tooltip auto-focuses `Next` and `Esc` always exits, which is the same guarantee `confirm-modal.tsx` gives. Add if an accessibility audit demands full modal semantics — and then fix `ConfirmModal` and `ModelPickerModal` in the same pass. |
| **Steps for `Clear (N)` / `ModeToggle` / `SnapToggle`** | Their targets cannot exist on a first run. Add only if the tour is ever re-triggered *after* a measurement or selection exists. |
| **Tours on other pages** | Requirement is the territory viewer. The `onboarding/` context generalises for free — a second `*-tour-steps.ts` and a second `data-tour` set — but build it when a page actually needs it. |
| **A tour for the calibration sub-panel** (opacity, Fine/Med/Coarse, per-axis ±, yaw, Save/Exit) | Someone asks. Those controls only exist after clicking Calibrate, so they need their own tour keyed on that click. The machinery is already there — `useTour(id, steps, {seen, ready})` — it is one step list away. |
| **Esc to leave a panorama** | The only exits today are the panel toggle, the View list, and cycling with `P`. The panorama tour says so out loud rather than papering over it. Worth fixing on its own. |
