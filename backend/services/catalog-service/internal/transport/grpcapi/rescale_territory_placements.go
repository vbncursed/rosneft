package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) RescaleTerritoryPlacements(ctx context.Context, req *catalogv1.RescaleTerritoryPlacementsRequest) (*catalogv1.RescaleTerritoryPlacementsResponse, error) {
	updated, err := s.svc.RescaleTerritoryPlacements(ctx, req.GetTerritorySlug(), req.GetNewSourceMax())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RescaleTerritoryPlacementsResponse{Updated: uint32(updated)}, nil
}
