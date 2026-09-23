package httpapi

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// PlacementGroupsSuite drives the five hide/group handlers against a recording
// service: what reaches the service and which status comes back.
type PlacementGroupsSuite struct {
	suite.Suite
	svc *groupService
	srv *Server
}

func TestPlacementGroupsSuite(t *testing.T) { suite.Run(t, new(PlacementGroupsSuite)) }

func (s *PlacementGroupsSuite) SetupTest() {
	s.svc = &groupService{}
	s.srv = New(s.svc)
}

// groupService records what each call was handed and answers with err;
// anything else panics through the embedded nil Service.
type groupService struct {
	Service
	err    error
	slug   string
	ids    []int64
	hidden bool
	group  *int64
	id     int64
	title  string
}

var groupStamp = time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)

func (g *groupService) SetPlacementsHidden(_ context.Context, slug string, ids []int64, hidden bool) (int, error) {
	g.slug, g.ids, g.hidden = slug, ids, hidden
	return len(ids), g.err
}

func (g *groupService) SetPlacementsGroup(_ context.Context, slug string, ids []int64, group *int64) (int, error) {
	g.slug, g.ids, g.group = slug, ids, group
	return len(ids), g.err
}

func (g *groupService) answer(slug string, id int64, title string) (domain.PlacementGroup, error) {
	g.slug, g.id, g.title = slug, id, title
	return domain.PlacementGroup{
		ID: cmp.Or(id, 5), TerritorySlug: slug, Title: title, CreatedAt: groupStamp, UpdatedAt: groupStamp,
	}, g.err
}

func (g *groupService) CreatePlacementGroup(_ context.Context, slug, title string) (domain.PlacementGroup, error) {
	return g.answer(slug, 0, title)
}

func (g *groupService) RenamePlacementGroup(_ context.Context, slug string, id int64, title string) (domain.PlacementGroup, error) {
	return g.answer(slug, id, title)
}

func (g *groupService) DeletePlacementGroup(_ context.Context, slug string, id int64) error {
	g.slug, g.id = slug, id
	return g.err
}

func (s *PlacementGroupsSuite) TestHideForwardsTheIDsAndTheFlag() {
	resp, err := s.srv.SetPlacementsHidden(s.T().Context(), SetPlacementsHiddenRequestObject{
		Slug: "yard", Body: &SetPlacementsHiddenJSONRequestBody{Ids: []int64{1, 2}, Hidden: true},
	})
	assert.NilError(s.T(), err)
	ok, is := resp.(SetPlacementsHidden200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.Equal(s.T(), ok.Updated, 2)
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.DeepEqual(s.T(), s.svc.ids, []int64{1, 2})
	assert.Assert(s.T(), s.svc.hidden)
}

// null is "No group": it must reach the service as nil, not as group 0.
func (s *PlacementGroupsSuite) TestMoveForwardsTheGroupOrNone() {
	for _, group := range []*int64{new(int64(4)), nil} {
		resp, err := s.srv.SetPlacementsGroup(s.T().Context(), SetPlacementsGroupRequestObject{
			Slug: "yard", Body: &SetPlacementsGroupJSONRequestBody{Ids: []int64{1}, GroupId: group},
		})
		assert.NilError(s.T(), err)
		_, is := resp.(SetPlacementsGroup200JSONResponse)
		assert.Assert(s.T(), is, "got %T", resp)
		assert.DeepEqual(s.T(), s.svc.group, group)
	}
}

func (s *PlacementGroupsSuite) TestCreateAnswers201WithTheGroup() {
	resp, err := s.srv.CreatePlacementGroup(s.T().Context(), CreatePlacementGroupRequestObject{
		Slug: "yard", Body: &CreatePlacementGroupJSONRequestBody{Title: "North"},
	})
	assert.NilError(s.T(), err)
	created, is := resp.(CreatePlacementGroup201JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.DeepEqual(s.T(), PlacementGroup(created),
		PlacementGroup{Id: 5, Title: "North", CreatedAt: groupStamp, UpdatedAt: groupStamp})
	assert.Equal(s.T(), s.svc.slug, "yard")
}

func (s *PlacementGroupsSuite) TestRenameAndDeleteTakeTheIDFromTheURL() {
	ctx := s.T().Context()
	resp, err := s.srv.UpdatePlacementGroup(ctx, UpdatePlacementGroupRequestObject{
		Slug: "yard", Id: 7, Body: &UpdatePlacementGroupJSONRequestBody{Title: "South"},
	})
	assert.NilError(s.T(), err)
	renamed, is := resp.(UpdatePlacementGroup200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.Equal(s.T(), renamed.Title, "South")
	assert.Equal(s.T(), s.svc.id, int64(7))

	del, err := s.srv.DeletePlacementGroup(ctx, DeletePlacementGroupRequestObject{Slug: "yard", Id: 7})
	assert.NilError(s.T(), err)
	_, is = del.(DeletePlacementGroup204Response)
	assert.Assert(s.T(), is, "got %T", del)
}

func (s *PlacementGroupsSuite) TestAMissingBodyIsABadRequest() {
	ctx := s.T().Context()
	for _, call := range []func() (any, error){
		func() (any, error) {
			return s.srv.SetPlacementsHidden(ctx, SetPlacementsHiddenRequestObject{Slug: "yard"})
		},
		func() (any, error) {
			return s.srv.SetPlacementsGroup(ctx, SetPlacementsGroupRequestObject{Slug: "yard"})
		},
		func() (any, error) {
			return s.srv.CreatePlacementGroup(ctx, CreatePlacementGroupRequestObject{Slug: "yard"})
		},
		func() (any, error) {
			return s.srv.UpdatePlacementGroup(ctx, UpdatePlacementGroupRequestObject{Slug: "yard", Id: 1})
		},
	} {
		resp, err := call()
		assert.NilError(s.T(), err)
		assert.Assert(s.T(), is400(resp), "got %T", resp)
		assert.Equal(s.T(), s.svc.slug, "", "the service must not be asked")
	}
}

func is400(resp any) bool {
	switch resp.(type) {
	case SetPlacementsHidden400JSONResponse, SetPlacementsGroup400JSONResponse,
		CreatePlacementGroup400JSONResponse, UpdatePlacementGroup400JSONResponse:
		return true
	}
	return false
}

func (s *PlacementGroupsSuite) TestRefusalsKeepTheirStatus() {
	ctx := s.T().Context()
	calls := map[string]func() (any, error){
		"SetPlacementsHidden": func() (any, error) {
			return s.srv.SetPlacementsHidden(ctx, SetPlacementsHiddenRequestObject{
				Slug: "yard", Body: &SetPlacementsHiddenJSONRequestBody{Ids: []int64{1}},
			})
		},
		"SetPlacementsGroup": func() (any, error) {
			return s.srv.SetPlacementsGroup(ctx, SetPlacementsGroupRequestObject{
				Slug: "yard", Body: &SetPlacementsGroupJSONRequestBody{Ids: []int64{1}},
			})
		},
		"CreatePlacementGroup": func() (any, error) {
			return s.srv.CreatePlacementGroup(ctx, CreatePlacementGroupRequestObject{
				Slug: "yard", Body: &CreatePlacementGroupJSONRequestBody{Title: "x"},
			})
		},
		"UpdatePlacementGroup": func() (any, error) {
			return s.srv.UpdatePlacementGroup(ctx, UpdatePlacementGroupRequestObject{
				Slug: "yard", Id: 1, Body: &UpdatePlacementGroupJSONRequestBody{Title: "x"},
			})
		},
		"DeletePlacementGroup": func() (any, error) {
			return s.srv.DeletePlacementGroup(ctx, DeletePlacementGroupRequestObject{Slug: "yard", Id: 1})
		},
	}
	for _, tc := range []struct {
		err  error
		code string
	}{
		{fmt.Errorf("%w: a bulk update names 1 to 1000 placements, got 0", domain.ErrInvalidInput), "400"},
		{domain.ErrPlacementGroupNotFound, "404"},
		{domain.ErrPlacementNotFound, "404"},
		{errors.New("catalog down"), "500"},
	} {
		for name, call := range calls {
			s.Run(name+" "+tc.code, func() {
				s.svc.err = tc.err
				resp, err := call()
				assert.NilError(s.T(), err)
				assert.Equal(s.T(), fmt.Sprintf("%T", resp), "httpapi."+name+tc.code+"JSONResponse")
			})
		}
	}
}

func (s *PlacementGroupsSuite) TestAPlacementCarriesHiddenAndItsGroup() {
	grouped := placementToAPI(domain.Placement{ID: 1, Hidden: true, GroupID: new(int64(3))})
	assert.Assert(s.T(), grouped.Hidden)
	assert.DeepEqual(s.T(), grouped.GroupId, new(int64(3)))
	assert.Assert(s.T(), placementToAPI(domain.Placement{ID: 2}).GroupId == nil, "no group is omitted")

	created := placementFromCreate("yard", PlacementCreate{ModelSlug: "pump", GroupId: new(int64(3))})
	assert.DeepEqual(s.T(), created.GroupID, new(int64(3)))
}

// The bundle always carries the list, [] when empty: the field is required.
func (s *PlacementGroupsSuite) TestSceneBundleCarriesPlacementGroups() {
	empty := sceneBundleToAPI(domain.SceneBundle{})
	assert.Assert(s.T(), empty.PlacementGroups != nil)
	assert.Equal(s.T(), len(empty.PlacementGroups), 0)

	full := sceneBundleToAPI(domain.SceneBundle{PlacementGroups: []domain.PlacementGroup{{ID: 4, Title: "North"}}})
	assert.Equal(s.T(), full.PlacementGroups[0].Id, int64(4))
	assert.Equal(s.T(), full.PlacementGroups[0].Title, "North")
}
