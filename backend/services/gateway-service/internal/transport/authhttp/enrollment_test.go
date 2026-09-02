package authhttp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
