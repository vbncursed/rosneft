package authhttp

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

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
