package httpapi

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// SafeGetSuite guards the assumption the whole CSRF defence rests on.
//
// SameSite=Lax withholds the session cookie from a cross-site POST but sends it
// on a cross-site top-level GET. A GET that changes state would therefore be
// forgeable from any page on the internet, and neither the cookie's SameSite
// attribute nor the CSRF token would stop it — RequireCSRF lets safe methods
// through by design, because a token on a link is not a thing.
//
// The rule is written in backend/CLAUDE.md. This is what enforces it.
type SafeGetSuite struct{ suite.Suite }

func TestSafeGetSuite(t *testing.T) { suite.Run(t, new(SafeGetSuite)) }

func (s *SafeGetSuite) TestNoDocumentedGetCarriesARequestBody() {
	sw, err := GetSpec()
	assert.NilError(s.T(), err)

	checked := 0
	for path, item := range sw.Paths.Map() {
		op, ok := item.Operations()[http.MethodGet]
		if !ok {
			continue
		}
		checked++
		assert.Assert(s.T(), op.RequestBody == nil,
			"GET %s declares a request body, which means it is doing work a GET must not do", path)
	}
	// Guard the guard: a spec that failed to load would pass the loop silently.
	assert.Assert(s.T(), checked >= 20, "expected at least 20 documented GETs, saw %d", checked)
}

// The verbs that change state are exactly the ones RequireCSRF checks. A route
// using anything else would slip past both — the middleware would treat it as
// safe, and no other test looks.
func (s *SafeGetSuite) TestOnlyTheExpectedVerbsAppearInTheSpec() {
	sw, err := GetSpec()
	assert.NilError(s.T(), err)

	allowed := map[string]bool{
		http.MethodGet: true, http.MethodHead: true, http.MethodPost: true,
		http.MethodPut: true, http.MethodPatch: true, http.MethodDelete: true,
	}
	seen := 0
	for path, item := range sw.Paths.Map() {
		for method := range item.Operations() {
			seen++
			assert.Assert(s.T(), allowed[method],
				"%s %s uses a verb RequireCSRF does not classify as mutating; it would pass unchecked",
				method, path)
		}
	}
	assert.Assert(s.T(), seen >= 50, "expected at least 50 documented operations, saw %d", seen)
}
