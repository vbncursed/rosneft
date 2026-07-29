// In-package: sessionToken and the cookie helpers are unexported.
package authhttp

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type CookieSuite struct{ suite.Suite }

func TestCookieSuite(t *testing.T) { suite.Run(t, new(CookieSuite)) }

func (s *CookieSuite) handlers(secure bool) *Handlers {
	return &Handlers{cookie: CookieOptions{Secure: secure, TTL: 720 * time.Hour}}
}

func (s *CookieSuite) TestSetSessionCarriesTheHardeningAttributes() {
	rec := httptest.NewRecorder()

	s.handlers(true).setSession(rec, "tok-1")

	c := rec.Result().Cookies()[0]
	assert.Equal(s.T(), c.Name, sessionCookieName)
	assert.Equal(s.T(), c.Value, "tok-1")
	assert.Equal(s.T(), c.HttpOnly, true, "a readable cookie is the localStorage problem again")
	assert.Equal(s.T(), c.Secure, true)
	assert.Equal(s.T(), c.Path, "/")
	// Lax is what stands in for a CSRF token: a cross-site POST does not carry
	// it, and this API changes state only through POST/PUT/PATCH/DELETE.
	assert.Equal(s.T(), c.SameSite, http.SameSiteLaxMode)
	assert.Equal(s.T(), c.MaxAge, int((720 * time.Hour).Seconds()))
}

// Local dev runs over plain http, where a Secure cookie is simply never sent —
// the flag has to follow config, and the default has to be the safe one.
func (s *CookieSuite) TestSecureFollowsConfig() {
	rec := httptest.NewRecorder()

	s.handlers(false).setSession(rec, "tok-1")

	assert.Equal(s.T(), rec.Result().Cookies()[0].Secure, false)
}

func (s *CookieSuite) TestClearSessionExpiresTheCookie() {
	rec := httptest.NewRecorder()

	s.handlers(true).clearSession(rec)

	c := rec.Result().Cookies()[0]
	assert.Equal(s.T(), c.Name, sessionCookieName)
	assert.Equal(s.T(), c.Value, "")
	assert.Assert(s.T(), c.MaxAge < 0, "MaxAge must be negative to delete, got %d", c.MaxAge)
}

func (s *CookieSuite) TestSessionTokenPrefersTheCookie() {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "from-cookie"})
	r.Header.Set("Authorization", "Bearer from-header")

	assert.Equal(s.T(), sessionToken(r), "from-cookie")
}

// The Bearer path stays: curl, tests and non-browser clients have no cookie jar,
// and httpOnly protects against a token at rest, not against the header itself.
func (s *CookieSuite) TestSessionTokenFallsBackToBearer() {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer from-header")

	assert.Equal(s.T(), sessionToken(r), "from-header")
}

func (s *CookieSuite) TestSessionTokenIsEmptyWithNeither() {
	assert.Equal(s.T(), sessionToken(httptest.NewRequest(http.MethodGet, "/", nil)), "")
}
