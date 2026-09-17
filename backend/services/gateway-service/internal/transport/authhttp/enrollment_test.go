package authhttp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

func TestEnrollmentAllows(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/auth/me", true},
		{"/api/auth/logout", true},
		{"/api/auth/2fa/setup", true},
		{"/api/auth/2fa/enable", true},
		{"/api/auth/2fa/recovery/regenerate", true},

		{"/api/territories", false},
		{"/api/auth/users", false},
		{"/api/auth/2fa/disable", false}, // enrolled is the point; disabling is not
		{"/api/metrics/query", false},
		{"/api/assets/deadbeef", false},

		// Deny by default, including near-misses on an allowed prefix.
		{"/api/auth/me/password", false},
		{"/api/auth/2fa/setupx", false},
		{"/api/auth/2fa/setup/", false},
		{"", false},
	}
	for _, c := range cases {
		if got := enrollmentAllows(c.path); got != c.want {
			t.Errorf("enrollmentAllows(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

func okValidator(mustEnroll bool) validateFunc {
	return func(context.Context, string) (string, []string, bool, string, string, bool, error) {
		return "u-1", nil, false, "company-1", "company-1", mustEnroll, nil
	}
}

// A session that owes a second factor reaches the enrollment endpoints and
// nothing else.
func TestAuthenticateGatesASessionThatMustEnroll(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	for path, want := range map[string]int{
		"/api/auth/2fa/setup": http.StatusOK,
		"/api/auth/me":        http.StatusOK,
		"/api/territories":    http.StatusForbidden,
		"/api/auth/users":     http.StatusForbidden,
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer tok")
		rec := httptest.NewRecorder()

		authenticate(okValidator(true), next).ServeHTTP(rec, req)

		if rec.Code != want {
			t.Errorf("%s: got %d, want %d", path, rec.Code, want)
		}
		if want == http.StatusForbidden &&
			!strings.Contains(rec.Body.String(), apperr.SlugTwoFAEnrollmentRequired) {
			t.Errorf("%s: refusal does not carry the enrollment code: %s", path, rec.Body.String())
		}
	}
}

// An ordinary session is untouched.
func TestAuthenticateLeavesAnEnrolledSessionAlone(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/territories", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()

	authenticate(okValidator(false), next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

// enrollmentRouteMethods pairs each enrollmentPaths entry with the HTTP verb
// mount.go actually registers it under. Kept separate from enrollmentPaths so
// a mismatch here is a test failure, not a change to the list under test.
var enrollmentRouteMethods = map[string]string{
	"/api/auth/me":                      http.MethodGet,
	"/api/auth/logout":                  http.MethodPost,
	"/api/auth/2fa/setup":               http.MethodPost,
	"/api/auth/2fa/enable":              http.MethodPost,
	"/api/auth/2fa/recovery/regenerate": http.MethodPost,
}

// EnrollmentRouteSuite checks enrollmentPaths against the router mount.go
// actually builds, not a hand-built request. A route renamed in mount.go and
// forgotten here would otherwise silently stop matching — every flagged user
// locked out of the endpoints that let them enroll, the exact failure this
// allow-list exists to prevent, and nothing else would notice.
type EnrollmentRouteSuite struct{ suite.Suite }

func TestEnrollmentRouteSuite(t *testing.T) { suite.Run(t, new(EnrollmentRouteSuite)) }

func (s *EnrollmentRouteSuite) TestEveryAllowedPathIsARealRoute() {
	r := chi.NewRouter()
	(&Handlers{}).Mount(r)

	for _, p := range enrollmentPaths {
		method, ok := enrollmentRouteMethods[p]
		s.Require().True(ok, "%s has no verb recorded in enrollmentRouteMethods", p)

		rctx := chi.NewRouteContext()
		assert.Assert(s.T(), r.Match(rctx, method, p),
			"%s is on the enrollment allow-list but no route serves %s %s", p, method, p)
	}
}
