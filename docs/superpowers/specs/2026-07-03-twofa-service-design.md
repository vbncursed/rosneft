# twofa-service — extract 2FA into its own microservice

**Date:** 2026-07-03
**Status:** design, awaiting review

## 1. Context & current state

2FA/TOTP is **already fully implemented end-to-end** inside `auth-service` and
its frontend: enroll (secret + `otpauth://` + QR), enable (10 hashed one-time
recovery codes), disable, the two-step login challenge (Redis pending token,
5-min single-use `GETDEL`), recovery-code fallback, AES-256-GCM encryption of
secrets at rest, gateway HTTP endpoints, OpenAPI, and the React UI. It works.

The task is **not** to build 2FA — it is to (a) relocate it into a dedicated
`twofa-service` for architectural consistency with the rest of the
microservice backend, and (b) close the real remaining gaps while doing so.

Real gaps in the current implementation:
- No rate-limit on the verify step — recovery/TOTP codes are brute-forceable
  within the 5-min pending window.
- TOTP issuer hardcoded to `"Andrey"` in `bootstrap/service.go:42`.
- Dead code: `domain.Err2FARequired`, `totp.GenerateNow`.
- No recovery-code regeneration.

### Decision & recorded assumptions

- **Chosen approach:** a separate `twofa-service` (user's explicit choice over
  the recommendation to keep it in auth). The service owns all 2FA data.
- **Migration assumption:** no production users have 2FA enabled yet (pre-launch
  internal tool). → twofa migration creates empty tables, auth migration drops
  the old columns. **Confirm before deploy.** A fallback data-copy path is in
  §7 if this proves false.
- **Recovery-code regeneration:** in scope, but as the final, separately
  cuttable phase (§6).

## 2. Architecture — clean split of ownership

`twofa-service` owns everything 2FA:
- tables `twofa_credentials(user_id PK, secret BYTEA, enabled BOOL NOT NULL
  DEFAULT false)` and `twofa_recovery_codes(id, user_id, code_hash, used_at)`
- the AES key that encrypts secrets, all TOTP/recovery logic
- a per-user verify rate-limit (its own Redis DB)

`auth-service` stays the **sole authority for passwords and sessions**. It loses
`users.totp_secret`, `users.totp_enabled`, and the `recovery_codes` table. It no
longer decrypts secrets or matches recovery codes — it asks `twofa-service`.

**No denormalized `totp_enabled` flag on `users`.** At this app's login volume
one extra gRPC hop per login is invisible, and denormalization would add a
cross-service sync path. `// ponytail: auth calls twofa.IsEnabled on login; only
denormalize the flag if login throughput ever measurably hurts.`

Cross-service dependencies (runtime gRPC clients, no proto cycle):
- `auth-service` → `twofa-service`: `IsEnabled`, `Verify` (login orchestration).
- `twofa-service` → `auth-service`: `ValidateToken` (resolve userID for the
  authenticated management RPCs) and `GetUser` (resolve the username used as the
  `otpauth://` account label in Setup, since `ValidateTokenResponse` carries only
  `user_id`).

## 3. Service layout

New Go module `services/twofa-service` in `go.work`, mirroring `auth-service`:

```
services/twofa-service/
  cmd/twofa/main.go
  Dockerfile
  go.mod
  internal/
    config/config.go            # TWOFA_GRPC_ADDR, TWOFA_DB_DSN, TWOFA_REDIS_ADDR,
                                 # TWOFA_REDIS_DB, TWOFA_SECRET_KEY, TWOFA_ISSUER,
                                 # TWOFA_AUTH_GRPC_ADDR, TWOFA_VERIFY_MAX_FAILS,
                                 # TWOFA_VERIFY_LOCKOUT
    bootstrap/service.go
    transport/grpcapi/{server.go, self.go, verify.go, converters.go}
    service/twofa/{twofa.go, setup.go, enable.go, disable.go, verify.go,
                   regenerate.go}   # relocated from auth-service, ~verbatim
    totp/{totp.go, recovery.go}     # relocated (drop GenerateNow)
    secret/aesgcm.go                # relocated
    storage/credentials/{store.go, get.go, set.go}  # twofa_credentials
    storage/recovery/store.go       # relocated → twofa_recovery_codes
    ratelimit/store.go              # Redis per-user verify counter (new)
    clients/auth/client.go          # ValidateToken + GetUser gRPC client
    migrate/migrations/00001_init.sql
```

The moved packages (`service/twofa`, `totp`, `secret/aesgcm`,
`storage/recovery`) are **relocations, not rewrites** — same code, same tests,
import paths and the `Store` backing swapped from the users table to
`twofa_credentials`. `service/twofa.Store.GetByID` becomes a lookup in
`twofa_credentials` (returns secret + enabled) instead of a full `users` row.

## 4. Proto — `proto/rosneft/twofa/v1/twofa.proto`

```
service TwoFAService {
  // management (caller authenticated via bearer token → auth.ValidateToken)
  rpc Setup(SetupRequest) returns (SetupResponse);              // {token} → {secret, otpauth_url}
  rpc Enable(EnableRequest) returns (EnableResponse);           // {token, code} → {recovery_codes}
  rpc Disable(DisableRequest) returns (DisableResponse);        // {token, code}
  rpc RegenerateRecoveryCodes(RegenRequest) returns (RegenResponse); // {token, code} → {recovery_codes}
  // called by auth-service during login (internal, by user_id)
  rpc IsEnabled(IsEnabledRequest) returns (IsEnabledResponse);  // {user_id} → {enabled}
  rpc Verify(VerifyRequest) returns (VerifyResponse);           // {user_id, code} → {valid}
}
```

Regenerate the Go stubs via the backend `Makefile` proto target.

## 5. Login orchestration (auth-service changes)

`service/auth` login `Service`:
- **Remove** `RecoveryStore` and `Decryptor` deps and the local TOTP/recovery
  logic from `login.go`/`login_2fa.go`.
- **Add** a `TwoFAVerifier` interface `{ IsEnabled(ctx, userID) (bool, error);
  Verify(ctx, userID, code) (bool, error) }`, backed by a twofa gRPC client.
- `login.go`: replace `if u.TOTPEnabled` with `if enabled, _ :=
  twofa.IsEnabled(u.ID)`. Pending-challenge creation and session issuance stay
  in auth unchanged.
- `login_2fa.go`: replace decrypt+validate+recovery-fallback with a single
  `twofa.Verify(userID, code)`; on true → issue session, on false →
  `Err2FAInvalidCode`.
- Delete auth's `Setup2FA/Enable2FA/Disable2FA` gRPC handlers (`grpcapi/self.go`
  2FA methods) and the corresponding `auth.proto` RPCs — they move to twofa.
- Drop the dead `domain.Err2FARequired` and its `server.go` mapping.
- The pending 2FA challenge (Redis, `session/pending_2fa.go`) **stays in auth** —
  auth owns session issuance, so it owns the challenge lifecycle.

## 6. Gateway & frontend

**Gateway:** add a `twofa` gRPC client. Re-point the management HTTP handlers to
twofa; login stays on auth.
- `POST /api/auth/2fa/setup|enable|disable` → twofa client (paths unchanged).
- `POST /api/auth/2fa/recovery/regenerate` → twofa `RegenerateRecoveryCodes`
  (**new**; final cuttable phase).
- `POST /api/auth/login`, `/api/auth/login/2fa` → auth (unchanged shape).
- `User.totpEnabled` in the user DTO: gateway fills it via `twofa.IsEnabled`
  when composing the principal (or auth proxies it — decide in plan; prefer
  gateway compose to keep auth free of twofa on the read path).
- Update `openapi.yaml`: keep existing 2FA schemas, add the regenerate path.

**Frontend:** the setup/enable/disable/login flows are unchanged (same
endpoints, same JSON) — no work beyond the regenerate addition:
- `two-factor-section.tsx`: add a "Regenerate recovery codes" action (prompts
  for a current TOTP code, shows the new codes via existing `recovery-codes.tsx`).
- `auth-gateway.ts`: add `regenerateRecoveryCodes(code) → string[]`.
- **Cut line:** dropping recovery-regen removes only these two frontend edits,
  the gateway route, and the twofa RPC. Nothing else depends on it.

## 7. Data model & migration

**twofa-service migration `00001_init.sql`:** create `twofa_credentials` and
`twofa_recovery_codes` (+ `user_id` index), and the goose version table
`twofa_goose_db_version`. Shares the `andrey` Postgres DB (same pattern as auth
sharing with catalog).

**auth-service migration (new):** `DROP COLUMN users.totp_secret,
users.totp_enabled; DROP TABLE recovery_codes;` — runs **after** twofa is
deployed and migrated.

**Under the recorded assumption (no enrolled users):** the two migrations are
independent; empty tables in, columns dropped, done.

**Fallback if prod has enrolled 2FA users** (both services share the physical
`andrey` DB, so a cross-table copy is possible):
1. twofa migration additionally
   `INSERT INTO twofa_credentials(user_id, secret, enabled)
    SELECT id, totp_secret, totp_enabled FROM users WHERE totp_secret IS NOT NULL;`
   and copies live rows from `recovery_codes`.
2. `TWOFA_SECRET_KEY` **must equal** the current `AUTH_SECRET_KEY` value so the
   copied ciphertext decrypts.
3. Only then run the auth drop-column migration. Deploy order: twofa up+migrated
   → verify → auth migration.

## 8. Security hardening (part of "finish")

- **Verify rate-limit:** `ratelimit/store.go` — per-`user_id` fail counter in
  twofa's Redis with a lockout window (`TWOFA_VERIFY_MAX_FAILS`,
  `TWOFA_VERIFY_LOCKOUT`). `Verify` checks lockout first, increments on a wrong
  code, clears on success. Mirrors auth's existing `IsLocked/RegisterFail/
  ClearFails` password throttle. Closes the brute-force gap.
- **Issuer configurable:** `TWOFA_ISSUER` (default `Andrey`), replacing the
  hardcode.

## 9. Config, compose, deploy

New compose service `twofa` (mirror the `auth` block): build from
`services/twofa-service/Dockerfile`, `expose 9006`, `depends_on` postgres+redis,
env: `TWOFA_GRPC_ADDR=:9006`, `TWOFA_DB_DSN` (andrey DB),
`TWOFA_REDIS_ADDR=redis:6379`, `TWOFA_REDIS_DB=2`, `TWOFA_SECRET_KEY`
(= AUTH_SECRET_KEY value), `TWOFA_ISSUER=Andrey`,
`TWOFA_AUTH_GRPC_ADDR=auth:9004`. Add a client address to the services that call
twofa: `AUTH_TWOFA_GRPC_ADDR=twofa:9006` (auth) and `GATEWAY_TWOFA_GRPC_ADDR=
twofa:9006` (gateway). Prod deploy uses `-p andrey` (see deploy notes); DB
auto-migrates on boot.

## 10. Testing

- Relocated packages keep their unit tests (`twofa_test`, `totp_test`,
  `aesgcm_test`, recovery).
- New: rate-limit lockout test; regenerate test; auth login-orchestration test
  with a mocked `TwoFAVerifier` (asserts `IsEnabled` gates the challenge and
  `Verify` gates session issuance).
- `go build ./...` + `go test ./...` across the workspace; `yarn lint && yarn
  build` for the frontend.

## 11. Out of scope

- Any 2FA method other than TOTP (SMS/email/WebAuthn).
- Per-territory or admin-forced 2FA policy.
- Denormalizing `totp_enabled` back onto `users` (see §2 ponytail note).

## 12. Open questions

1. Confirm the no-enrolled-users assumption (§1/§7) before deploy.
2. `User.totpEnabled` read path: gateway-compose via `twofa.IsEnabled` vs auth
   proxy — resolve in the implementation plan.
