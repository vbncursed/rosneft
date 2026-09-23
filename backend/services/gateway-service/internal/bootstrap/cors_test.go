package bootstrap

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// CORSSuite pins the one thing that is easy to get backwards here.
//
// go-chi/cors treats an EMPTY AllowedOrigins list as "all origins" (cors.go:131
// sets allowedOriginsAll when the list is empty and no AllowOriginFunc is set).
// Blanking the config is therefore not a way to turn CORS off — it is a way to
// turn it fully on. The only way to say "none" is to not mount the handler, and
// that is what this suite exists to keep true.
type CORSSuite struct{ suite.Suite }

func TestCORSSuite(t *testing.T) { suite.Run(t, new(CORSSuite)) }

func (s *CORSSuite) probe(origins []string) *httptest.ResponseRecorder {
	r := newRouterWithCORS(origins)
	// Registered here, not inside the helper: a helper that carried a /probe
	// endpoint would ship it to production.
	r.Get("/probe", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/probe", nil)
	req.Header.Set("Origin", "https://evil.example")
	r.ServeHTTP(rec, req)
	return rec
}

func (s *CORSSuite) TestNoOriginsMeansNoCORSHeadersAtAll() {
	rec := s.probe(nil)
	assert.Equal(s.T(), rec.Code, http.StatusOK, "the route itself must still work")
	assert.Equal(s.T(), rec.Header().Get("Access-Control-Allow-Origin"), "",
		"an empty list must mean no cross-origin access, not a wildcard")
}

func (s *CORSSuite) TestAConfiguredOriginIsStillEchoed() {
	assert.Equal(s.T(), s.probe([]string{"https://evil.example"}).
		Header().Get("Access-Control-Allow-Origin"), "https://evil.example")
}

func (s *CORSSuite) TestAnUnlistedOriginIsNotEchoed() {
	assert.Equal(s.T(), s.probe([]string{"https://good.example"}).
		Header().Get("Access-Control-Allow-Origin"), "")
}

// A cross-origin client retrying a placement batch sends Idempotency-Key; the
// preflight must allow it or the browser never sends the POST.
func (s *CORSSuite) TestThePreflightAllowsTheIdempotencyKey() {
	r := newRouterWithCORS([]string{"https://good.example"})
	r.Post("/probe", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/probe", nil)
	req.Header.Set("Origin", "https://good.example")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "idempotency-key")
	r.ServeHTTP(rec, req)

	assert.Assert(s.T(), strings.EqualFold(rec.Header().Get("Access-Control-Allow-Headers"), "Idempotency-Key"),
		rec.Header().Get("Access-Control-Allow-Headers"))
}
