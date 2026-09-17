# Account v2 — the account page, the two-factor wizard and the passkey modals

Date: 2026-09-07. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mocks: Claude Design project `b5fa4afe-…`, files `Account v2.dc.html`,
`Two Factor Setup v2.dc.html` and `Passkey Modal v2.dc.html` (summaries with
every measurement, token and string in
`.superpowers/sdd/2026-09-07-account-v2/mocks/*.md`; the ledger directory is
git-ignored, the summaries are the working copy).

## Goal

The last self-service screen leaves the old SPA: `/account`, plus the two
continuations the mocks draw — the two-factor wizard (`/account/two-factor`)
and the passkey modals. Built to the mocks in the catalog shell, wired to the
real gateway. One gateway endpoint is added because the mock asks for facts the
server does not currently expose; everything else is already served.

## Decisions (user)

- **The dev origin is added to the passkey allowlist.** `docker-compose.yml`'s
  `PASSKEY_RP_ORIGINS` becomes `http://localhost:3000,http://localhost:3001`
  so the registration ceremony works from the v2 dev server and can be verified
  live. `PASSKEY_RP_ID` stays `localhost` — it already covers both ports.
- **The missing facts are fixed on the backend, not papered over.** A new
  `GET /api/auth/2fa` reports `enabled`, `enabledAt` and how many recovery
  codes are left. The authenticator's *app name* is not among them: the server
  never learns which app scanned the secret, and asking the user to type it
  would store an unverifiable string.
- **One wizard route, one modal.** `/account/two-factor` carries enable and
  regenerate (both end on the same "save these codes" screen); disabling is a
  small OTP modal on `/account`, because leaving the page to type six digits
  loses the context the user is acting on.
- **The activity feed is built to the mock, with pure helpers.** `action` stays
  verbatim and monospaced (as the console prints it); a `summaryOf(entry)`
  builds the second line and a `relativeAt(at, now)` renders `09:14` /
  `yesterday 18:20` / `05.09 11:37`. Both are pure and unit-tested.
- **The entry point is the sidebar identity block**, which becomes a link to
  `/account`; the page's back link reads `← Back to console` → `/console`.
- **The password rule shown is the password rule enforced** (8+ characters with
  an upper, a lower, a digit and a special). The mock's "At least 12
  characters" is stale copy, not a policy change.

## Rulings (controller)

Deviations from the mocks, all agreed with the user before this spec:

1. **"Turning it off asks for your password first" is false and is rewritten.**
   `POST /api/auth/2fa/disable` validates a TOTP code and nothing else — not a
   recovery code, not the password. The lede says so.
2. **The `app` row of the Authenticator card is not drawn.** Two rows remain:
   `added` (from the new endpoint) and `algorithm` (`TOTP · SHA1 · 6 digits`, a
   constant of the server's implementation, not a served field).
3. **The six masked `••••-••••` plates become a real count** — `7 of 10 codes
   left`. The codes themselves are unrecoverable by design; the remainder is
   not, and a real number beats a decoration.
4. **One passkey count.** The mock's posture card says 2 and its section says
   3; both read `passkeys.length`.
5. **The password hint states the enforced rule**, per the decision above.
6. **The "this device" chip is not drawn.** Nothing identifies the credential
   the current browser holds — the server does not mark it and the client
   cannot ask.
7. **The disabled state of the two-factor section is designed here**, since no
   mock draws it: border `line` (not `ok`), badge `off` tone `dim`, the lede
   rewritten to the "not on" voice, and one CTA — `Enable two-factor` → the
   wizard. The Authenticator and Recovery-codes cards are absent in that state.
8. **Empty and unsupported states are added to the passkey section**: an
   `EmptyState` when the list is empty, and, when `isPasskeySupported()` is
   false, one row explaining that this browser cannot hold passkeys, with the
   Add control gone (not disabled).
9. **The footer counts what is loaded**: `showing N events` where N is the rows
   actually fetched, and `Show more` only while the page reports a `nextCursor`.

Structural rulings:

- **Every mutation that changes a fact another surface reads invalidates it.**
  The old SPA does not: enabling 2FA in one section left `me.totpEnabled` stale
  in the sibling passkey section, which then asked for the wrong factor on
  removal. Here, 2FA enable/disable/regenerate invalidate `["me"]` and
  `["two-factor"]`; passkey add/remove invalidate `["passkeys"]`.
- **The recovery-codes screen is never addressable by URL.** The wizard's mode
  lives in `?mode=setup|regenerate`; the codes step is component state only. A
  URL that promises ten codes cannot keep that promise after a reload — the
  server issues them exactly once, in the response body of the call that
  created them.
- **`POST /api/auth/2fa/setup` runs on entering the wizard, not on mount of a
  shared component.** It writes (it persists the pending secret), so it is a
  mutation, fired once per entry, and its `409` (already enabled) renders a
  callout that links back rather than a toast.
- **A dismissed system prompt is not an error.** `NotAllowedError` and
  `AbortError` from the WebAuthn ceremony close the modal silently; every other
  failure goes through `notify.error(messageOf(err))` like the rest of v2.
- **The posture cards are local to the page.** `entities/metric`'s `StatTile` is
  nearly identical but its top-right slot is a plain delta string, not a tone
  pill; widening a metrics component for three account cards buys nothing.
- Both screens keep the catalog shell's frame (`px-9 pt-8 pb-[72px]`), with the
  page's own `max-w-[880px]` (account) / `max-w-[760px]` (wizard) centred
  column, per the mocks.

## 1. Backend

### 1.1 `GET /api/auth/2fa`

Session required, no CSRF (a GET). No parameters — the user is the session's.

```json
{ "enabled": true, "enabledAt": "2026-08-12T09:20:11Z",
  "recoveryRemaining": 7, "recoveryTotal": 10 }
```

- `enabledAt` is **omitted** when unknown: 2FA is off, or the row predates the
  migration below. The card's `added` line is then not drawn. No backfill —
  the timestamp was never recorded and cannot be invented.
- `recoveryRemaining` / `recoveryTotal` are `0` when 2FA is off.
- Declared in `backend/services/gateway-service/api/openapi.yaml`; v2 picks the
  DTO up through `yarn openapi:generate`.

### 1.2 twofa-service

- Migration `00002`: `ALTER TABLE twofa_credentials ADD COLUMN enabled_at
  TIMESTAMPTZ;` (Down drops it). `Enable` sets it to `now()`; `Disable` sets it
  to `NULL` alongside clearing the secret and the recovery codes. `Regenerate`
  does **not** touch it — it replaces codes, not the enrolment.
- A `Status` RPC in `rosneft/twofa/v1/twofa.proto` returns the four fields.
  `IsEnabled` stays: the passkey-delete step-up and `ValidateToken` use it and
  must not pay for the counts.
- The counts come from `twofa_recovery_codes`: total rows for the user, and
  those with `used_at IS NULL`.

### 1.3 docker-compose

`PASSKEY_RP_ORIGINS: "http://localhost:3000,http://localhost:3001"`. The
production override lives on the host and is untouched.

## 2. Dependencies and `shared/ui`

Two dependencies, both already vetted in `frontend/`, added at the same majors:
`@github/webauthn-json@^2.1.1` (the ArrayBuffer↔base64url handling for the
ceremony — not hand-rolled) and `qrcode.react@^4.2.0` (the wizard's QR).

`shared/ui/modal` gains a third `tone`: `warning` — border `warn`, head
`bg-warn-soft`, overline `text-warn`; `default` and `danger` are unchanged.
The mock's "Two-factor status unavailable" state needs it. Spec and fixture
updated with the new tone.

Everything else the mocks need already exists and is used as-is: `Button`,
`Badge`, `Card`, `Callout`, `Field`, `TextField`, `PasswordField` (its
`action` slot is the mock's `Generate`), `OtpInput`, `Avatar` (`variant="soft"`,
`size={44}`), `SectionHeading`, `DetailList`, `EmptyState`, `Skeleton`,
`Icon` (`lock`, `passkey`, `check`, `info`, `warning`), `ThemeToggle`
(`variant="compact"`), `features/recovery-codes`, `widgets/auth-steps`.

## 3. Entities and features

**`entities/user/api/account-gateway.ts`** — `changePassword`,
`twoFactorStatus`, `setup2FA`, `enable2FA`, `disable2FA`,
`regenerateRecoveryCodes`, plus `api/two-factor-query.ts`
(`queryKey: ["two-factor"]`). Exported through the slice's `index.ts`.

**`entities/passkey/`** (new slice):
- `model/passkey.ts` — the `Passkey` type, `isPasskeySupported()` (the single
  gate: `supported()` from the library, `false` inside the desktop shell), and
  `passkeyMeta(p)` → `Added 12.08.2026 · last used 07.09.2026` (the second
  clause omitted when never used).
- `model/webauthn.ts` — `createCredential(optionsJson)` and `isCancelled(err)`.
- `api/passkey-gateway.ts` — `listPasskeys`, `beginRegistration`,
  `finishRegistration`, `removePasskey(id, { code } | { password })`.
- `api/passkeys-query.ts` — `queryKey: ["passkeys"]`.
- `ui/passkey-row.tsx` — the mock's row (icon 32, name, meta, Remove pill).

**`features/passkey-manage/`**:
- `model/removal-factor.ts` — `removalFactor(totpEnabled: boolean | null)` →
  `"code" | "password" | "unavailable"`. The whole tri-state decision, pure.
- `ui/add-passkey-modal.tsx` — steps `name` → `ceremony`.
- `ui/remove-passkey-modal.tsx` — the three removal states.

## 4. Shell and routes

`accountRoute` (`/account`) and `twoFactorRoute` (`/account/two-factor`,
search `{ mode?: "setup" | "regenerate" }`) are children of `catalogRoute` in
`app/router/catalog-routes.tsx`, added to the tree in `router.tsx`.
`app/router/guard.ts`: both paths join `isCatalogHref`, so links between them
and the console route in-app instead of reloading the document.

`widgets/console-sidebar`: the identity block at the foot becomes an `<a
href="/account">` with the existing avatar and two lines, a focus-visible ring
and a hover border — the only entry point.

## 5. `pages/account`

Container hook `use-account.ts` with explicit phases: `loading` (skeletons),
`unavailable` (the principal itself failed — an `ErrorState`), `ready`. A
failed two-factor status or passkey list does **not** fail the page: each
section renders its own warn callout and disables its own actions, because the
password form and the activity feed are still usable.

Pure modules: `model/posture.ts` (the three cards from the principal, the 2FA
status and the passkey count, tri-state aware) and `model/activity.ts`
(`summaryOf`, `relativeAt`).

Sections, each its own file under `ui/`:

1. **Header** — back link, `Account` overline, `Avatar` + username + `email ·
   roleTitle`, `ThemeToggle variant="compact"` on the right.
2. **Posture** — three cards; `Two-factor` (`TOTP` / `Off` / `—` when the
   status is unknown), `Passkeys` (the count), `Password` (`Set`, badge
   `fallback`).
3. **Password** — two `PasswordField`s; the new one validated live by
   `validatePassword`; `Generate` fills and reveals; submit disabled while the
   current field is empty or the new one invalid; success clears both and
   toasts.
4. **Two-factor** — the enabled and disabled states of ruling 7, the
   Authenticator card (`added`, `algorithm`), the recovery card (`N of M codes
   left`, `Regenerate` → `/account/two-factor?mode=regenerate`), and `Disable
   2FA` → the OTP modal (`ui/disable-two-factor-modal.tsx`).
5. **Passkeys** — the count, `+ Add passkey`, the rows, the empty and
   unsupported states of ruling 8.
6. **My activity** — `useInfiniteQuery` over `GET /api/audit/mine`, rows per the
   mock, footer per ruling 9.

## 6. `pages/two-factor`

`use-two-factor.ts` drives three modes and the codes step:

- `setup` — `POST /2fa/setup` once on entry; left pane: `QRCodeSVG` of
  `otpauthUrl` at 172×172, the caption, `Can't scan? Show manual key` revealing
  the secret with `Copy`; right pane: the prompt, `OtpInput`, the error line,
  `Confirm` (disabled and labelled `Enter 6 digits` under six digits), `Cancel`
  → `/account`, and the three notes. `409` → a callout linking back.
- `regenerate` — the confirm pane only, two step chips (`1 · confirm`,
  `2 · save codes`); the code goes to `POST /2fa/recovery/regenerate`.
- `codes` — the step-3 screen: the ok-toned head naming the real username,
  `features/recovery-codes` for the grid, Copy all, Download .txt and `I saved
  them` (→ `/account`), and the warn callout about leaving without saving.

`model/steps.ts` is pure: mode → the three (or two) chips with their
active/done/pending tone.

## 7. Out of scope

Passkey **sign-in** in v2 (the login screen's ceremony is a separate package);
passkey rename (no endpoint exists); a password strength meter; session listing
or revocation; avatar upload; changing email or username; the admin-side
"require 2FA" toggle (the console already has it); the old SPA, which keeps its
own `/account` untouched.

## 8. Testing

- Every new module carries its own `*.spec.ts(x)`; every slice with JSX carries
  a `*.fixture.tsx`. `architecture.spec.ts` and `fixtures.spec.tsx` enforce
  both. Coverage thresholds stay 90/85/90/90.
- The pure decisions get red-first cases that fail on the deleted
  implementation: `removalFactor` across `true|false|null`, `summaryOf` across
  a territory event, a failed event and an auth event, `relativeAt` across
  today / yesterday / older and across a month boundary, `steps` per mode.
- Go: `make -C backend check` with `CC=/usr/bin/clang SDKROOT=$(xcrun
  --show-sdk-path)`, including a twofa-service test that the counts drop as
  codes are used and that `Disable` clears `enabled_at`.
- Live, in both themes, with computed-style measurements against the mock
  summaries (never by class name): the account page in the enabled, disabled
  and unknown 2FA states; a full enable → codes → disable cycle on a throwaway
  account with the TOTP code computed from the returned secret; a regenerate;
  and the passkey add/remove ceremony driven by a Chrome DevTools Protocol
  **virtual authenticator**, so the ceremony really runs headless instead of
  being mocked.
- The compose stack is rebuilt before any live check that follows a backend
  change: `docker compose -f docker-compose.yml up --build -d twofa gateway`
  (`twofa` carries the migration and the new RPC, `gateway` the handler), and
  `docker compose -f docker-compose.yml up -d passkey` to recreate the passkey
  service with the widened `PASSKEY_RP_ORIGINS` — an env change needs a
  recreate, not a rebuild.

## 9. Order of work

1. Backend: migration, `Status` RPC, gateway handler, OpenAPI, compose origin.
2. Dependencies, the `Modal` `warning` tone, regenerated `dto.ts`.
3. `entities/user` account gateway + `entities/passkey` + `features/passkey-manage`.
4. `pages/account` with its sections and the disable modal.
5. `pages/two-factor`.
6. Routes, the guard, the sidebar link; docs (`frontend-v2/CLAUDE.md`, root
   `CLAUDE.md`'s "Two frontends" paragraph and the endpoint list).
