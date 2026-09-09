# Keep me signed in — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "Keep me signed in on this device" checkbox is drawn again on the v2 login screen, and unticking it makes the gateway issue a browser-session cookie instead of a 720-hour one.

**Architecture:** One optional boolean, `remember` (default `true`), on `LoginRequest` and `Login2FARequest`. The gateway decides the cookie's lifetime in `setSession(w, token, persist)`; auth-service and the Redis session are untouched. frontend-v2's login container regains the `remember` state it had before `a5139c3` and sends it on both calls.

**Tech Stack:** Go 1.27 (chi, testify/suite, gotest.tools/v3, grpc), OpenAPI 3 YAML, Vite + React 19 + TypeScript 7, vitest, openapi-typescript.

**Spec:** `docs/superpowers/specs/2026-09-03-keep-me-signed-in-design.md`

## Global Constraints

- **`remember` absent ⇒ today's behaviour** (persistent cookie, `Max-Age` = `CookieOptions.TTL`). `frontend/` and the desktop shell never send the field and must not change.
- **The server session is not touched.** No proto change, no auth-service change, no new config knob.
- **A security decision is covered at both levels**: the pure `setSession` branch in `cookie_test.go` and the route through the real handlers in `handlers_test.go`.
- **Go changes are gated by `make -C backend check`** (gofmt, tidy-check, vet with the workspace off, golangci-lint, `go test -race -shuffle=on`, govulncheck). If the local `govulncheck` step fails only because of the known broken Homebrew llvm (`libz3.4.16.dylib`), run every other step by hand and say so in the commit message.
- **Modern Go**: `any`, `errors.Is`, `t.Context()`, `new(expr)` for a single-use pointer; keep `encoding/json` in `respond.go` as is (existing code).
- **A parallel session may work in this clone.** Stage by path (`git add backend/services/gateway-service docs` / `git add frontend-v2`), never `git add -A`; check `git diff --cached --name-only` before committing. **Never stage `.claude/settings.json`.**
- **frontend-v2:** yarn, never npm; `yarn lint` is `tsc -b --noEmit && oxlint` (keep the `-b`); every module has its own `*.spec.ts(x)`; `src/architecture.spec.ts` and `src/fixtures.spec.tsx` must stay green; commit with `--no-verify` and say so, since the hook runs the Go gate for a change that touches no Go.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: The gateway honours `remember`

**Files:**
- Already modified (verify, do not redo): `backend/services/gateway-service/api/openapi.yaml` — `remember` added to `LoginRequest` and `Login2FARequest`.
- Modify: `backend/services/gateway-service/internal/transport/authhttp/cookie.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/session.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/passkey.go` (one call site)
- Test: `backend/services/gateway-service/internal/transport/authhttp/cookie_test.go`
- Test: `backend/services/gateway-service/internal/transport/authhttp/handlers_test.go`

**Interfaces:**
- Consumes: `Handlers.cookie CookieOptions{Secure, TTL}`; `auth.Dial(target)`, `audit.Dial(target)`; `authv1` = `github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1`.
- Produces: `func (h *Handlers) setSession(w http.ResponseWriter, token string, persist bool)`; JSON bodies `{identifier, password, remember?}` and `{challengeToken, code, remember?}`.

- [ ] **Step 1: Failing test for the session-cookie branch (cookie_test.go)**

Replace `TestSetSessionCarriesTheHardeningAttributes` with a table over both branches and add the session-cookie assertions:

```go
func (s *CookieSuite) TestSetSessionCarriesTheHardeningAttributes() {
	for _, tc := range []struct {
		name    string
		persist bool
		maxAge  int
	}{
		{"persistent", true, int((720 * time.Hour).Seconds())},
		// A browser-session cookie is one with neither Max-Age nor Expires;
		// the browser drops it when it closes. That, and nothing server-side,
		// is what "Keep me signed in" unticked promises.
		{"browser-session", false, 0},
	} {
		s.Run(tc.name, func() {
			rec := httptest.NewRecorder()

			s.handlers(true).setSession(rec, "tok-1", tc.persist)

			c := rec.Result().Cookies()[0]
			assert.Equal(s.T(), c.Name, sessionCookieName)
			assert.Equal(s.T(), c.Value, "tok-1")
			assert.Equal(s.T(), c.HttpOnly, true, "a readable cookie is the localStorage problem again")
			assert.Equal(s.T(), c.Secure, true)
			assert.Equal(s.T(), c.Path, "/")
			// Lax is what stands in for a CSRF token: a cross-site POST does not carry
			// it, and this API changes state only through POST/PUT/PATCH/DELETE.
			assert.Equal(s.T(), c.SameSite, http.SameSiteLaxMode)
			assert.Equal(s.T(), c.MaxAge, tc.maxAge)
			assert.Assert(s.T(), c.Expires.IsZero(), "Expires must never be set; Max-Age alone decides")
			if !tc.persist {
				assert.Assert(s.T(), !strings.Contains(rec.Header().Get("Set-Cookie"), "Max-Age"),
					"a session cookie carries no Max-Age at all")
			}
		})
	}
}
```

Add `"strings"` to the imports. `TestSecureFollowsConfig` and `TestClearSessionExpiresTheCookie` call `setSession(rec, "tok-1")` / `clearSession(rec)` — change the `setSession` call to `setSession(rec, "tok-1", true)`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run TestCookieSuite -v`
Expected: compile error — `too many arguments in call to s.handlers(true).setSession`.

- [ ] **Step 3: `setSession` takes `persist`**

In `cookie.go` replace `setSession`:

```go
// setSession hands the browser an httpOnly copy of the session token.
//
// httpOnly is the point: a token in localStorage is readable by any script that
// gets injected, and that is the one a persistent XSS exfiltrates. SameSite=Lax
// is what stands in for a CSRF token — a cross-site POST does not carry the
// cookie, and this API changes state only through POST/PUT/PATCH/DELETE, never
// through a GET that Lax would allow.
//
// persist is the "Keep me signed in on this device" checkbox. false issues a
// browser-session cookie — no Max-Age, no Expires — which the browser drops
// when it closes. The server-side session is untouched either way: its 24 h
// idle window already retires an unused unticked login, and a shorter absolute
// TTL would be a difference no user can observe.
func (h *Handlers) setSession(w http.ResponseWriter, token string, persist bool) {
	maxAge := 0
	if persist {
		maxAge = int(h.cookie.TTL.Seconds())
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}
```

Update the one call in `passkey.go` (`passkeyLoginFinish`) to `h.setSession(w, token, true)` with a one-line comment: `// No checkbox on the passkey path; it stays persistent.` The two calls in `session.go` are rewritten in Step 6.

- [ ] **Step 4: Run the cookie suite**

Run: `go test ./internal/transport/authhttp/ -run TestCookieSuite -v`
Expected: PASS (session.go still fails to compile until Step 6 — if `go test` refuses to build the package, do Step 6 first and come back; the order of steps is not sacred, the red-then-green evidence is).

- [ ] **Step 5: Failing route tests (handlers_test.go)**

Add an in-process auth-service stub and three tests. Imports to add: `"bytes"`, `"context"`, `"io"`, `"log/slog"`, `"net"`, `"strings"`, `"google.golang.org/grpc"`, `authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"`, and `"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"`.

```go
// stubAuth is an in-process auth-service that accepts any credentials and any
// code, so the cookie a successful sign-in sets can be read. ValidateToken is
// left unimplemented on purpose: recordLogin treats its failure as "actor
// unknown" and records anyway, and the dead audit client below logs the record
// failure. Neither is what these tests are about.
type stubAuth struct{ authv1.UnimplementedAuthServiceServer }

func (stubAuth) Login(context.Context, *authv1.LoginRequest) (*authv1.LoginResponse, error) {
	return &authv1.LoginResponse{Token: "tok-login"}, nil
}

func (stubAuth) LoginVerify2FA(context.Context, *authv1.LoginVerify2FARequest) (*authv1.LoginResponse, error) {
	return &authv1.LoginResponse{Token: "tok-2fa"}, nil
}

// signingIn builds Handlers whose auth client reaches stubAuth over loopback.
// audit is dialled to a dead port for the same reason deadAuth exists: the
// record is best-effort and logged, not surfaced.
func (s *HandlersSuite) signingIn() *Handlers {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	authv1.RegisterAuthServiceServer(srv, stubAuth{})
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	client, err := auth.Dial(lis.Addr().String())
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = client.Close() })
	auditClient, err := audit.Dial("127.0.0.1:1")
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = auditClient.Close() })

	return &Handlers{
		client: client,
		audit:  auditClient,
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		cookie: CookieOptions{TTL: 720 * time.Hour},
	}
}

func post(handle http.HandlerFunc, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	r.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handle(rec, r)
	return rec
}

// The checkbox's contract, at the route level. cookie_test.go proves setSession
// branches correctly; this proves the handlers hand it the request's choice —
// the desktop shell's guard shipped a hole because a correct predicate was
// called with the wrong input.
func (s *HandlersSuite) TestRememberDecidesTheCookieLifetime() {
	persistent := int((720 * time.Hour).Seconds())
	for _, tc := range []struct {
		name   string
		path   string
		body   string
		maxAge int
	}{
		{"login, absent keeps today's persistent cookie", "/api/auth/login", `{"identifier":"a","password":"b"}`, persistent},
		{"login, true is persistent", "/api/auth/login", `{"identifier":"a","password":"b","remember":true}`, persistent},
		{"login, false is a browser-session cookie", "/api/auth/login", `{"identifier":"a","password":"b","remember":false}`, 0},
		{"2fa, absent keeps today's persistent cookie", "/api/auth/login/2fa", `{"challengeToken":"c","code":"000000"}`, persistent},
		{"2fa, false is a browser-session cookie", "/api/auth/login/2fa", `{"challengeToken":"c","code":"000000","remember":false}`, 0},
	} {
		s.Run(tc.name, func() {
			h := s.signingIn()
			handle := h.login
			if strings.HasSuffix(tc.path, "/2fa") {
				handle = h.login2FA
			}

			rec := post(handle, tc.path, tc.body)

			assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
			cookies := setCookies(rec)
			assert.Equal(s.T(), len(cookies), 1)
			assert.Equal(s.T(), cookies[0].Name, sessionCookieName)
			assert.Equal(s.T(), cookies[0].MaxAge, tc.maxAge)
			assert.Assert(s.T(), cookies[0].Expires.IsZero())
		})
	}
}
```

- [ ] **Step 6: Run to verify it fails, then make the handlers pass it**

Run: `go test ./internal/transport/authhttp/ -run 'TestHandlersSuite/TestRememberDecidesTheCookieLifetime' -v`
Expected: compile error (`h.setSession(w, token)` in session.go has too few arguments) — or, once it compiles with a placeholder `true`, the two "false" cases FAIL with `MaxAge` 2592000 ≠ 0.

In `session.go`:

```go
func (h *Handlers) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Identifier, Password string
		// nil is "not sent": frontend/ and the desktop shell predate the field
		// and keep their persistent cookie. Only an explicit false opts out.
		Remember *bool
	}
	if !decode(w, r, &req) {
		return
	}
	token, challenge, twoFA, err := h.client.Login(r.Context(), req.Identifier, req.Password)
	if err != nil {
		h.recordLogin(r, "auth.login", "")
		fail(w, err)
		return
	}
	// A 2FA challenge is not a completed login: the cookie is issued only once a
	// session token exists, which for the 2FA path happens in login2FA.
	if token != "" {
		h.recordLogin(r, "auth.login", token)
		h.setSession(w, token, persist(req.Remember))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token, "twoFactorRequired": twoFA, "challengeToken": challenge,
		// Empty on the 2FA path: there is no session yet to derive one from.
		"csrfToken": h.CSRFToken(token),
	})
}

func (h *Handlers) login2FA(w http.ResponseWriter, r *http.Request) {
	// Remember is repeated here: the gateway keeps nothing between the two
	// calls, and the challenge token is auth-service state carrying only a
	// user id. The client already holds the choice; sending it twice is cheaper
	// than teaching another service a cookie preference.
	var req struct {
		ChallengeToken, Code string
		Remember             *bool
	}
	if !decode(w, r, &req) {
		return
	}
	token, err := h.client.LoginVerify2FA(r.Context(), req.ChallengeToken, req.Code)
	if err != nil {
		h.recordLogin(r, "auth.login_2fa", "")
		fail(w, err)
		return
	}
	h.recordLogin(r, "auth.login_2fa", token)
	h.setSession(w, token, persist(req.Remember))
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "csrfToken": h.CSRFToken(token)})
}

// persist reads the optional remember field: absent means the persistent
// cookie every client got before the field existed.
func persist(remember *bool) bool { return remember == nil || *remember }
```

Keep `logout` exactly as it is. `encoding/json` matches `remember` to `Remember` case-insensitively, as it already does for the other fields.

- [ ] **Step 7: Run the package and the gate**

Run: `go test -race -shuffle=on ./internal/transport/authhttp/`
Expected: PASS, no output but `ok`.

Run: `make -C backend check` (from the repo root). If only `vuln` fails with the llvm/`libz3` error, run `make -C backend fmt-check tidy-check vet lint test` and note the skipped step in the commit message. Also run `cd backend/services/gateway-service && go vet ./... && gofmt -l .` and expect no output from gofmt.

- [ ] **Step 8: Live check against the compose stack**

The stack is up on `localhost:8080` from yesterday's images. Rebuild only the gateway and confirm the image is new before trusting the answer (a failed registry token fetch silently keeps the old image and still prints "Started"):

```bash
docker compose up -d --build gateway 2>&1 | grep -i -E "error|failed" ; docker image inspect andrey-gateway --format '{{.Created}}'
curl -si -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"admin","password":"change-me-now","remember":false}' | grep -i set-cookie
curl -si -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"admin","password":"change-me-now"}' | grep -i set-cookie
```

Expected: the first `Set-Cookie` has no `Max-Age`; the second has `Max-Age=2592000`. Paste both lines into the report. (Root is `admin` / `change-me-now` locally. If the login answers `twoFactorRequired: true`, use `cotest` / `Passw0rd!2026` instead.)

- [ ] **Step 9: Commit**

```bash
git add backend/services/gateway-service docs/superpowers/specs/2026-09-03-keep-me-signed-in-design.md docs/superpowers/plans/2026-09-03-keep-me-signed-in.md
git diff --cached --name-only   # must list only those paths — never .claude/settings.json
git commit -m "feat(gateway): honour remember on login — a browser-session cookie when false

LoginRequest and Login2FARequest take an optional remember (default true).
false makes setSession issue a cookie with no Max-Age, which the browser
drops when it closes; absent keeps the persistent 720 h cookie so frontend/
and the desktop shell, which never send the field, are unchanged. The server
session is untouched — its idle window already retires an unused login.

The 2FA step repeats the choice: the gateway keeps nothing between the two
calls and the challenge token carries only a user id.

Covered at both levels: the setSession branch in cookie_test.go and the
route through an in-process auth-service stub in handlers_test.go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: frontend-v2 draws the checkbox and sends the choice

**Files:**
- Regenerate: `frontend-v2/src/shared/api/dto.ts` (`yarn openapi:generate`)
- Modify: `frontend-v2/src/entities/user/api/auth-gateway.ts`
- Modify: `frontend-v2/src/entities/user/api/auth-gateway.spec.ts`
- Modify: `frontend-v2/src/pages/login/model/use-login.ts`
- Modify: `frontend-v2/src/pages/login/model/use-login.spec.ts`
- Modify: `frontend-v2/src/features/login/ui/credentials-form.tsx` (doc comment only)
- Modify: `frontend-v2/CLAUDE.md`, `frontend-v2/README.md` (the paragraph explaining the hidden checkbox)

**Interfaces:**
- Consumes: gateway bodies `{identifier, password, remember}` and `{challengeToken, code, remember}` from Task 1; `CredentialsFormProps.remember?: boolean; onRememberChange?: (value: boolean) => void` (already exists).
- Produces: `login(identifier: string, password: string, remember: boolean)`, `verifyTwoFactor(challengeToken: string, code: string, remember: boolean)`.

- [ ] **Step 1: Regenerate the DTOs**

```bash
cd frontend-v2 && yarn openapi:generate && git diff --stat src/shared/api/dto.ts
```

Expected: `LoginRequest` and `Login2FARequest` gain `remember?: boolean` and nothing else changes. (The generator runs on the pinned TypeScript 5.9.3 through `resolutions`; do not touch that entry.)

- [ ] **Step 2: Failing gateway spec**

In `auth-gateway.spec.ts` add, inside `describe("auth gateway")`:

```ts
  // The choice must reach the gateway on both calls: it keeps no state between
  // them, and the cookie it sets on step two is the one that has to be a
  // browser-session cookie when the box was unticked.
  it("sends the remember choice on both steps", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { twoFactorRequired: true, challengeToken: "chal-1" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { token: "t", csrfToken: "c" }));
    vi.stubGlobal("fetch", fetchMock);

    await login("a.ivanova", "pw", false);
    await verifyTwoFactor("chal-1", "402913", false);

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
    expect(bodies[0]).toEqual({ identifier: "a.ivanova", password: "pw", remember: false });
    expect(bodies[1]).toEqual({ challengeToken: "chal-1", code: "402913", remember: false });
  });
```

Update the three existing `login("a.ivanova", "pw")` calls to `login("a.ivanova", "pw", true)` and `verifyTwoFactor("chal-1", "402913")` to `verifyTwoFactor("chal-1", "402913", true)`.

- [ ] **Step 3: Run to verify it fails**

Run: `yarn vitest run src/entities/user/api/auth-gateway.spec.ts`
Expected: FAIL — `remember` missing from the bodies (and `tsc` would reject the extra argument).

- [ ] **Step 4: The gateway sends it**

In `auth-gateway.ts`:

```ts
// Password login. The session itself is the httpOnly cookie the gateway sets on
// this response; all that is kept here is a marker so the route guard can bounce
// an anonymous visitor without a round trip. When 2FA is required no session
// exists yet, so nothing is marked and the challenge token goes to step two.
//
// `remember` is the "Keep me signed in on this device" checkbox: false asks
// for a browser-session cookie. It is sent on both steps because the gateway
// keeps nothing between them.
export async function login(
  identifier: string,
  password: string,
  remember: boolean,
): Promise<{ twoFactorRequired: boolean; challengeToken: string }> {
  const r = await httpPost<LoginResponse>("/api/auth/login", { identifier, password, remember });
  if (!r.twoFactorRequired) {
    markAuthed();
    setCsrfToken(r.csrfToken);
  }
  return { twoFactorRequired: r.twoFactorRequired, challengeToken: r.challengeToken };
}

// Step two: exchange the TOTP/recovery code + challenge for a session. The
// response body still carries a token for non-browser clients; this one ignores
// it and rides the cookie the same response set.
export async function verifyTwoFactor(
  challengeToken: string,
  code: string,
  remember: boolean,
): Promise<void> {
  const r = await httpPost<{ token: string; csrfToken: string }>(
    "/api/auth/login/2fa",
    { challengeToken, code, remember },
  );
  markAuthed();
  setCsrfToken(r.csrfToken);
}
```

Run: `yarn vitest run src/entities/user/api/auth-gateway.spec.ts` — expected PASS.

- [ ] **Step 5: Failing container spec**

In `use-login.spec.ts`, change the existing 2FA assertion to
`expect(verifyTwoFactor).toHaveBeenCalledWith("chal-1", "402913", true)` and add:

```ts
  // The mock draws the box ticked: a fresh screen keeps the user signed in
  // unless they say otherwise.
  it("keeps the user signed in by default", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: false, challengeToken: "" });
    const { result } = renderHook(() => useLogin());

    expect(result.current.credentials.remember).toBe(true);
    act(() => result.current.credentials.onSubmit());

    await waitFor(() => expect(login).toHaveBeenCalledWith("", "", true));
  });

  // Unticked must travel through both steps — the cookie that matters is the
  // one step two sets.
  it("carries an unticked choice through the second factor", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: true, challengeToken: "chal-1" });
    vi.mocked(verifyTwoFactor).mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onRememberChange!(false));
    act(() => result.current.credentials.onSubmit());
    await waitFor(() => expect(login).toHaveBeenCalledWith("", "", false));

    act(() => result.current.twoFactor!.onCodeChange("402913"));
    act(() => result.current.twoFactor!.onSubmit());
    await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalledWith("chal-1", "402913", false));
  });
```

Run: `yarn vitest run src/pages/login/model/use-login.spec.ts` — expected FAIL (`remember` undefined, `onRememberChange` not a function).

- [ ] **Step 6: The container regains `remember`**

In `use-login.ts`: after `const [password, setPassword] = useState("");` add
`const [remember, setRemember] = useState(true);` with the comment
`// Ticked by default, as the mock draws it.`. Pass it to both calls:
`login(identifier, password, remember)` and
`verifyTwoFactor(challengeToken, code, remember)`. In the returned
`credentials` object replace the two comment lines (`// No \`remember\`: …` and
`// is fixed, so the checkbox stays hidden rather than lying.`) with:

```ts
      remember,
      onRememberChange: setRemember,
```

Run: `yarn vitest run src/pages/login/model/use-login.spec.ts` — expected PASS.

- [ ] **Step 7: The form's doc comment tells the truth again**

In `credentials-form.tsx` replace the JSDoc above `remember?: boolean;`:

```ts
  /**
   * "Keep me signed in on this device". Unticked, the gateway issues a
   * browser-session cookie that dies with the browser. Optional for the same
   * reason `onPasskey` is: a fixture may show the form without the control.
   */
```

- [ ] **Step 8: Docs**

`frontend-v2/CLAUDE.md`, section "Not done yet", the sentences beginning `The same rule hides the "Keep me signed in" checkbox` through `An action with no endpoint is not rendered.` become:

```
The "Keep me signed in on this device" checkbox is live: unticked, `login`
and `verifyTwoFactor` send `remember: false` and the gateway issues a
browser-session cookie (spec:
`docs/superpowers/specs/2026-09-03-keep-me-signed-in-design.md`). An action
with no endpoint is not rendered — that rule still hides the passkey button.
```

`frontend-v2/README.md`: if it mentions the hidden checkbox, apply the same sentence; if it does not, leave it.

- [ ] **Step 9: Lint, the whole suite, and the live check**

```bash
yarn lint && yarn test
```

Expected: lint silent; every spec green, including `src/architecture.spec.ts` and `src/fixtures.spec.tsx`. Report the total count against the previous run's (1596).

Live: `yarn dev` (port 3001) against the rebuilt gateway from Task 1; sign in as `admin` / `change-me-now` with the box unticked and read the `Set-Cookie` header in the browser's network tab (or repeat the two `curl` lines from Task 1 Step 8 — the gateway is what decides). Then quit the browser entirely, reopen `http://localhost:3001/console`: it must bounce to `/login`. Note in the report whether the browser used "continue where you left off" session restore, which keeps session cookies by design.

- [ ] **Step 10: Commit**

```bash
git add frontend-v2
git diff --cached --name-only   # only frontend-v2/** — never .claude/settings.json
git commit --no-verify -m "feat(frontend-v2): bring back Keep me signed in, now that the gateway honours it

useLogin regains the remember state a5139c3 removed, ticked by default as
the mock draws it, and hands it to CredentialsForm's existing optional
props. login() and verifyTwoFactor() send it on both steps: the gateway
keeps nothing between them and the cookie that matters is the one step two
sets. dto.ts regenerated for the new optional field.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After this plan

The console screens' wiring (Users/Roles, Content/Territory access, Audit/Metrics) is the next plan, per the order of work in `docs/superpowers/specs/2026-09-02-frontend-v2-gateway-wiring-design.md`.
