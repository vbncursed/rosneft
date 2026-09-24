package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListPlacementGroups(ctx context.Context, req *catalogv1.ListPlacementGroupsRequest) (*catalogv1.ListPlacementGroupsResponse, error) {
	groups, err := s.svc.ListPlacementGroups(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.PlacementGroup, len(groups))
	for i, g := range groups {
		out[i] = placementGroupToProto(g)
	}
	return &catalogv1.ListPlacementGroupsResponse{Groups: out}, nil
}
