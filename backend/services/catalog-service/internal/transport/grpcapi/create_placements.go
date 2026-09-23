package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreatePlacements(ctx context.Context, req *catalogv1.CreatePlacementsRequest) (*catalogv1.CreatePlacementsResponse, error) {
	items := make([]domain.Placement, len(req.GetItems()))
	for i, it := range req.GetItems() {
		items[i] = placementFromCreateRequest(it)
	}
	out, err := s.svc.CreatePlacements(ctx, req.GetTerritorySlug(), items)
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.CreatePlacementsResponse{Placements: make([]*catalogv1.Placement, len(out))}
	for i, p := range out {
		resp.Placements[i] = placementToProto(p)
	}
	return resp, nil
}
