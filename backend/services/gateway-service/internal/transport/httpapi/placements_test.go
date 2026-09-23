package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
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
	key   *string
	items *[]domain.Placement
	err   error
}

func (b batchStub) CreatePlacements(_ context.Context, slug, key string, items []domain.Placement) ([]domain.Placement, error) {
	*b.slug, *b.items = slug, items
	if b.key != nil {
		*b.key = key
	}
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
	var slug, key string
	var items []domain.Placement
	label := "north"
	body := PlacementBatchCreate{Items: []PlacementCreate{
		{ModelSlug: "pump", Position: &Vec3{X: 1}},
		{ModelSlug: "tank", Label: &label, VisiblePanoramaIds: &[]int64{7}},
	}}

	resp, err := New(batchStub{slug: &slug, key: &key, items: &items}).CreatePlacements(s.T().Context(),
		CreatePlacementsRequestObject{Slug: "yard", Params: CreatePlacementsParams{IdempotencyKey: new("Retry-7f3a")}, Body: &body})
	assert.NilError(s.T(), err)
	created, ok := resp.(CreatePlacements201JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), slug, "yard")
	assert.Equal(s.T(), key, "Retry-7f3a")
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
		{name: "a key reused for another batch", err: domain.ErrIdempotencyConflict, want: "CreatePlacements409JSONResponse"},
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

// The conflict body is the contract's: code "conflict" and the catalog's words.
func (s *PlacementBatchSuite) TestAReusedKeyIsAConflict() {
	var slug string
	var items []domain.Placement
	resp, err := New(batchStub{slug: &slug, items: &items, err: domain.ErrIdempotencyConflict}).CreatePlacements(s.T().Context(),
		CreatePlacementsRequestObject{
			Slug: "yard", Params: CreatePlacementsParams{IdempotencyKey: new("k")},
			Body: &PlacementBatchCreate{Items: []PlacementCreate{{ModelSlug: "pump"}}},
		})
	assert.NilError(s.T(), err)
	conflict, ok := resp.(CreatePlacements409JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), conflict.Code, "conflict")
	assert.Equal(s.T(), conflict.Message, "idempotency key reused with a different batch")
}

// A key outside 1–64 of [A-Za-z0-9-] is refused before the catalog is asked.
func (s *PlacementBatchSuite) TestABadIdempotencyKeyIsABadRequest() {
	for name, bad := range map[string]string{
		"empty": "", "too long": strings.Repeat("a", 65), "a space": "a b",
		"an underscore": "a_b", "not ascii": "ключ",
	} {
		s.Run(name, func() {
			resp, err := New(batchStub{}).CreatePlacements(s.T().Context(), CreatePlacementsRequestObject{
				Slug: "yard", Params: CreatePlacementsParams{IdempotencyKey: &bad},
				Body: &PlacementBatchCreate{Items: []PlacementCreate{{ModelSlug: "pump"}}},
			})
			assert.NilError(s.T(), err)
			refused, ok := resp.(CreatePlacements400JSONResponse)
			assert.Assert(s.T(), ok, "got %T", resp)
			assert.Equal(s.T(), refused.Code, "invalid_input")
		})
	}
}

func (s *PlacementBatchSuite) TestAMissingBodyIsABadRequest() {
	resp, err := New(batchStub{}).CreatePlacements(s.T().Context(), CreatePlacementsRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	_, ok := resp.(CreatePlacements400JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}

// The header reaches the handler through the generated wrapper, not only in a
// hand-built request object.
func (s *PlacementBatchSuite) TestTheIdempotencyKeyHeaderReachesTheService() {
	var slug, key string
	r := chi.NewRouter()
	HandlerFromMux(NewStrictHandler(New(batchStub{slug: &slug, key: &key, items: new([]domain.Placement)}), nil), r)

	req := httptest.NewRequestWithContext(s.T().Context(), http.MethodPost,
		"/api/territories/yard/placements/batch", strings.NewReader(`{"items":[{"modelSlug":"pump"}]}`))
	req.Header.Set("Idempotency-Key", "a1b2-c3")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(s.T(), rec.Code, http.StatusCreated, rec.Body.String())
	assert.Equal(s.T(), key, "a1b2-c3")
}
