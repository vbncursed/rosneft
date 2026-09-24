# Two-factor required gate — design

Date: 2026-09-24. Mock: Claude Design project `b5fa4afe-073c-4f90-8239-acaff290c342`,
`Two Factor Required v2.dc.html` (stages `gate` and `done`).

## Problem

An administrator can require a second factor of an account (`POST /api/auth/users/{id}/2fa/require`,
`users.totp_required`). The gateway enforces it: a session whose account is required and has
no TOTP enrolled gets `403 {code:"twofa_enrollment_required"}` on every path except
`/api/auth/me`, `/api/auth/logout`, `/api/auth/2fa/setup`, `/api/auth/2fa/enable`,
`/api/auth/2fa/recovery/regenerate` (`gateway-service/internal/transport/authhttp/enrollment.go`).

The SPA knows none of this. Reproduced live on 2026-09-24 (Playwright, user `enroll1`):

- after sign-in Home shows only "Home is unavailable: enroll a second factor to continue" — no
  header, no sign-out, no way to the 2FA wizard;
- `/territories`, `/console/*`, `/account` show the same kind of dead end (every data call 403s);
- `/account/two-factor` works (it calls only `setup`/`enable`), but its Cancel and "← Account"
  lead back to `/account`, which 403s.

The backend needs no change: `/api/auth/me` already carries `totpRequired` and `totpEnabled`.

## Decisions

1. **One rule, in the SPA, identical to auth-service's**:
   `mustEnroll(me) = me.totpRequired && me.totpEnabled === false`
   (`auth-service/internal/service/auth/validate_token.go`: only TOTP counts; a passkey does not).
   `totpEnabled` absent (twofa unreachable for the factors call) is *not* `false`, so it does not
   gate — the gateway is still the enforcer and the 403 path (4) catches the rest.
2. **Flow: gate → existing wizard → done.** No second wizard.
3. **Router gate.** The `catalogRoute` and `consoleRoute` loaders already `ensureQueryData(meQuery)`.
   After it, a pure decision in `app/router/guard.ts` — `enrollmentRedirect(me, pathname)` —
   answers `/two-factor-required` when `mustEnroll(me)` and the path is not one of the allowed
   ones (`/two-factor-required`, `/account/two-factor`); the loader throws `redirect` on it.
4. **Mid-session requirement.** An admin can require 2FA of a signed-in user; the gateway applies
   it on the next request while the SPA holds a stale `me`. `shared/api/client.ts`, beside its 401
   branch, turns a `403` whose body `code` is `twofa_enrollment_required` into
   `location.assign("/two-factor-required")` — a full load, so the stale cache goes with it.
   The code is a named constant, not an inline string.
5. **New route `/two-factor-required`**, a child of the root route (outside every shell, like the
   404 page): `beforeLoad` sends a visitor without the session marker to `/login?next=…`; the
   loader loads `meQuery`. The screen then shows
   - `gate` when `mustEnroll(me)`;
   - `done` when not, and the search has `stage=done`;
   - otherwise redirects to `/` (an enrolled account has no business here).
   The path is added to `CATALOG_PATHS` so in-app links to it stay in the SPA.
6. **Wizard exits** (`pages/two-factor`), decided from `me`, no new URL parameters:
   - Cancel and "← Account" / "Back to your account" lead to `/two-factor-required` while
     `mustEnroll(me)`; to `/account` otherwise (unchanged);
   - after the codes are saved in `mode=setup`, an account with `totpRequired` goes to
     `/two-factor-required?stage=done`; everyone else to `/account` (unchanged).

## The screen (pages/two-factor-required)

Built to the mock with the app's tokens and components.

- **Page**: `min-h-dvh` column, padding 32px 32px 56px (16px sides on a phone), gap 40px; card
  centred in the remaining height.
- **Header**: `Andrey Viewer` (mono, accent, 10px, tracking 0.24em — plain text, as drawn);
  right: `ThemeToggle variant="compact"` and a static identity chip — `Avatar` (initials) +
  username — a `<span>`, not `AccountPill`: the mock draws no menu, and the pill's Account item
  leads to a page that 403s.
- **gate card** (max-w 560, border `accent-line`, radius 16, `panel`, elevation):
  lock icon tile (accent, 38px) + badge `two-factor required`; h1 `Set up two-factor to continue`;
  body `An administrator requires a second factor on your account. Territories, models and the console stay closed until an authenticator app is linked.`;
  ordered list:
  - `01` `Open an authenticator app` — `1Password, Google Authenticator or any TOTP app on your phone.`
  - `02` `Scan the code and confirm six digits` — `A manual key is there if the camera can't read the QR.`
  - `03` `Save the recovery codes` — `They are shown once. Each one gets you in if the phone is lost.`

  footer (`panel-2`, top border): `Sign out` (text button, `useSignOut()`), and the primary
  `Set up two-factor →` — a link to `/account/two-factor`.
- **done card** (border `ok`): check icon tile (ok) + badge `two-factor on`; h1 `You're all set`;
  body `From the next sign-in you'll be asked for a code after your password. Recovery codes can be regenerated from Account.`;
  footer: primary `Continue to territories` → `/territories`.
- Icons from `shared/ui/icon` (runeicons rule in `frontend/CLAUDE.md`); add `lock`/`check` there
  only if missing. The mock's local theme toggle is the app-wide `ThemeToggle`, as on the 404 page.

## Testing

- Unit: `mustEnroll` (required+not enrolled, enrolled, not required, `totpEnabled` absent);
  `enrollmentRedirect` over the allowed/blocked paths; the client's 403 branch (the code redirects,
  any other 403 still throws); the screen (gate vs done vs redirect, sign-out wired, link targets);
  the wizard's exits for a required and a free account.
- A router-level spec (the `createAppRouter` factory exists) that a must-enroll principal landing
  on `/` and on `/console` ends on the gate.
- Cosmos fixtures for both cards.
- Live, Playwright against the local stack as `enroll1`: sign-in lands on the gate; `/territories`
  and `/console` redirect to it; Sign out works; the wizard with a real TOTP code (secret from the
  `setup` response) ends on `done`; Continue opens a working `/territories`; requiring 2FA of a
  signed-in second user sends their next request to the gate.

## Out of scope

- Backend changes.
- Passkey-only accounts are gated like everyone else; that is the backend's rule.
- The wizard's existing reload-during-codes dead end (422 "already on") is not gate-specific.
