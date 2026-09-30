package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// VisibilityWritesSuite drives the panorama visibility handlers — hide
// panoramas, move them between phases, hide a phase, and the phase chosen on
// create — against a recording service: what reaches the service, which
// status comes back, and what the body says.
type VisibilityWritesSuite struct {
	suite.Suite
	svc *flagService
	srv *Server
}

func TestVisibilityWritesSuite(t *testing.T) { suite.Run(t, new(VisibilityWritesSuite)) }

func (s *VisibilityWritesSuite) SetupTest() {
	s.svc = &flagService{}
	s.srv = New(s.svc)
}

// flagService records what each call was handed and answers with err;
// anything else panics through the embedded nil Service.
type flagService struct {
	Service
	err    error
	call   string
	slug   string
	ids    []int64
	phase  string
	hidden bool
	id     int64
}

func (f *flagService) SetPanoramasHidden(_ context.Context, slug string, ids []int64, hidden bool) (int, error) {
	f.call, f.slug, f.ids, f.hidden = "SetPanoramasHidden", slug, ids, hidden
	return len(ids), f.err
}

func (f *flagService) SetPanoramasPhase(_ context.Context, slug string, ids []int64, phase string) (int, error) {
	f.call, f.slug, f.ids, f.phase = "SetPanoramasPhase", slug, ids, phase
	return len(ids), f.err
}

func (f *flagService) SetPanoramaPhaseHidden(_ context.Context, slug, phase string, hidden bool) (domain.PanoramaPhase, error) {
	f.call, f.slug, f.phase, f.hidden = "SetPanoramaPhaseHidden", slug, phase, hidden
	return domain.PanoramaPhase{Phase: phase, Hidden: hidden}, f.err
}

func (f *flagService) SetPlacementGroupHidden(_ context.Context, slug string, id int64, hidden bool) (domain.PlacementGroup, error) {
	f.call, f.slug, f.id, f.hidden = "SetPlacementGroupHidden", slug, id, hidden
	return domain.PlacementGroup{ID: id, TerritorySlug: slug, Title: "North", Hidden: hidden}, f.err
}

func (f *flagService) CreatePanorama(_ context.Context, p domain.Panorama, _ domain.BlobScope) (domain.Panorama, error) {
	f.call, f.slug, f.phase = "CreatePanorama", p.TerritorySlug, p.Phase
	return p, f.err
}

func (s *VisibilityWritesSuite) TestHidePanoramasForwardsTheIDsAndTheFlag() {
	resp, err := s.srv.SetPanoramasHidden(s.T().Context(), SetPanoramasHiddenRequestObject{
		Slug: "yard", Body: &SetPanoramasHiddenJSONRequestBody{Ids: []int64{1, 2}, Hidden: true},
	})
	assert.NilError(s.T(), err)
	hid, is := resp.(SetPanoramasHidden200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.Equal(s.T(), hid.Updated, 2)
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.DeepEqual(s.T(), s.svc.ids, []int64{1, 2})
	assert.Assert(s.T(), s.svc.hidden)
}

func (s *VisibilityWritesSuite) TestMovePanoramasForwardsThePhase() {
	resp, err := s.srv.SetPanoramasPhase(s.T().Context(), SetPanoramasPhaseRequestObject{
		Slug: "yard", Body: &SetPanoramasPhaseJSONRequestBody{Ids: []int64{3}, Phase: PanoramaPhaseCurrent},
	})
	assert.NilError(s.T(), err)
	moved, is := resp.(SetPanoramasPhase200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.Equal(s.T(), moved.Updated, 1)
	assert.Equal(s.T(), s.svc.phase, "current")
}

func (s *VisibilityWritesSuite) TestPhaseHiddenAnswersWhatItFlagged() {
	resp, err := s.srv.SetPanoramaPhaseHidden(s.T().Context(), SetPanoramaPhaseHiddenRequestObject{
		Slug: "yard", Phase: PanoramaPhasePost, Body: &SetPanoramaPhaseHiddenJSONRequestBody{Hidden: true},
	})
	assert.NilError(s.T(), err)
	phase, is := resp.(SetPanoramaPhaseHidden200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.DeepEqual(s.T(), PanoramaPhase(phase), PanoramaPhase{Phase: PanoramaPhasePost, Hidden: true})
	assert.Equal(s.T(), s.svc.slug, "yard")
}

// No phase in the body is "" to the service, which content reads as prior.
func (s *VisibilityWritesSuite) TestCreateCarriesTheChosenPhase() {
	for _, tc := range []struct {
		name  string
		phase *PanoramaPhaseName
		want  string
	}{
		{name: "no phase chosen", phase: nil, want: ""},
		{name: "post chosen", phase: new(PanoramaPhasePost), want: "post"},
	} {
		s.Run(tc.name, func() {
			resp, err := s.srv.CreatePanorama(s.T().Context(), CreatePanoramaRequestObject{
				Slug: "yard", Body: &CreatePanoramaJSONRequestBody{Title: "North", SourceBlobHash: "h", Phase: tc.phase},
			})
			assert.NilError(s.T(), err)
			_, is := resp.(CreatePanorama201JSONResponse)
			assert.Assert(s.T(), is, "got %T", resp)
			assert.Equal(s.T(), s.svc.phase, tc.want)
		})
	}
}

// A missing body never reaches the service: the strict handler's own JSON
// decode fails first, so the router answers 400 before any of our code runs.
func (s *VisibilityWritesSuite) TestAMissingBodyIsABadRequest() {
	r := chi.NewRouter()
	HandlerFromMux(NewStrictHandler(s.srv, nil), r)
	for _, tc := range []struct {
		name, path string
	}{
		{name: "SetPanoramasHidden", path: "/api/territories/yard/panoramas/hidden"},
		{name: "SetPanoramasPhase", path: "/api/territories/yard/panoramas/phase"},
		{name: "SetPanoramaPhaseHidden", path: "/api/territories/yard/panorama-phases/current"},
	} {
		s.Run(tc.name, func() {
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodPut, tc.path, strings.NewReader("")))
			assert.Equal(s.T(), rec.Code, http.StatusBadRequest, rec.Body.String())
			assert.Equal(s.T(), s.svc.call, "", "the service must not be asked")
		})
	}
}

// A refusal reaches the browser in its own status; a 5xx reaches it as the
// generic internal error, never the underlying text.
func (s *VisibilityWritesSuite) TestRefusalsKeepTheirStatus() {
	r := chi.NewRouter()
	HandlerFromMux(NewStrictHandler(s.srv, nil), r)
	calls := map[string]struct{ method, path, body string }{
		"SetPanoramasHidden":     {http.MethodPut, "/api/territories/yard/panoramas/hidden", `{"ids":[1],"hidden":true}`},
		"SetPanoramasPhase":      {http.MethodPut, "/api/territories/yard/panoramas/phase", `{"ids":[1],"phase":"current"}`},
		"SetPanoramaPhaseHidden": {http.MethodPut, "/api/territories/yard/panorama-phases/current", `{"hidden":true}`},
	}
	for _, tc := range []struct {
		err  error
		code int
	}{
		{fmt.Errorf("%w: a panorama phase is prior, current or post, got %q", domain.ErrInvalidInput, "during"), http.StatusBadRequest},
		{domain.ErrPanoramaNotFound, http.StatusNotFound},
		{domain.ErrTerritoryNotFound, http.StatusNotFound},
		{errors.New("content down"), http.StatusInternalServerError},
	} {
		for name, call := range calls {
			s.Run(fmt.Sprintf("%s %d", name, tc.code), func() {
				s.svc.err = tc.err
				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), call.method, call.path, strings.NewReader(call.body)))
				assert.Equal(s.T(), rec.Code, tc.code, rec.Body.String())
				if tc.code != http.StatusInternalServerError {
					return
				}
				var body Error
				assert.NilError(s.T(), json.NewDecoder(rec.Body).Decode(&body))
				assert.Equal(s.T(), body.Message, apperr.InternalMessage)
			})
		}
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
