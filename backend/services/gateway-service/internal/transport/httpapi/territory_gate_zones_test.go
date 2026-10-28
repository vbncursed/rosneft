package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// The six zone and calibration routes are mounted for real (the generated
// router), behind the gate: an unknown or foreign slug is refused with the
// territory 404 before any handler. The stub has no zone method, so a request
// that got past the gate would panic instead of passing.
func (s *TerritoryGateSuite) TestTerritoryGateCoversZonesAndCalibration() {
	srv := New(
		gateServiceStub{territory: func(context.Context, string, string) error { return domain.ErrTerritoryNotFound }},
	)
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(withTestScope(req.Context(), gateCase{adminID: "admin-1"})))
			})
		})
		api.Use(srv.RequireTerritoryAccess)
		Mount(api, srv)
	})

	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/api/territories/theirs/zones"},
		{http.MethodPost, "/api/territories/theirs/zones"},
		{http.MethodPatch, "/api/territories/theirs/zones/7"},
		{http.MethodDelete, "/api/territories/theirs/zones/7"},
		{http.MethodPut, "/api/territories/theirs/documents/9/calibration"},
		{http.MethodDelete, "/api/territories/theirs/documents/9/calibration"},
	} {
		rec := s.do(r, c.method, c.path)
		assert.Equal(s.T(), rec.Code, http.StatusNotFound, "%s %s", c.method, c.path)
		assert.Assert(s.T(), strings.Contains(rec.Body.String(), "not_found"), rec.Body.String())
	}
}
