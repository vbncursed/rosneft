package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteTerritory(ctx context.Context, req *catalogv1.DeleteTerritoryRequest) (*catalogv1.DeleteTerritoryResponse, error) {
	if err := s.svc.DeleteTerritory(ctx, req.GetSlug()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteTerritoryResponse{}, nil
}
