package grpcapi

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) UpsertTerritory(ctx context.Context, req *catalogv1.UpsertTerritoryRequest) (*catalogv1.UpsertTerritoryResponse, error) {
	if req.GetTerritory() == nil {
		return nil, mapError(fmt.Errorf("%w: territory is required", domain.ErrInvalidInput))
	}
	out, err := s.svc.UpsertTerritory(ctx, territoryFromProto(req.GetTerritory()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpsertTerritoryResponse{Territory: territoryToProto(out)}, nil
}
