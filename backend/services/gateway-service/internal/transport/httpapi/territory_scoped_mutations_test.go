package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// TerritoryScopedMutationsSuite checks that every id-keyed mutation under
// /api/territories/{slug} hands the URL's slug to the service. The territory
// gate authorises that slug only; storage scopes the row by it, so a handler
// that dropped it would reopen the cross-tenant write.
type TerritoryScopedMutationsSuite struct{ suite.Suite }

func TestTerritoryScopedMutationsSuite(t *testing.T) {
	suite.Run(t, new(TerritoryScopedMutationsSuite))
}

// slugRecorder captures the slug each mutation received; anything else panics
// through the embedded nil Service, same style as list_counts_test.go.
type slugRecorder struct {
	Service
	slug *string
}

func (r slugRecorder) UpdatePlacement(_ context.Context, p domain.Placement) (domain.Placement, error) {
	*r.slug = p.TerritorySlug
	return p, nil
}

func (r slugRecorder) DeletePlacement(_ context.Context, territorySlug string, _ int64) error {
	*r.slug = territorySlug
	return nil
}

func (r slugRecorder) UpdateMeasurement(_ context.Context, m domain.Measurement) (domain.Measurement, error) {
	*r.slug = m.TerritorySlug
	return m, nil
}

func (r slugRecorder) DeleteMeasurement(_ context.Context, territorySlug string, _ int64) error {
	*r.slug = territorySlug
	return nil
}

func (r slugRecorder) UpdatePanorama(_ context.Context, p domain.Panorama) (domain.Panorama, error) {
	*r.slug = p.TerritorySlug
	return p, nil
}

func (r slugRecorder) DeletePanorama(_ context.Context, territorySlug string, _ int64) error {
	*r.slug = territorySlug
	return nil
}

func (r slugRecorder) DeleteDocument(_ context.Context, territorySlug string, _ int64) error {
	*r.slug = territorySlug
	return nil
}

func (s *TerritoryScopedMutationsSuite) TestEveryMutationForwardsTheURLSlug() {
	cases := []struct {
		name string
		call func(context.Context, *Server) error
	}{
		{name: "update placement", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.UpdatePlacement(ctx, UpdatePlacementRequestObject{Slug: "yard", Id: 1, Body: &UpdatePlacementJSONRequestBody{}})
			return err
		}},
		{name: "delete placement", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.DeletePlacement(ctx, DeletePlacementRequestObject{Slug: "yard", Id: 1})
			return err
		}},
		{name: "update measurement", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.UpdateMeasurement(ctx, UpdateMeasurementRequestObject{Slug: "yard", Id: 1, Body: &UpdateMeasurementJSONRequestBody{}})
			return err
		}},
		{name: "delete measurement", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.DeleteMeasurement(ctx, DeleteMeasurementRequestObject{Slug: "yard", Id: 1})
			return err
		}},
		{name: "update panorama", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.UpdatePanorama(ctx, UpdatePanoramaRequestObject{Slug: "yard", Id: 1, Body: &UpdatePanoramaJSONRequestBody{}})
			return err
		}},
		{name: "delete panorama", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.DeletePanorama(ctx, DeletePanoramaRequestObject{Slug: "yard", Id: 1})
			return err
		}},
		{name: "delete document", call: func(ctx context.Context, srv *Server) error {
			_, err := srv.DeleteDocument(ctx, DeleteDocumentRequestObject{Slug: "yard", Id: 1})
			return err
		}},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			var got string
			assert.NilError(s.T(), tc.call(s.T().Context(), New(slugRecorder{slug: &got})))
			assert.Equal(s.T(), got, "yard")
		})
	}
}
