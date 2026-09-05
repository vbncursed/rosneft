package authhttp

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// HandlersSuite covers the /api/auth/* handlers whose behaviour is decided in
// the gateway rather than downstream.
type HandlersSuite struct{ suite.Suite }

func TestHandlersSuite(t *testing.T) { suite.Run(t, new(HandlersSuite)) }

// deadAuth returns an auth client pointed at a port nothing listens on. Dial is
// lazy (grpc.NewClient), so construction succeeds and the RPC fails at call
// time — which is exactly the failure this suite needs, with no interface
// introduced solely for a test.
func (s *HandlersSuite) deadAuth() *auth.Client {
	c, err := auth.Dial("127.0.0.1:1")
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = c.Close() })
	return c
}

// logoutAgainst drives the handler directly and hands back the recorder. It
// deliberately does not call rec.Result(): nothing here asserts on the body, and
// materialising a response only to close it buys an lint exemption for no gain.
func (s *HandlersSuite) logoutAgainst(client *auth.Client) *httptest.ResponseRecorder {
	h := &Handlers{client: client, cookie: CookieOptions{TTL: 720 * time.Hour}}
	r := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "live-session"})
	rec := httptest.NewRecorder()

	h.logout(rec, r)
	return rec
}

// setCookies parses the recorder's Set-Cookie headers without building a body.
func setCookies(rec *httptest.ResponseRecorder) []*http.Cookie {
	return (&http.Response{Header: rec.Header()}).Cookies()
}

// The bug this pins: clearing the cookie only on the success path left a failed
// logout with a live session in the browser. The SPA's logout() swallows the
// error and redirects to /login regardless, and JavaScript cannot delete an
// httpOnly cookie — so the user believes they are signed out while still
// carrying a working session for the cookie's full Max-Age.
//
// Exercised here by calling the handler directly, because in the mounted router
// this failure is not reachable through the front door: logout sits behind
// Authenticate, so a downed auth-service is refused before the handler runs.
// The reachable window is a delete that fails after ValidateToken succeeded.
func (s *HandlersSuite) TestLogoutClearsTheCookieEvenWhenRevocationFails() {
	rec := s.logoutAgainst(s.deadAuth())

	assert.Assert(s.T(), rec.Code != http.StatusNoContent,
		"the RPC was meant to fail; a 204 means this test proves nothing")

	cookies := setCookies(rec)
	assert.Equal(s.T(), len(cookies), 1, "the failure response must still carry the deletion")
	assert.Equal(s.T(), cookies[0].Name, sessionCookieName)
	assert.Equal(s.T(), cookies[0].Value, "")
	assert.Assert(s.T(), cookies[0].MaxAge < 0,
		"MaxAge must be negative to delete, got %d", cookies[0].MaxAge)
}

// Guards the other half: writing the error body must not drop the header that
// was already set. apperr.Write sets Content-Type and a status; it does not
// replace the header map. If that ever changes, the deletion silently vanishes
// and only this assertion notices.
func (s *HandlersSuite) TestTheErrorBodyDoesNotDiscardTheDeletion() {
	rec := s.logoutAgainst(s.deadAuth())

	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/json")
	assert.Assert(s.T(), rec.Header().Get("Set-Cookie") != "",
		"apperr.Write must not reset headers written before it")
}

// stubAuth is an in-process auth-service that accepts any credentials and any
// code, so the cookie a successful sign-in sets can be read. ValidateToken is
// left unimplemented on purpose: recordLogin treats its failure as "actor
// unknown" and records anyway, and the dead audit client below logs the record
// failure. Neither is what these tests are about.
type stubAuth struct {
	authv1.UnimplementedAuthServiceServer
}

func (stubAuth) Login(_ context.Context, req *authv1.LoginRequest) (*authv1.LoginResponse, error) {
	if req.GetIdentifier() == "needs-2fa" {
		return &authv1.LoginResponse{TwoFactorRequired: true, ChallengeToken: "c"}, nil
	}
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

// The other half of the checkbox's contract: step one can also answer with a
// challenge instead of a token, and that is not a completed login regardless
// of what remember says. stubAuth.Login always returned a token before this
// test existed, so the "no cookie" branch in login was unpinned at the route
// level — only cookie_test.go's unit test on setSession covered it.
func (s *HandlersSuite) TestLoginWithA2FAChallengeSetsNoCookie() {
	h := s.signingIn()

	rec := post(h.login, "/api/auth/login", `{"identifier":"needs-2fa","password":"b","remember":false}`)

	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Equal(s.T(), len(setCookies(rec)), 0, "a 2FA challenge is not a completed login: no cookie")
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"twoFactorRequired":true`), rec.Body.String())
}
