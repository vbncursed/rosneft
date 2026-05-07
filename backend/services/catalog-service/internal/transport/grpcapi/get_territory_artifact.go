package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetTerritoryArtifact(ctx context.Context, req *catalogv1.GetTerritoryArtifactRequest) (*catalogv1.GetTerritoryArtifactResponse, error) {
	a, err := s.svc.GetTerritoryArtifact(ctx, req.GetTerritorySlug(), req.GetLod())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetTerritoryArtifactResponse{Artifact: territoryArtifactToProto(a)}, nil
}
