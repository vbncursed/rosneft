package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteTerritoryArtifacts(ctx context.Context, req *catalogv1.DeleteTerritoryArtifactsRequest) (*catalogv1.DeleteTerritoryArtifactsResponse, error) {
	if err := s.svc.DeleteTerritoryArtifacts(ctx, req.GetTerritorySlug()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteTerritoryArtifactsResponse{}, nil
}
