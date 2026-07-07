# Passkey passwordless login — design

**Date:** 2026-07-07
**Status:** approved (design), pending implementation plan

## Goal

Add passkey (WebAuthn) sign-in for a convenient, fast, one-tap login. A passkey
is a **passwordless primary factor**: the user signs in with a single tap, no
password. Password remains as the fallback login method. Enrollment happens on
the account page, mirroring the existing 2FA section.

## Decisions (locked)

1. **Passwordless primary.** Passkey replaces the password at login; password
   stays as fallback. Not a second factor.
2. **Usernameless (discoverable credentials).** One "Sign in with passkey"
   button → the browser shows the account picker from that device. `begin-login`
   carries no identifier; credentials are resident/discoverable (resident keys).
3. **Separate `passkey-service`.** Mirrors the twofa-service split: its own
   `go.mod`, Postgres, migrations, gRPC surface, bootstrap, and `clients/auth`.
   It **never mints a session** — only auth-service does. auth orchestrates the
   passkey login finish and mints the session, exactly as it does for
   `LoginVerify2FA`.
4. **Passkey login skips TOTP.** A passkey with user verification
   (biometric/PIN) is already phishing-resistant MFA (device + verification), so
   passkey login mints a session directly even when the user has TOTP enabled.
5. **`@github/webauthn-json` on the frontend** for base64url ⇄ ArrayBuffer
   encoding of challenge / credential-id / public-key. The WebAuthn wire format
   is spec-fiddly; the library's `create()` / `get()` wrappers are correct on
   edge cases.

## Responsibility split (symmetry with twofa)

| Concern | Password (today) | TOTP (today) | Passkey (new) |
| --- | --- | --- | --- |
| Factor storage | auth (`users` hash) | twofa-service | **passkey-service** |
| Mints session | auth | auth | **auth** |
| Orchestrates login | auth | auth (calls `twofa.Verify`) | **auth (calls passkey)** |
| Enrollment caller | — | gateway → twofa directly | **gateway → passkey directly** |

`passkey-service` does exactly two things: store credentials (Postgres) and run
WebAuthn ceremonies (crypto). It resolves `user_id` for authenticated
(enrollment) calls via `auth.ValidateToken`, mirroring how twofa resolves the
caller from the forwarded bearer token.

## Backend

### passkey-service (new, mirror twofa-service layout)

- **Library:** `github.com/go-webauthn/webauthn`. Uses
  `BeginDiscoverableLogin` / `FinishDiscoverableLogin` for the usernameless
  flow; the user entity implements the `webauthn.User` interface.
- **Postgres table `credentials`:** `id`, `user_id`, `credential_id` (bytea,
  unique), `public_key` (bytea), `sign_count`, `transports`, `aaguid`, `name`,
  `created_at`, `last_used_at`. Migration `00001_init.sql`.
- **Redis ceremony state:** go-webauthn returns `SessionData` (the challenge) at
  begin that must persist until finish. Stored in Redis under a short TTL (~5
  min), keyed by an opaque flow-id. Required for usernameless begin (no user yet
  → server-side state). Reuses the **shared `redis:6379` container** on a new
  logical DB: `PASSKEY_REDIS_DB=3` (auth=1, twofa=2 already taken). No new Redis
  container — same pattern as twofa.
- **RP config via env:**
  - `PASSKEY_RP_ID` = `andrey.vbncursed.fun` (prod) / `localhost` (dev)
  - `PASSKEY_RP_ORIGINS` = `https://andrey.vbncursed.fun` (prod) +
    `http://localhost:3000` (dev)
  - `PASSKEY_RP_NAME` = `Andrey`

  The site is served at `https://andrey.vbncursed.fun` over HTTPS, so WebAuthn's
  HTTPS+real-domain requirement is satisfied.
- **gRPC surface** (`backend/proto/rosneft/passkey/v1/passkey.proto`):
  - `BeginRegistration(userToken)` → options + flowId. Validates token → user_id
    via auth; builds the WebAuthn user entity (username as display name).
  - `FinishRegistration(userToken, flowId, attestation, name)` → stores the
    credential.
  - `ListCredentials(userToken)` → the user's passkeys (name, created, last
    used).
  - `DeleteCredential(userToken, credId)` → remove a passkey.
  - `BeginLogin()` → options + flowId. Empty `allowCredentials` (usernameless /
    discoverable).
  - `FinishLogin(flowId, assertion)` → **verified user_id** (NOT a session).
    Internal — called only by auth. Verifies the assertion signature against the
    stored public key, checks sign-count regression, updates `last_used_at`.

### auth-service (additions, mirror Login / LoginVerify2FA)

- Add `clients/passkey`.
- `PasskeyLoginBegin()` → proxies `passkey.BeginLogin`.
- `PasskeyLoginFinish(flowId, assertion)` → calls `passkey.FinishLogin` → gets
  user_id → **checks user status (active / not frozen / not deleted)** → mints
  session (local) → returns token. Skips the TOTP step by design.

### gateway

- `/api/auth/passkey/register/{begin,finish}`, `GET /api/auth/passkey/credentials`,
  `DELETE /api/auth/passkey/credentials/{id}` → passkey client, behind
  `Authenticate` (mirrors the 2fa setup/enable/disable routes).
- `/api/auth/passkey/login/{begin,finish}` → auth client, **public** (mirrors
  `/api/auth/login` and `/api/auth/login/2fa`).
- Add the paths to `api/openapi.yaml`.

## Frontend

- **Login form (`login-form.tsx`):** add a "Sign in with passkey" button →
  `begin` → `navigator.credentials.get()` (via `@github/webauthn-json`'s
  `get()`) → `finish`. On success the Next route sets the session cookie and
  redirects — identical to the password path.
- **Account page:** new "Passkeys" section (mirror `two-factor-section.tsx`):
  list registered passkeys, "Add passkey" (register ceremony via
  `@github/webauthn-json`'s `create()`), delete a passkey.
- **BFF routes — only two new ones:** `/api/auth/passkey/login/begin` and
  `/api/auth/passkey/login/finish` (finish calls `setSession`, like
  `/api/auth/login`). Both public. Registration / list / delete are
  authenticated and already flow through the existing catch-all
  `/api/[...path]` route (it forwards cookie → bearer). No dedicated routes for
  those.

## Login flow (end to end)

1. Click "Sign in with passkey" → `POST /api/auth/passkey/login/begin` →
   gateway → `auth.PasskeyLoginBegin` → `passkey.BeginLogin` → returns publicKey
   options + flowId; passkey-service stashes the challenge in Redis.
2. Browser `navigator.credentials.get({ publicKey })` → assertion.
3. `POST /api/auth/passkey/login/finish` (assertion + flowId) → gateway →
   `auth.PasskeyLoginFinish` → `passkey.FinishLogin` verifies the assertion
   against the stored public key and returns user_id → auth checks user status →
   mints session token.
4. Next route `setSession(token)` (HttpOnly cookie), redirect. TOTP is skipped.

## Security notes

- **User status enforced at mint:** auth checks active / not-frozen /
  not-deleted before minting, same as password login. passkey-service only
  attests "this assertion belongs to user_id".
- **Sign-count regression** rejected in `FinishLogin` (cloned-authenticator
  signal).
- **No user enumeration:** usernameless begin returns no `allowCredentials`, so
  the begin response does not reveal whether an account exists.
- **Ceremony state TTL** (~5 min) bounds replay of a begin challenge.
- Rate limiting on `login/begin` is not built now (challenge generation is
  cheap and usernameless begin leaks nothing). // ponytail: add a light limiter
  if abuse shows up.

## Testing (one runnable check per non-trivial unit)

- passkey-service `FinishLogin`: valid assertion → user_id; tampered signature →
  rejected; sign-count regression → rejected.
- auth `PasskeyLoginFinish`: frozen/deleted user → no session minted.
- Frontend encoding helper (if any wrapper code beyond the library): small unit
  on base64url round-trip.

## Out of scope (YAGNI)

- Conditional-UI autofill (passkey suggested inside the email field). Explicit
  button only.
- Passkey as a second factor alongside password (decided against — passwordless
  primary only).
- Cross-device / hybrid QR flows beyond what the platform authenticator offers
  natively.
- Per-account credential quota / naming policy beyond a free-text name.
