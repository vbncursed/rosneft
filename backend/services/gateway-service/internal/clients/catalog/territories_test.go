package catalog

import (
	"errors"
	"testing"
	"time"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
	"gotest.tools/v3/assert"
)

// Absent stays absent on the wire: that is what keeps the catalog's column.
func TestUpdateTerritorySendsOnlyTheSetFields(t *testing.T) {
	cc := &updateCC{}
	got, err := (&Client{cc: cc}).UpdateTerritory(t.Context(), "yard",
		domain.TerritoryUpdate{Description: new(""), SourceBlobHash: new("h")})
	assert.NilError(t, err)
	assert.Equal(t, got.Slug, "yard")
	assert.Assert(t, cc.territory.Title == nil && cc.territory.ExternalPanoramaUrl == nil)
	assert.Assert(t, cc.territory.Description != nil && cc.territory.SourceBlobHash != nil)
	assert.Equal(t, cc.territory.GetDescription(), "")
	assert.Equal(t, cc.territory.GetSourceBlobHash(), "h")
}

func TestUpdateTerritoryNotFoundIsTheSentinel(t *testing.T) {
	cc := &updateCC{err: status.Error(codes.NotFound, "territory not found")}
	_, err := (&Client{cc: cc}).UpdateTerritory(t.Context(), "x", domain.TerritoryUpdate{Title: new("t")})
	assert.ErrorIs(t, err, domain.ErrTerritoryNotFound)
}

func (s *CatalogListsSuite) TestTerritories() {
	stamp := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	s.territories = []*catalogv1.Territory{
		{
			Slug:                "yard",
			Title:               "Yard",
			Description:         "desc",
			SourceBlobHash:      "src",
			ExternalPanoramaUrl: "url",
			PlacementCount:      4,
			CreatedAt:           timestamppb.New(stamp),
			UpdatedAt:           timestamppb.New(stamp),
			Artifacts: []*catalogv1.TerritoryArtifact{
				{Lod: 0, Hash: "h0", Size: 11, Vertices: 12, Faces: 13, PlainHash: "plain"},
				{Lod: 2, Hash: "h2"},
			},
		},
		{Slug: "site", Title: "Site", CreatedAt: timestamppb.New(stamp), UpdatedAt: timestamppb.New(stamp)},
	}
	ctx := s.T().Context()
	got, err := s.cli.ListTerritories(ctx, "admin-42", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.method, catalogv1.CatalogService_ListTerritories_FullMethodName)
	assert.Assert(s.T(), s.ctx == ctx)
	req := s.request.(*catalogv1.ListTerritoriesRequest)
	assert.Equal(s.T(), req.GetScopeAdminId(), "admin-42")
	assert.Equal(s.T(), req.GetWithArtifacts(), true)
	assert.DeepEqual(s.T(), got, []domain.Territory{
		{
			Slug:                "yard",
			Title:               "Yard",
			Description:         "desc",
			SourceBlobHash:      "src",
			ExternalPanoramaURL: "url",
			PlacementCount:      4,
			CreatedAt:           stamp,
			UpdatedAt:           stamp,
			LODs: []domain.LodArtifact{
				{LOD: 0, Hash: "h0", Size: 11, Vertices: 12, Faces: 13, PlainHash: "plain"},
				{LOD: 2, Hash: "h2"},
			},
		},
		{Slug: "site", Title: "Site", CreatedAt: stamp, UpdatedAt: stamp, LODs: []domain.LodArtifact{}},
	})
}

func (s *CatalogListsSuite) TestTerritoriesEmpty() {
	territories, err := s.cli.ListTerritories(s.T().Context(), "", false)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), territories, []domain.Territory{})
	assert.Equal(s.T(), s.method, catalogv1.CatalogService_ListTerritories_FullMethodName)
	req := s.request.(*catalogv1.ListTerritoriesRequest)
	assert.Equal(s.T(), req.GetScopeAdminId(), "")
	assert.Equal(s.T(), req.GetWithArtifacts(), false)
}

func (s *CatalogListsSuite) TestTerritoriesErrors() {
	for _, tc := range []struct {
		name    string
		cause   error
		invalid bool
	}{
		{"invalid argument", status.Error(codes.InvalidArgument, "invalid"), true},
		{"unavailable", status.Error(codes.Unavailable, "offline"), false},
	} {
		s.Run(tc.name, func() {
			s.err = tc.cause

			territories, err := s.cli.ListTerritories(s.T().Context(), "admin", false)
			assert.Assert(s.T(), territories == nil)
			assert.ErrorContains(s.T(), err, "catalog.ListTerritories:")
			assert.Assert(s.T(), errors.Is(err, tc.cause))
			if tc.invalid {
				assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
			}
		})
	}
}
