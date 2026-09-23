package httpapi

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type PlacementBatchSuite struct{ suite.Suite }

func TestPlacementBatchSuite(t *testing.T) { suite.Run(t, new(PlacementBatchSuite)) }

// batchStub records what reached the service and echoes the items back with
// ids; err, when set, is returned instead.
type batchStub struct {
	Service
	slug  *string
	items *[]domain.Placement
	err   error
}

func (b batchStub) CreatePlacements(_ context.Context, slug string, items []domain.Placement) ([]domain.Placement, error) {
	*b.slug, *b.items = slug, items
	if b.err != nil {
		return nil, b.err
	}
	out := make([]domain.Placement, len(items))
	for i, p := range items {
		p.ID = int64(i + 1)
		out[i] = p
	}
	return out, nil
}

func (s *PlacementBatchSuite) TestTheBatchLandsOnTheRouteTerritoryInOrder() {
	var slug string
	var items []domain.Placement
	label := "north"
	body := PlacementBatchCreate{Items: []PlacementCreate{
		{ModelSlug: "pump", Position: &Vec3{X: 1}},
		{ModelSlug: "tank", Label: &label, VisiblePanoramaIds: &[]int64{7}},
	}}

	resp, err := New(batchStub{slug: &slug, items: &items}).CreatePlacements(s.T().Context(),
		CreatePlacementsRequestObject{Slug: "yard", Body: &body})
	assert.NilError(s.T(), err)
	created, ok := resp.(CreatePlacements201JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), slug, "yard")
	assert.Equal(s.T(), items[0].TerritorySlug, "yard")
	assert.Equal(s.T(), items[0].Position.X, 1.0)
	assert.Equal(s.T(), items[1].Label, "north")
	assert.DeepEqual(s.T(), items[1].VisiblePanoramaIDs, []int64{7})
	assert.Equal(s.T(), created[1].ModelSlug, "tank")
	assert.Equal(s.T(), created[1].Id, int64(2))
}

// Each refusal keeps its status, and a 404 says which item named which
// missing model, in the words the catalog client left it in.
func (s *PlacementBatchSuite) TestRefusalsKeepTheirStatus() {
	for _, tc := range []struct {
		name string
		err  error
		want string
		msg  string
	}{
		{
			name: "an oversized batch", err: fmt.Errorf("%w: a batch holds 1 to 100", domain.ErrInvalidInput),
			want: "CreatePlacements400JSONResponse",
		},
		{
			name: "an unknown model", err: fmt.Errorf("item 2: %w", domain.ErrModelNotFound),
			want: "CreatePlacements404JSONResponse", msg: "item 2: model not found",
		},
		{name: "an unknown territory", err: domain.ErrTerritoryNotFound, want: "CreatePlacements404JSONResponse"},
		{name: "a catalog failure", err: errors.New("catalog down"), want: "CreatePlacements500JSONResponse"},
	} {
		s.Run(tc.name, func() {
			var slug string
			var items []domain.Placement
			resp, err := New(batchStub{slug: &slug, items: &items, err: tc.err}).CreatePlacements(s.T().Context(),
				CreatePlacementsRequestObject{Slug: "yard", Body: &PlacementBatchCreate{Items: []PlacementCreate{{ModelSlug: "pump"}}}})
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), fmt.Sprintf("%T", resp), "httpapi."+tc.want)
			if nf, ok := resp.(CreatePlacements404JSONResponse); ok && tc.msg != "" {
				assert.Equal(s.T(), nf.Message, tc.msg)
			}
		})
	}
}

// singleStub answers the one-placement create with err.
type singleStub struct {
	Service
	err error
}

func (c singleStub) CreatePlacement(context.Context, domain.Placement) (domain.Placement, error) {
	return domain.Placement{}, c.err
}

func (s *PlacementBatchSuite) TestASingleCreateKeepsItsStatus() {
	for _, tc := range []struct {
		name string
		err  error
		want string
	}{
		{name: "an unknown model", err: domain.ErrModelNotFound, want: "CreatePlacement404JSONResponse"},
		{name: "a bad scale", err: domain.ErrInvalidInput, want: "CreatePlacement400JSONResponse"},
		{name: "a catalog failure", err: errors.New("catalog down"), want: "CreatePlacement500JSONResponse"},
	} {
		s.Run(tc.name, func() {
			resp, err := New(singleStub{err: tc.err}).CreatePlacement(s.T().Context(),
				CreatePlacementRequestObject{Slug: "yard", Body: &PlacementCreate{ModelSlug: "pump"}})
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), fmt.Sprintf("%T", resp), "httpapi."+tc.want)
		})
	}
}

func (s *PlacementBatchSuite) TestAMissingBodyIsABadRequest() {
	resp, err := New(batchStub{}).CreatePlacements(s.T().Context(), CreatePlacementsRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	_, ok := resp.(CreatePlacements400JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}
