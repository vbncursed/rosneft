package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) RenamePlacementGroup(ctx context.Context, req *catalogv1.RenamePlacementGroupRequest) (*catalogv1.RenamePlacementGroupResponse, error) {
	g, err := s.svc.RenamePlacementGroup(ctx, req.GetTerritorySlug(), req.GetId(), req.GetTitle())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RenamePlacementGroupResponse{Group: placementGroupToProto(g)}, nil
}
