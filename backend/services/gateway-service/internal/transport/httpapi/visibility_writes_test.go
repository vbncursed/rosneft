package httpapi

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// VisibilityWritesSuite drives the four shared-visibility handlers — hide
// panoramas, move them between phases, hide a phase, hide a placement group —
// against a recording service: what reaches the service, which status comes
// back, and what the body says.
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

func (s *VisibilityWritesSuite) TestHideAndMoveForwardTheIDs() {
	ctx := s.T().Context()
	resp, err := s.srv.SetPanoramasHidden(ctx, SetPanoramasHiddenRequestObject{
		Slug: "yard", Body: &SetPanoramasHiddenJSONRequestBody{Ids: []int64{1, 2}, Hidden: true},
	})
	assert.NilError(s.T(), err)
	hid, is := resp.(SetPanoramasHidden200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.Equal(s.T(), hid.Updated, 2)
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.DeepEqual(s.T(), s.svc.ids, []int64{1, 2})
	assert.Assert(s.T(), s.svc.hidden)

	resp2, err := s.srv.SetPanoramasPhase(ctx, SetPanoramasPhaseRequestObject{
		Slug: "yard", Body: &SetPanoramasPhaseJSONRequestBody{Ids: []int64{3}, Phase: PanoramaPhaseCurrent},
	})
	assert.NilError(s.T(), err)
	moved, is := resp2.(SetPanoramasPhase200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp2)
	assert.Equal(s.T(), moved.Updated, 1)
	assert.Equal(s.T(), s.svc.phase, "current")
}

func (s *VisibilityWritesSuite) TestTheFlagsAnswerWhatTheyFlagged() {
	ctx := s.T().Context()
	resp, err := s.srv.SetPanoramaPhaseHidden(ctx, SetPanoramaPhaseHiddenRequestObject{
		Slug: "yard", Phase: PanoramaPhasePost, Body: &SetPanoramaPhaseHiddenJSONRequestBody{Hidden: true},
	})
	assert.NilError(s.T(), err)
	phase, is := resp.(SetPanoramaPhaseHidden200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.DeepEqual(s.T(), PanoramaPhase(phase), PanoramaPhase{Phase: PanoramaPhasePost, Hidden: true})
	assert.Equal(s.T(), s.svc.slug, "yard")

	resp2, err := s.srv.SetPlacementGroupHidden(ctx, SetPlacementGroupHiddenRequestObject{
		Slug: "yard", Id: 7, Body: &SetPlacementGroupHiddenJSONRequestBody{Hidden: true},
	})
	assert.NilError(s.T(), err)
	group, is := resp2.(SetPlacementGroupHidden200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp2)
	assert.Equal(s.T(), group.Id, int64(7))
	assert.Assert(s.T(), group.Hidden)
	assert.Equal(s.T(), s.svc.id, int64(7))
}

func (s *VisibilityWritesSuite) TestAMissingBodyIsABadRequest() {
	ctx := s.T().Context()
	for _, call := range []func() (any, error){
		func() (any, error) {
			return s.srv.SetPanoramasHidden(ctx, SetPanoramasHiddenRequestObject{Slug: "yard"})
		},
		func() (any, error) {
			return s.srv.SetPanoramasPhase(ctx, SetPanoramasPhaseRequestObject{Slug: "yard"})
		},
		func() (any, error) {
			return s.srv.SetPanoramaPhaseHidden(ctx, SetPanoramaPhaseHiddenRequestObject{Slug: "yard", Phase: PanoramaPhasePrior})
		},
		func() (any, error) {
			return s.srv.SetPlacementGroupHidden(ctx, SetPlacementGroupHiddenRequestObject{Slug: "yard", Id: 1})
		},
	} {
		resp, err := call()
		assert.NilError(s.T(), err)
		assert.Assert(s.T(), strings.Contains(fmt.Sprintf("%T", resp), "400JSONResponse"), "got %T", resp)
		assert.Equal(s.T(), s.svc.call, "", "the service must not be asked")
	}
}

func (s *VisibilityWritesSuite) TestRefusalsKeepTheirStatus() {
	ctx := s.T().Context()
	calls := map[string]func() (any, error){
		"SetPanoramasHidden": func() (any, error) {
			return s.srv.SetPanoramasHidden(ctx, SetPanoramasHiddenRequestObject{
				Slug: "yard", Body: &SetPanoramasHiddenJSONRequestBody{Ids: []int64{1}},
			})
		},
		"SetPanoramasPhase": func() (any, error) {
			return s.srv.SetPanoramasPhase(ctx, SetPanoramasPhaseRequestObject{
				Slug: "yard", Body: &SetPanoramasPhaseJSONRequestBody{Ids: []int64{1}, Phase: PanoramaPhasePrior},
			})
		},
		"SetPanoramaPhaseHidden": func() (any, error) {
			return s.srv.SetPanoramaPhaseHidden(ctx, SetPanoramaPhaseHiddenRequestObject{
				Slug: "yard", Phase: PanoramaPhasePrior, Body: &SetPanoramaPhaseHiddenJSONRequestBody{},
			})
		},
		"SetPlacementGroupHidden": func() (any, error) {
			return s.srv.SetPlacementGroupHidden(ctx, SetPlacementGroupHiddenRequestObject{
				Slug: "yard", Id: 1, Body: &SetPlacementGroupHiddenJSONRequestBody{},
			})
		},
	}
	for _, tc := range []struct {
		err  error
		code string
	}{
		{fmt.Errorf("%w: a panorama phase is prior, current or post, got %q", domain.ErrInvalidInput, "during"), "400"},
		{domain.ErrPanoramaNotFound, "404"},
		{domain.ErrTerritoryNotFound, "404"},
		{domain.ErrPlacementGroupNotFound, "404"},
		{errors.New("content down"), "500"},
	} {
		for name, call := range calls {
			s.Run(name+" "+tc.err.Error(), func() {
				s.svc.err = tc.err
				resp, err := call()
				assert.NilError(s.T(), err)
				assert.Equal(s.T(), fmt.Sprintf("%T", resp), "httpapi."+name+tc.code+"JSONResponse")
			})
		}
	}
}
