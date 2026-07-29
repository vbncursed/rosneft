package authhttp

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type CSRFSuite struct{ suite.Suite }

func TestCSRFSuite(t *testing.T) { suite.Run(t, new(CSRFSuite)) }

func (s *CSRFSuite) handlers() *Handlers {
	return &Handlers{csrfSecret: []byte("test-secret")}
}

// The token is derived, not stored: the gateway can recompute it from the
// session it already has, so nothing needs a database or a second cookie.
func (s *CSRFSuite) TestTokenIsDerivedFromTheSession() {
	h := s.handlers()
	assert.Equal(s.T(), h.CSRFToken("sess-1"), h.CSRFToken("sess-1"), "must be deterministic")
	assert.Assert(s.T(), h.CSRFToken("sess-1") != h.CSRFToken("sess-2"),
		"a token must not be transplantable onto another session")
	assert.Assert(s.T(), h.CSRFToken("sess-1") != "sess-1", "must not leak the session token")
}

func (s *CSRFSuite) TestDifferentSecretsYieldDifferentTokens() {
	a := (&Handlers{csrfSecret: []byte("one")}).CSRFToken("sess-1")
	b := (&Handlers{csrfSecret: []byte("two")}).CSRFToken("sess-1")
	assert.Assert(s.T(), a != b, "rotating the secret must invalidate outstanding tokens")
}

// mutate drives RequireCSRF with a session delivered the given way.
func (s *CSRFSuite) mutate(byCookie bool, header string) int {
	return s.request(http.MethodPost, byCookie, header)
}

func (s *CSRFSuite) request(method string, byCookie bool, header string) int {
	h := s.handlers()
	r := httptest.NewRequest(method, "/api/territories", nil)
	if byCookie {
		r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "sess-1"})
	} else {
		r.Header.Set("Authorization", "Bearer sess-1")
	}
	if header != "" {
		r.Header.Set(csrfHeaderName, header)
	}
	rec := httptest.NewRecorder()
	h.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, r)
	return rec.Code
}

func (s *CSRFSuite) TestCookieSessionNeedsTheToken() {
	assert.Equal(s.T(), s.mutate(true, ""), http.StatusForbidden)
	assert.Equal(s.T(), s.mutate(true, "wrong"), http.StatusForbidden)
	assert.Equal(s.T(), s.mutate(true, s.handlers().CSRFToken("sess-1")), http.StatusOK)
}

// The reason this scheme does not break curl, the tests or any integration: a
// browser cannot attach an Authorization header to a cross-site request, so a
// Bearer caller cannot be CSRF'd and needs no token.
func (s *CSRFSuite) TestBearerSessionIsExemptByConstruction() {
	assert.Equal(s.T(), s.mutate(false, ""), http.StatusOK)
}

func (s *CSRFSuite) TestSafeMethodsPassWithoutAToken() {
	for _, m := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		assert.Equal(s.T(), s.request(m, true, ""), http.StatusOK, "%s must not need a token", m)
	}
}

// Every mutating verb must be covered. Adding one to the API without adding it
// here would leave it unguarded, and nothing else would notice.
func (s *CSRFSuite) TestEveryMutatingVerbIsChecked() {
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		assert.Equal(s.T(), s.request(m, true, ""), http.StatusForbidden,
			"%s must require a token", m)
	}
}

func (s *CSRFSuite) TestSessionTokenFromReportsItsSource() {
	c := httptest.NewRequest(http.MethodGet, "/", nil)
	c.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "from-cookie"})
	tok, fromCookie := sessionTokenFrom(c)
	assert.Equal(s.T(), tok, "from-cookie")
	assert.Equal(s.T(), fromCookie, true)

	b := httptest.NewRequest(http.MethodGet, "/", nil)
	b.Header.Set("Authorization", "Bearer from-header")
	tok, fromCookie = sessionTokenFrom(b)
	assert.Equal(s.T(), tok, "from-header")
	assert.Equal(s.T(), fromCookie, false)
}
