package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// TerritoryGateSuite covers the middleware that keeps one tenant out of
// another's territory.
//
// The chi mechanics are the point of these tests, not an incidental detail. chi
// builds its chain as chain(middlewares, routeHTTP), so a Use middleware on a
// plain Mux runs BEFORE the route is matched and would see an empty
// RoutePattern — the gate would then never fire and never say so. It works here
// only because the middleware sits on the inline sub-router from r.Group, which
// the parent reaches after matching. That is worth pinning down rather than
// reasoning about.
type TerritoryGateSuite struct {
	suite.Suite
}

func TestTerritoryGateSuite(t *testing.T) { suite.Run(t, new(TerritoryGateSuite)) }

// gateCase is the principal a case runs as.
type gateCase struct {
	adminID   string
	allAccess bool
}

// router mirrors how InitRouter mounts the gate: inside r.Group, after the
// permission middleware. Anything that differs here proves nothing about
// production.
func (s *TerritoryGateSuite) router(svc Service, sc gateCase) http.Handler {
	srv := New(svc)
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(withTestScope(req.Context(), sc)))
			})
		})
		api.Use(srv.RequireTerritoryAccess)
		ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
		api.Get("/api/territories/{slug}/placements", ok)
		api.Put("/api/territories/{slug}/placements/{id}", ok)
		api.Get("/api/territories/{slug}/documents", ok)
		api.Get("/api/territories/{slug}", ok)
		api.Post("/api/territories", ok)
		api.Get("/api/models", ok)
	})
	return r
}

func (s *TerritoryGateSuite) do(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func (s *TerritoryGateSuite) TestScopedCallerReachesOwnTerritory() {
	svc := gateServiceStub{territory: func(_ context.Context, slug, scope string) error {
		assert.Equal(s.T(), slug, "mine")
		assert.Equal(s.T(), scope, "admin-1", "the gate must pass the principal's scope, not an empty one")
		return nil
	}}
	h := s.router(svc, gateCase{adminID: "admin-1"})

	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/territories/mine/placements").Code, http.StatusOK)
}

// The whole reason this middleware exists: ten of the thirteen child routes had
// no scope check at all.
func (s *TerritoryGateSuite) TestScopedCallerIsRefusedAnotherTenantsTerritory() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		return domain.ErrTerritoryNotFound
	}}
	h := s.router(svc, gateCase{adminID: "admin-1"})

	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/api/territories/theirs/placements"},
		{http.MethodPut, "/api/territories/theirs/placements/7"},
		{http.MethodGet, "/api/territories/theirs/documents"},
		{http.MethodGet, "/api/territories/theirs"},
	} {
		rec := s.do(h, c.method, c.path)
		assert.Equal(s.T(), rec.Code, http.StatusNotFound, "%s %s", c.method, c.path)
		// 403 would confirm the territory exists. The body must be
		// indistinguishable from a genuinely missing slug too.
		assert.Assert(s.T(), strings.Contains(rec.Body.String(), "not_found"), rec.Body.String())
	}
}

func (s *TerritoryGateSuite) TestRootSkipsTheLookupEntirely() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		s.T().Fatal("Root must not cost a catalog round trip")
		return nil
	}}
	h := s.router(svc, gateCase{allAccess: true})

	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/territories/any/placements").Code, http.StatusOK)
}

// Fail closed: a principal that is neither Root nor attached to a company gets
// nothing, rather than a lookup with an empty scope that would match everything.
func (s *TerritoryGateSuite) TestPrincipalWithoutACompanyIsRefused() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		s.T().Fatal("an unscoped principal must be refused before the lookup")
		return nil
	}}
	h := s.router(svc, gateCase{})

	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/territories/x/placements").Code, http.StatusNotFound)
}

// Routes without a {slug} must pass through untouched — creating a territory has
// no territory to check yet.
func (s *TerritoryGateSuite) TestRoutesWithoutASlugArePassedThrough() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		s.T().Fatal("a slugless route must not reach the lookup")
		return nil
	}}
	h := s.router(svc, gateCase{adminID: "admin-1"})

	assert.Equal(s.T(), s.do(h, http.MethodPost, "/api/territories").Code, http.StatusOK)
	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/models").Code, http.StatusOK)
}

// Every documented territory path must be addressed the one way the gate
// understands. A future route that reaches a territory by a different shape —
// /api/territories/by-id/{id}/placements, say — would be invisible to the
// middleware and open to every tenant, and nothing else in the suite would
// notice.
//
// Deliberately scoped to /api/territories: /api/models/{slug} also carries a
// slug and legitimately has no territory gate, models being a shared library.
func (s *TerritoryGateSuite) TestEveryTerritoryPathIsAddressedBySlug() {
	sw, err := GetSpec()
	assert.NilError(s.T(), err)

	children := 0
	for path := range sw.Paths.Map() {
		if !strings.HasPrefix(path, "/api/territories") {
			continue
		}
		if path == "/api/territories" { // the collection: nothing to scope yet
			continue
		}
		assert.Assert(s.T(), strings.HasPrefix(path, territoryScopedPrefix),
			"%s reaches a territory without a {slug} in the gated position, so "+
				"RequireTerritoryAccess never sees it", path)
		children++
	}
	// Guard the guard: a spec that failed to load would pass the loop silently.
	assert.Assert(s.T(), children >= 13, "expected at least 13 territory paths, saw %d", children)
}

// withTestScope reproduces what authhttp.Authenticate puts on the context, using
// authhttp's own exported entry point so the test cannot drift from production.
func withTestScope(ctx context.Context, c gateCase) context.Context {
	if c.allAccess {
		return authhttp.NewTestContext(ctx, true, "")
	}
	return authhttp.NewTestContext(ctx, false, c.adminID)
}

// gateServiceStub implements only what the gate calls. Embedding Service leaves
// every other method nil — a call to one panics, which is the desired signal:
// the gate must touch nothing else.
type gateServiceStub struct {
	Service
	territory func(ctx context.Context, slug, scope string) error
}

func (g gateServiceStub) GetTerritory(ctx context.Context, slug, scope string) (domain.Territory, error) {
	if err := g.territory(ctx, slug, scope); err != nil {
		return domain.Territory{}, err
	}
	return domain.Territory{Slug: slug}, nil
}
