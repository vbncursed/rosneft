package catalog

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

type targetCatalog struct {
	catalogv1.CatalogServiceClient
	territory              *catalogv1.Territory
	model                  *catalogv1.Model
	territories            []*catalogv1.Territory
	models                 []*catalogv1.Model
	territoryErr, modelErr error
	calls                  []string
	contexts               []context.Context
	slug                   string
}

func (f *targetCatalog) GetTerritory(
	ctx context.Context,
	req *catalogv1.GetTerritoryRequest,
	_ ...grpc.CallOption,
) (*catalogv1.GetTerritoryResponse, error) {
	f.calls = append(f.calls, "get territory")
	f.contexts = append(f.contexts, ctx)
	f.slug = req.GetSlug()
	return &catalogv1.GetTerritoryResponse{Territory: f.territory}, f.territoryErr
}

func (f *targetCatalog) GetModel(
	ctx context.Context,
	req *catalogv1.GetModelRequest,
	_ ...grpc.CallOption,
) (*catalogv1.GetModelResponse, error) {
	f.calls = append(f.calls, "get model")
	f.contexts = append(f.contexts, ctx)
	f.slug = req.GetSlug()
	return &catalogv1.GetModelResponse{Model: f.model}, f.modelErr
}

func (f *targetCatalog) ListTerritories(
	ctx context.Context,
	_ *catalogv1.ListTerritoriesRequest,
	_ ...grpc.CallOption,
) (*catalogv1.ListTerritoriesResponse, error) {
	f.calls = append(f.calls, "list territories")
	f.contexts = append(f.contexts, ctx)
	return &catalogv1.ListTerritoriesResponse{Territories: f.territories}, f.territoryErr
}

func (f *targetCatalog) ListModels(
	ctx context.Context,
	_ *catalogv1.ListModelsRequest,
	_ ...grpc.CallOption,
) (*catalogv1.ListModelsResponse, error) {
	f.calls = append(f.calls, "list models")
	f.contexts = append(f.contexts, ctx)
	return &catalogv1.ListModelsResponse{Models: f.models}, f.modelErr
}

func (s *ClientSuite) TestGetTarget() {
	for _, kind := range []domain.Kind{domain.KindTerritory, domain.KindModel} {
		s.Run(kind.String(), func() {
			f := &targetCatalog{
				territory: &catalogv1.Territory{
					Slug:           "returned",
					Title:          "title",
					Description:    "description",
					SourceBlobHash: "hash",
				},
				model: &catalogv1.Model{
					Slug:           "returned",
					Title:          "title",
					Description:    "description",
					SourceBlobHash: "hash",
				},
			}
			ctx := s.T().Context()
			got, err := (&Client{cc: f}).GetTarget(ctx, kind, "requested")
			assert.NilError(s.T(), err)
			assert.DeepEqual(s.T(),
				domain.ConversionTarget{
					Kind:           kind,
					Slug:           "returned",
					Title:          "title",
					Description:    "description",
					SourceBlobHash: "hash",
				},
				got,
			)
			assert.DeepEqual(s.T(), []string{"get " + kind.String()}, f.calls)
			assert.Equal(s.T(), len(f.contexts), 1)
			assert.Assert(s.T(), f.contexts[0] == ctx)
			assert.DeepEqual(s.T(), "requested", f.slug)
		})
	}
	s.Run("invalid kind", func() {
		f := &targetCatalog{}
		got, err := (&Client{cc: f}).GetTarget(s.T().Context(), domain.KindUnspecified, "x")
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		assert.DeepEqual(s.T(), got, domain.ConversionTarget{})
		assert.Equal(s.T(), len(f.calls), 0)
	})
	for _, kind := range []domain.Kind{domain.KindTerritory, domain.KindModel} {
		for _, rpcErr := range []error{status.Error(codes.NotFound, "missing"), status.Error(codes.Unavailable, "down"), errors.New("local failure")} {
			s.Run(kind.String()+"/"+rpcErr.Error(), func() {
				f := &targetCatalog{territoryErr: rpcErr, modelErr: rpcErr}
				got, err := (&Client{cc: f}).GetTarget(s.T().Context(), kind, "x")
				assert.DeepEqual(s.T(), got, domain.ConversionTarget{})
				if status.Code(rpcErr) == codes.NotFound {
					assert.ErrorIs(s.T(), err, domain.ErrTargetNotFound)
				} else {
					assert.ErrorIs(s.T(), err, rpcErr)
					assert.Assert(s.T(), !errors.Is(err, domain.ErrTargetNotFound))
				}
			})
		}
	}
}

func (s *ClientSuite) TestListTargets() {
	ctx := s.T().Context()
	f := &targetCatalog{
		territories: []*catalogv1.Territory{
			{Slug: "t1", Title: "T1", Description: "D1", SourceBlobHash: "h1"},
			{Slug: "t2", Title: "T2", Description: "D2", SourceBlobHash: "h2"},
		},
		models: []*catalogv1.Model{
			{Slug: "m1", Title: "M1", Description: "D3", SourceBlobHash: "h3"},
			{Slug: "m2", Title: "M2", Description: "D4", SourceBlobHash: "h4"},
		},
	}
	got, err := (&Client{cc: f}).ListTargets(ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(),
		[]domain.ConversionTarget{
			{Kind: domain.KindTerritory, Slug: "t1", Title: "T1", Description: "D1", SourceBlobHash: "h1"},
			{Kind: domain.KindTerritory, Slug: "t2", Title: "T2", Description: "D2", SourceBlobHash: "h2"},
			{Kind: domain.KindModel, Slug: "m1", Title: "M1", Description: "D3", SourceBlobHash: "h3"},
			{Kind: domain.KindModel, Slug: "m2", Title: "M2", Description: "D4", SourceBlobHash: "h4"},
		},
		got,
	)
	assert.DeepEqual(s.T(), []string{"list territories", "list models"}, f.calls)
	assert.Equal(s.T(), len(f.contexts), 2)
	assert.Assert(s.T(), f.contexts[0] == ctx)
	assert.Assert(s.T(), f.contexts[1] == ctx)

	s.Run("empty", func() {
		got, err := (&Client{cc: &targetCatalog{}}).ListTargets(s.T().Context())
		assert.NilError(s.T(), err)
		assert.Assert(s.T(), got != nil)
		assert.Equal(s.T(), len(got), 0)
	})
	for _, first := range []bool{true, false} {
		name := "model error"
		if first {
			name = "territory error"
		}
		s.Run(name, func() {
			rpcErr := errors.New("unavailable")
			f := &targetCatalog{territories: []*catalogv1.Territory{{Slug: "partial"}}}
			if first {
				f.territoryErr = rpcErr
			} else {
				f.modelErr = rpcErr
			}
			got, err := (&Client{cc: f}).ListTargets(s.T().Context())
			assert.ErrorIs(s.T(), err, rpcErr)
			assert.Assert(s.T(), got == nil)
			if first {
				assert.DeepEqual(s.T(), []string{"list territories"}, f.calls)
			} else {
				assert.DeepEqual(s.T(), []string{"list territories", "list models"}, f.calls)
			}
		})
	}
}
