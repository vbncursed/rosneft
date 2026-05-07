package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetTerritory(ctx context.Context, req *catalogv1.GetTerritoryRequest) (*catalogv1.GetTerritoryResponse, error) {
	t, err := s.svc.GetTerritory(ctx, req.GetSlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetTerritoryResponse{Territory: territoryToProto(t)}, nil
}
