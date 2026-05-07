package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListPlacements(ctx context.Context, req *catalogv1.ListPlacementsRequest) (*catalogv1.ListPlacementsResponse, error) {
	items, err := s.svc.ListPlacements(ctx, req.GetParentSlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Placement, len(items))
	for i, p := range items {
		out[i] = placementToProto(p)
	}
	return &catalogv1.ListPlacementsResponse{Placements: out}, nil
}
