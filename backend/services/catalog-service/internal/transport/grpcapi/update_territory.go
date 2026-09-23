package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) UpdateTerritory(ctx context.Context, req *catalogv1.UpdateTerritoryRequest) (*catalogv1.UpdateTerritoryResponse, error) {
	out, err := s.svc.UpdateTerritory(ctx, req.GetSlug(), domain.TerritoryPatch{
		Title:               req.Title,
		Description:         req.Description,
		ExternalPanoramaURL: req.ExternalPanoramaUrl,
		SourceBlobHash:      req.SourceBlobHash,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdateTerritoryResponse{Territory: territoryToProto(out)}, nil
}
