package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetTerritoryRescaleBaseline(ctx context.Context, req *catalogv1.SetTerritoryRescaleBaselineRequest) (*catalogv1.SetTerritoryRescaleBaselineResponse, error) {
	if err := s.svc.SetTerritoryRescaleBaseline(ctx, req.GetTerritorySlug(), req.GetSourceMax()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetTerritoryRescaleBaselineResponse{}, nil
}
