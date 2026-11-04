package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"gotest.tools/v3/assert"
)

type SceneHandlersSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	con *mocks.ContentMock
	srv *Server
}

func TestSceneHandlersSuite(t *testing.T) { suite.Run(t, new(SceneHandlersSuite)) }
func (s *SceneHandlersSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.con = mocks.NewContentMock(mc)
	s.srv = New(
		service.New(
			s.cat,
			s.con,
			mocks.NewMeshMock(mc),
			mocks.NewUploadMock(mc),
			mocks.NewAuditMock(mc),
			mocks.NewAuthMock(mc),
		),
	)
}
func (s *SceneHandlersSuite) SetupSubTest() { s.SetupTest() }
func (s *SceneHandlersSuite) fanOut(scope string, failure error) {
	s.cat.GetTerritoryMock.Expect(minimock.AnyContext, "yard", scope).
		Return(domain.Territory{Slug: "yard", Title: "Yard"}, failure)
	s.cat.ListTerritoryArtifactsMock.Return(nil, nil)
	s.cat.ListPlacementsMock.Return([]domain.Placement{{ID: 9}}, nil)
	s.cat.ListMeasurementsMock.Return([]domain.Measurement{{ID: 3}}, nil)
	s.cat.ListPlacementGroupsMock.Return(nil, nil)
	s.cat.ListZonesMock.Return(nil, nil)
	s.cat.ListModelsMock.Return(nil, nil)
	s.con.ListPanoramasMock.Return(nil, nil)
	s.con.ListPanoramaPhasesMock.Return(nil, nil)
	s.con.ListDocumentsMock.Return(nil, nil)
}

func (s *SceneHandlersSuite) TestSceneScopeAndPayload() {
	ctx := s.T().Context()
	resp, err := s.srv.GetSceneBundle(ctx, GetSceneBundleRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	_, ok := resp.(GetSceneBundle404JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), s.cat.GetTerritoryBeforeCounter(), uint64(0))
	s.assertError(resp, apperr.SlugNotFound, "territory not found")
	for _, tc := range []struct {
		name  string
		owner bool
		scope string
	}{{"scoped", false, "admin-7"}, {"root", true, ""}} {
		s.Run(tc.name, func() {
			ctx := authhttp.NewTestContext(s.T().Context(), tc.owner, tc.scope)
			s.fanOut(tc.scope, nil)
			resp, err := s.srv.GetSceneBundle(ctx, GetSceneBundleRequestObject{Slug: "yard"})
			assert.NilError(s.T(), err)
			out, ok := resp.(GetSceneBundle200JSONResponse)
			assert.Assert(s.T(), ok)
			assert.Equal(s.T(), out.Territory.Slug, "yard")
			assert.Equal(s.T(), out.Territory.Title, "Yard")
			assert.Equal(s.T(), out.Placements[0].Id, int64(9))
			assert.Equal(s.T(), out.Measurements[0].Id, int64(3))
		})
	}
}

func (s *SceneHandlersSuite) TestSceneErrors() {
	for _, tc := range []struct {
		name   string
		cause  error
		status int
	}{{"missing", domain.ErrTerritoryNotFound, 404}, {"internal", errors.New("down"), 500}} {
		s.Run(tc.name, func() {
			s.fanOut("admin", tc.cause)
			ctx := authhttp.NewTestContext(s.T().Context(), false, "admin")
			out, err := s.srv.GetSceneBundle(ctx, GetSceneBundleRequestObject{Slug: "yard"})
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), fmt.Sprintf("%T", out), fmt.Sprintf("httpapi.GetSceneBundle%dJSONResponse", tc.status))
			if tc.status == 404 {
				s.assertError(out, apperr.SlugNotFound, "territory not found")
			} else {
				s.assertError(out, apperr.SlugInternal, apperr.InternalMessage)
			}
		})
	}
}

func (s *SceneHandlersSuite) TestListPanoramas() {
	for _, tc := range []struct {
		name string
		data []domain.Panorama
	}{
		{"populated", []domain.Panorama{{ID: 7, Phase: domain.PhaseCurrent, Hidden: true}, {ID: 3, Phase: domain.PhasePost}}}, {"empty", nil},
	} {
		s.Run(tc.name, func() {
			ctx := s.T().Context()
			s.con.ListPanoramasMock.Expect(ctx, "yard").Return(tc.data, nil)
			resp, err := s.srv.ListPanoramas(ctx, ListPanoramasRequestObject{Slug: "yard"})
			assert.NilError(s.T(), err)
			out, ok := resp.(ListPanoramas200JSONResponse)
			assert.Assert(s.T(), ok)
			assert.Assert(s.T(), out != nil)
			assert.Equal(s.T(), len(out), len(tc.data))
			if len(out) > 0 {
				assert.Equal(s.T(), out[0].Id, int64(7))
				assert.Equal(s.T(), out[0].Phase, PanoramaPhaseCurrent)
				assert.Assert(s.T(), out[0].Hidden)
				assert.Equal(s.T(), out[1].Id, int64(3))
				assert.Equal(s.T(), out[1].Phase, PanoramaPhasePost)
				assert.Assert(s.T(), !out[1].Hidden)
			}
		})
	}
}

func (s *SceneHandlersSuite) TestUpdatePanorama() {
	ctx := s.T().Context()
	resp, err := s.srv.UpdatePanorama(ctx, UpdatePanoramaRequestObject{Slug: "yard", Id: 7})
	assert.NilError(s.T(), err)
	_, ok := resp.(UpdatePanorama400JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), s.con.UpdatePanoramaBeforeCounter(), uint64(0))
	p := domain.Panorama{
		ID:            7,
		TerritorySlug: "yard",
		Title:         "North",
		Position:      domain.Vec3{X: 1, Y: 2, Z: 3},
		YawOffset:     1.5,
		DefaultYaw:    2.5,
	}
	updated := p
	updated.Phase, updated.Hidden = domain.PhasePost, true
	s.con.UpdatePanoramaMock.Expect(ctx, p).Return(updated, nil)
	body := &PanoramaUpdate{
		Title:      new("North"),
		Position:   &Vec3{X: 1, Y: 2, Z: 3},
		YawOffset:  new(1.5),
		DefaultYaw: new(2.5),
	}
	resp, err = s.srv.UpdatePanorama(ctx, UpdatePanoramaRequestObject{Slug: "yard", Id: 7, Body: body})
	assert.NilError(s.T(), err)
	out, ok := resp.(UpdatePanorama200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), out.Id, int64(7))
	assert.Equal(s.T(), out.Title, "North")
	assert.Equal(s.T(), out.DefaultYaw, 2.5)
	assert.Equal(s.T(), out.TerritorySlug, "yard")
	assert.DeepEqual(s.T(), out.Position, Vec3{X: 1, Y: 2, Z: 3})
	assert.Equal(s.T(), out.YawOffset, 1.5)
	assert.Equal(s.T(), out.Phase, PanoramaPhasePost)
	assert.Assert(s.T(), out.Hidden)
}

func (s *SceneHandlersSuite) TestPlacementVisibility() {
	ctx := s.T().Context()
	resp, err := s.srv.SetPlacementVisibility(ctx, SetPlacementVisibilityRequestObject{Slug: "yard", Id: 7})
	assert.NilError(s.T(), err)
	_, ok := resp.(SetPlacementVisibility400JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), s.cat.SetPlacementVisibilityBeforeCounter(), uint64(0))
	ids := []int64{2, 5}
	s.cat.SetPlacementVisibilityMock.Expect(ctx, "yard", int64(7), ids).
		Return(domain.Placement{ID: 7, TerritorySlug: "yard", VisiblePanoramaIDs: ids}, nil)
	resp, err = s.srv.SetPlacementVisibility(
		ctx,
		SetPlacementVisibilityRequestObject{Slug: "yard", Id: 7, Body: &PlacementVisibilityUpdate{PanoramaIds: ids}},
	)
	assert.NilError(s.T(), err)
	out, ok := resp.(SetPlacementVisibility200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), out.Id, int64(7))
	assert.DeepEqual(s.T(), *out.VisiblePanoramaIds, ids)
	assert.Equal(s.T(), out.TerritorySlug, "yard")
}

func (s *SceneHandlersSuite) TestEmptyVisibility() {
	for _, tc := range []struct {
		name string
		ids  []int64
	}{{"nil", nil}, {"empty", []int64{}}} {
		s.Run(tc.name, func() {
			ctx := s.T().Context()
			s.cat.SetPlacementVisibilityMock.Expect(ctx, "yard", int64(7), tc.ids).
				Return(domain.Placement{ID: 7, TerritorySlug: "yard", VisiblePanoramaIDs: tc.ids}, nil)
			resp, err := s.srv.SetPlacementVisibility(
				ctx,
				SetPlacementVisibilityRequestObject{
					Slug: "yard",
					Id:   7,
					Body: &PlacementVisibilityUpdate{PanoramaIds: tc.ids},
				},
			)
			assert.NilError(s.T(), err)
			out, ok := resp.(SetPlacementVisibility200JSONResponse)
			assert.Assert(s.T(), ok)
			assert.Equal(s.T(), out.TerritorySlug, "yard")
			assert.Assert(s.T(), out.VisiblePanoramaIds != nil)
			assert.DeepEqual(s.T(), *out.VisiblePanoramaIds, []int64{})
		})
	}
}

func (s *SceneHandlersSuite) TestErrors() {
	for _, tc := range []struct {
		name        string
		cause       error
		list, write int
	}{{"not found", fmt.Errorf("wrapped: %w", domain.ErrPanoramaNotFound), 404, 404}, {"invalid", fmt.Errorf("wrapped: %w", domain.ErrInvalidInput), 500, 400}, {"internal", errors.New("down"), 500, 500}} {
		s.Run(tc.name, func() {
			ctx := s.T().Context()
			s.con.ListPanoramasMock.Expect(ctx, "yard").Return(nil, tc.cause)
			p := domain.Panorama{ID: 7, TerritorySlug: "yard", Title: "North"}
			s.con.UpdatePanoramaMock.Expect(ctx, p).Return(domain.Panorama{}, tc.cause)
			s.cat.SetPlacementVisibilityMock.Expect(ctx, "yard", int64(7), []int64{2}).
				Return(domain.Placement{}, tc.cause)
			list, err := s.srv.ListPanoramas(ctx, ListPanoramasRequestObject{Slug: "yard"})
			assert.NilError(s.T(), err)
			update, err := s.srv.UpdatePanorama(
				ctx,
				UpdatePanoramaRequestObject{Slug: "yard", Id: 7, Body: &PanoramaUpdate{Title: new("North")}},
			)
			assert.NilError(s.T(), err)
			vis, err := s.srv.SetPlacementVisibility(
				ctx,
				SetPlacementVisibilityRequestObject{
					Slug: "yard",
					Id:   7,
					Body: &PlacementVisibilityUpdate{PanoramaIds: []int64{2}},
				},
			)
			assert.NilError(s.T(), err)
			for _, c := range []struct {
				name   string
				got    any
				status int
			}{{"ListPanoramas", list, tc.list}, {"UpdatePanorama", update, tc.write}, {"SetPlacementVisibility", vis, tc.write}} {
				assert.Equal(s.T(), fmt.Sprintf("%T", c.got), fmt.Sprintf("httpapi.%s%dJSONResponse", c.name, c.status))
				switch c.status {
				case 404:
					s.assertError(c.got, apperr.SlugNotFound, "wrapped: panorama not found")
				case 400:
					s.assertError(c.got, apperr.SlugInvalidInput, "wrapped: invalid input")
				case 500:
					s.assertError(c.got, apperr.SlugInternal, apperr.InternalMessage)
				}
			}
		})
	}
}

func (s *SceneHandlersSuite) assertError(response any, code, message string) {
	s.T().Helper()
	b, err := json.Marshal(response)
	assert.NilError(s.T(), err)
	var body Error
	assert.NilError(s.T(), json.Unmarshal(b, &body))
	assert.Equal(s.T(), body.Code, code)
	assert.Equal(s.T(), body.Message, message)
}
