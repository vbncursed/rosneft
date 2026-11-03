package catalog

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcmock"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func TestUpdateModelSendsOnlyTheSetFields(t *testing.T) {
	cc := &updateCC{}
	got, err := (&Client{cc: cc}).UpdateModel(t.Context(), "pump", domain.ModelUpdate{ThumbnailBlobHash: new("")})
	assert.NilError(t, err)
	assert.Equal(t, got.Slug, "pump")
	assert.Assert(t, cc.model.Title == nil && cc.model.Description == nil)
	assert.Assert(t, cc.model.ThumbnailBlobHash != nil)
	assert.Equal(t, cc.model.GetThumbnailBlobHash(), "")
}

func TestUpdateModelNotFoundIsTheSentinel(t *testing.T) {
	cc := &updateCC{err: status.Error(codes.NotFound, "model not found")}
	_, err := (&Client{cc: cc}).UpdateModel(t.Context(), "x", domain.ModelUpdate{Title: new("t")})
	assert.ErrorIs(t, err, domain.ErrModelNotFound)
}

type CatalogListsSuite struct {
	suite.Suite
	cc                 *grpcmock.ClientConnInterfaceMock
	cli                *Client
	ctx                context.Context
	method             string
	request            any
	models             []*catalogv1.Model
	territories        []*catalogv1.Territory
	placements         []*catalogv1.Placement
	modelArtifacts     []*catalogv1.ModelArtifact
	territoryArtifacts []*catalogv1.TerritoryArtifact
	err                error
}

func TestCatalogListsSuite(t *testing.T) { suite.Run(t, new(CatalogListsSuite)) }
func (s *CatalogListsSuite) SetupTest() {
	s.ctx, s.request, s.models, s.territories, s.err = nil, nil, nil, nil, nil
	s.cc = grpcmock.NewClientConnInterfaceMock(minimock.NewController(s.T()))
	s.cli = &Client{cc: catalogv1.NewCatalogServiceClient(s.cc)}
	s.cc.InvokeMock.Set(func(ctx context.Context, method string, req, reply any, _ ...grpc.CallOption) error {
		s.ctx, s.method, s.request = ctx, method, req
		switch r := reply.(type) {
		case *catalogv1.ListPlacementsResponse:
			r.Placements = s.placements
		case *catalogv1.ListModelArtifactsResponse:
			r.Artifacts = s.modelArtifacts
		case *catalogv1.ListTerritoryArtifactsResponse:
			r.Artifacts = s.territoryArtifacts
		case *catalogv1.ListModelsResponse:
			r.Models = s.models
		case *catalogv1.ListTerritoriesResponse:
			r.Territories = s.territories
		}
		return s.err
	})
}

func (s *CatalogListsSuite) TestModels() {
	stamp := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	s.models = []*catalogv1.Model{
		{
			Slug:              "pump",
			Title:             "Pump",
			Description:       "desc",
			SourceBlobHash:    "src",
			ThumbnailBlobHash: "thumb",
			Tag:               &catalogv1.ModelTag{Slug: "plant", Title: "Plant"},
			UsageCount:        3,
			CreatedAt:         timestamppb.New(stamp),
			UpdatedAt:         timestamppb.New(stamp),
			Artifacts: []*catalogv1.ModelArtifact{
				{
					Lod:       0,
					Hash:      "h0",
					Size:      11,
					Vertices:  12,
					Faces:     13,
					PlainHash: "plain",
					BboxMin:   &catalogv1.Vec3{X: -1},
					BboxMax:   &catalogv1.Vec3{Y: 2},
				},
				{Lod: 2, Hash: "h2"},
			},
		},
		{Slug: "valve", Title: "Valve", CreatedAt: timestamppb.New(stamp), UpdatedAt: timestamppb.New(stamp)},
	}
	ctx := s.T().Context()
	got, err := s.cli.ListModels(ctx, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.method, catalogv1.CatalogService_ListModels_FullMethodName)
	assert.Assert(s.T(), s.ctx == ctx)
	assert.Equal(s.T(), s.request.(*catalogv1.ListModelsRequest).GetWithArtifacts(), true)
	assert.DeepEqual(s.T(), got, []domain.Model{
		{
			Slug:              "pump",
			Title:             "Pump",
			Description:       "desc",
			SourceBlobHash:    "src",
			ThumbnailBlobHash: "thumb",
			Tag:               domain.ModelTag{Slug: "plant", Title: "Plant"},
			UsageCount:        3,
			CreatedAt:         stamp,
			UpdatedAt:         stamp,
			LODs: []domain.LodArtifact{
				{LOD: 0, Hash: "h0", Size: 11, Vertices: 12, Faces: 13, PlainHash: "plain"},
				{LOD: 2, Hash: "h2"},
			},
			BBoxMin: new(domain.Vec3{X: -1}),
			BBoxMax: new(domain.Vec3{Y: 2}),
		},
		{Slug: "valve", Title: "Valve", CreatedAt: stamp, UpdatedAt: stamp, LODs: []domain.LodArtifact{}},
	})
}

func (s *CatalogListsSuite) TestModelsEmpty() {
	models, err := s.cli.ListModels(s.T().Context(), false)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), models, []domain.Model{})
	assert.Equal(s.T(), s.method, catalogv1.CatalogService_ListModels_FullMethodName)
	assert.Equal(s.T(), s.request.(*catalogv1.ListModelsRequest).GetWithArtifacts(), false)
}

func (s *CatalogListsSuite) TestModelsErrors() {
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

			models, err := s.cli.ListModels(s.T().Context(), false)
			assert.Assert(s.T(), models == nil)
			assert.ErrorContains(s.T(), err, "catalog.ListModels:")
			assert.Assert(s.T(), errors.Is(err, tc.cause))
			if tc.invalid {
				assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
			}
		})
	}
}

func (s *CatalogListsSuite) TestListModelArtifacts() {
	s.modelArtifacts = []*catalogv1.ModelArtifact{
		{
			ModelSlug:   "yard",
			Lod:         2,
			Hash:        "hash",
			ContentType: "model/gltf-binary",
			Size:        42,
			Vertices:    43,
			Faces:       44,
			BboxMin:     &catalogv1.Vec3{X: -1, Y: -2, Z: -3},
			BboxMax:     &catalogv1.Vec3{X: 4, Y: 5, Z: 6},
			CreatedAt:   timestamppb.New(listStamp),
			PlainHash:   "plain",
		},
	}
	ctx := s.T().Context()
	got, err := s.cli.ListModelArtifacts(ctx, "yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.method, catalogv1.CatalogService_ListModelArtifacts_FullMethodName)
	assert.Assert(s.T(), s.ctx == ctx)
	assert.Equal(s.T(), s.request.(*catalogv1.ListModelArtifactsRequest).GetModelSlug(), "yard")
	assert.Equal(s.T(), len(got), 1)
	assert.Equal(s.T(), got[0].Slug, "yard")
	assert.Equal(s.T(), got[0].LOD, uint32(2))
	assert.Equal(s.T(), got[0].Hash, "hash")
	assert.Equal(s.T(), got[0].Size, int64(42))
	assert.Equal(s.T(), got[0].ContentType, "model/gltf-binary")
	assert.Equal(s.T(), got[0].Vertices, uint64(43))
	assert.Equal(s.T(), got[0].Faces, uint64(44))
	assert.DeepEqual(s.T(), got[0].BBoxMin, domain.Vec3{X: -1, Y: -2, Z: -3})
	assert.DeepEqual(s.T(), got[0].BBoxMax, domain.Vec3{X: 4, Y: 5, Z: 6})
	assert.Assert(s.T(), got[0].CreatedAt.Equal(listStamp))
	assert.Equal(s.T(), got[0].PlainHash, "plain")
	for _, tc := range []struct {
		name        string
		cause, want error
	}{
		{"not found", status.Error(codes.NotFound, "missing"), domain.ErrModelNotFound},
		{"unavailable", status.Error(codes.Unavailable, "offline"), nil},
	} {
		s.Run(tc.name, func() {
			s.err = tc.cause
			got, err := s.cli.ListModelArtifacts(ctx, "yard")
			assert.Assert(s.T(), got == nil)
			assert.ErrorContains(s.T(), err, "catalog.ListModelArtifacts:")
			if tc.want != nil {
				assert.ErrorIs(s.T(), err, tc.want)
			} else {
				assert.ErrorIs(s.T(), err, tc.cause)
			}
		})
	}
}
