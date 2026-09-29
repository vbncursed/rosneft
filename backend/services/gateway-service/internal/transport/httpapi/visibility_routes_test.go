package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/go-chi/chi/v5"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// More of VisibilityWritesSuite: the routed requests, create's phase, and the
// converters the four routes and the scene bundle share.

func (f *flagService) CreatePanorama(_ context.Context, p domain.Panorama, _ domain.BlobScope) (domain.Panorama, error) {
	f.call, f.slug, f.phase = "CreatePanorama", p.TerritorySlug, p.Phase
	return p, f.err
}

// No phase in the body is "" to the service, which content reads as prior.
func (s *VisibilityWritesSuite) TestCreateCarriesTheChosenPhase() {
	for _, tc := range []struct {
		phase *PanoramaPhaseName
		want  string
	}{{nil, ""}, {new(PanoramaPhasePost), "post"}} {
		resp, err := s.srv.CreatePanorama(s.T().Context(), CreatePanoramaRequestObject{
			Slug: "yard", Body: &CreatePanoramaJSONRequestBody{Title: "North", SourceBlobHash: "h", Phase: tc.phase},
		})
		assert.NilError(s.T(), err)
		_, is := resp.(CreatePanorama201JSONResponse)
		assert.Assert(s.T(), is, "got %T", resp)
		assert.Equal(s.T(), s.svc.phase, tc.want)
	}
}

// Through the real router: PUT …/panoramas/hidden and …/panoramas/phase sit
// beside PUT …/panoramas/{id}, and chi must pick the static segment, or the
// body lands in UpdatePanorama as id "hidden" (a 400). A 4xx body is the
// refusal's own words, from the sentinel on.
func (s *VisibilityWritesSuite) TestTheRouterReachesEachHandler() {
	r := chi.NewRouter()
	HandlerFromMux(NewStrictHandler(s.srv, nil), r)
	for _, tc := range []struct {
		path, body, call string
	}{
		{"/api/territories/yard/panoramas/hidden", `{"ids":[1],"hidden":true}`, "SetPanoramasHidden"},
		{"/api/territories/yard/panoramas/phase", `{"ids":[1],"phase":"post"}`, "SetPanoramasPhase"},
		{"/api/territories/yard/panorama-phases/current", `{"hidden":true}`, "SetPanoramaPhaseHidden"},
		{"/api/territories/yard/placement-groups/7/hidden", `{"hidden":true}`, "SetPlacementGroupHidden"},
	} {
		s.Run(tc.call, func() {
			s.svc.call = ""
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodPut, tc.path, strings.NewReader(tc.body)))
			assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
			assert.Equal(s.T(), s.svc.call, tc.call)
			assert.Equal(s.T(), s.svc.slug, "yard")
		})
	}

	s.svc.err = fmt.Errorf("%w: a panorama phase is prior, current or post, got %q", domain.ErrInvalidInput, "during")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodPut,
		"/api/territories/yard/panorama-phases/during", strings.NewReader(`{"hidden":true}`)))
	assert.Equal(s.T(), rec.Code, http.StatusBadRequest)
	var body Error
	assert.NilError(s.T(), json.NewDecoder(rec.Body).Decode(&body))
	assert.Equal(s.T(), body.Message, `invalid input: a panorama phase is prior, current or post, got "during"`)
	assert.Equal(s.T(), s.svc.phase, "during", "the service judges the phase, not the router")
}

func (s *VisibilityWritesSuite) TestConvertersCarryTheFlags() {
	p := panoramaToAPI(domain.Panorama{ID: 1, Phase: "current", Hidden: true})
	assert.Equal(s.T(), p.Phase, PanoramaPhaseCurrent)
	assert.Assert(s.T(), p.Hidden)

	g := placementGroupToAPI(domain.PlacementGroup{ID: 4, Hidden: true})
	assert.Assert(s.T(), g.Hidden)

	b := sceneBundleToAPI(domain.SceneBundle{PanoramaPhases: []domain.PanoramaPhase{
		{Phase: "prior"}, {Phase: "current", Hidden: true}, {Phase: "post"},
	}})
	assert.DeepEqual(s.T(), b.PanoramaPhases, []PanoramaPhase{
		{Phase: PanoramaPhasePrior}, {Phase: PanoramaPhaseCurrent, Hidden: true}, {Phase: PanoramaPhasePost},
	})
	// Required in the schema: a bundle never serialises it as null.
	assert.Assert(s.T(), sceneBundleToAPI(domain.SceneBundle{}).PanoramaPhases != nil)
}
