package grpcapi

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) RegisterTerritoryArtifact(ctx context.Context, req *catalogv1.RegisterTerritoryArtifactRequest) (*catalogv1.RegisterTerritoryArtifactResponse, error) {
	if req.GetArtifact() == nil {
		return nil, mapError(fmt.Errorf("%w: artifact is required", domain.ErrInvalidInput))
	}
	out, err := s.svc.RegisterTerritoryArtifact(ctx, territoryArtifactFromProto(req.GetArtifact()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RegisterTerritoryArtifactResponse{Artifact: territoryArtifactToProto(out)}, nil
}
