# Keep me signed in — design

Date: 2026-09-03
Status: approved, ready for planning

## Problem

`Login v2.dc.html` draws a checkbox under the password field: **Keep me signed
in on this device**, checked by default. `frontend-v2` built it
(`features/login/ui/credentials-form.tsx`) and then hid it in `a5139c3`,
because nothing acted on it: `LoginRequest` has no such field and the gateway
sets the session cookie with a fixed `Max-Age` of 720 hours whatever the user
ticked. A control that claims to limit exposure on a shared machine and does
not is worse than no control.

The checkbox comes back, and the gateway starts honouring it.

## What the checkbox means

The session has two halves, and the checkbox governs exactly one of them.

| | checked (default) | unchecked |
| --- | --- | --- |
| Browser cookie | persistent, `Max-Age` = `session-cookie-ttl` (720 h) — as today | **browser-session cookie**: no `Max-Age`, no `Expires`; the browser drops it when it closes |
| Server session (auth-service, Redis) | idle 24 h sliding, absolute 720 h — unchanged | unchanged |

Unchecked therefore reads: *close the browser and you are signed out*. That is
the promise the label makes, and it is delivered entirely by the cookie's
lifetime. The server-side session needs no second policy: an unchecked login
that is not used dies after the existing 24 h idle window, and one that is
used stays valid exactly as long as the browser holding its cookie stays open.

Not done, deliberately: a shorter *absolute* TTL for unchecked sessions. It
would need a field on the `Login` RPC and on the pending-2FA payload in Redis,
for a difference no user can observe. Add it if a threat model ever asks for
"an unchecked session may not outlive N hours even in an open browser".

## API

`remember` is an **optional** boolean on both `LoginRequest` and
`Login2FARequest`, **default `true`**:

- **Absent behaves exactly as today.** `frontend/` (v1) and the desktop shell
  send no such field and keep their persistent cookie; nothing they do
  changes.
- `false` issues the browser-session cookie.
- The 2FA step repeats the choice because the gateway keeps no state between
  the two calls. The challenge token is auth-service state and carries
  nothing but the user id; teaching it a cookie preference would couple two
  services for a boolean the client already holds.
- Passkey login has no checkbox in the mock and stays persistent.

The decision is made once, in the gateway: `setSession(w, token, persist)`.
`persist` is `req.Remember == nil || *req.Remember`. Go's `http.Cookie`
omits `Max-Age` and `Expires` when `MaxAge` is 0 and `Expires` is zero, which
is what a session cookie is.

## frontend-v2

- `useLogin` regains `remember` state, `true` initially — the mock draws the
  box checked — and hands `remember`/`onRememberChange` to `CredentialsForm`,
  whose optional props already exist.
- `login(identifier, password, remember)` and
  `verifyTwoFactor(challengeToken, code, remember)` send the field on both
  calls.
- `dto.ts` is regenerated from the gateway's contract.
- The paragraph in `frontend-v2/CLAUDE.md` and `README.md` that explained
  why the checkbox was hidden is replaced by one sentence saying what it does.

## Testing

Gateway, `internal/transport/authhttp`:

- `cookie_test.go`: `setSession(_, _, false)` writes a cookie with
  `MaxAge == 0`, zero `Expires`, and a raw header without `Max-Age`; the
  hardening attributes (HttpOnly, Secure, Path, SameSite) are identical on
  both branches.
- `handlers_test.go`: through the real handlers against an in-process gRPC
  stub of auth-service — `remember: false` on `/api/auth/login` and on
  `/api/auth/login/2fa` yields a session cookie; a body with no `remember`
  yields the 720 h cookie. A pure predicate alone would not do: the desktop
  shell records a vulnerability that shipped because a correct predicate was
  called with the wrong input.

frontend-v2:

- `auth-gateway.spec.ts`: both calls put `remember` in the request body.
- `use-login.spec.ts`: the toggle reaches both gateway calls; the default is
  `true`.
- `credentials-form.spec.tsx` already covers the checkbox itself.

## Live check

Against the local compose stack, `curl -i` both bodies and read `Set-Cookie`;
then in a browser on `:3001`, sign in unchecked, close the browser, reopen —
`/console` must bounce to `/login`.
