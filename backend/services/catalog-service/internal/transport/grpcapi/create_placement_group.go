package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) CreatePlacementGroup(ctx context.Context, req *catalogv1.CreatePlacementGroupRequest) (*catalogv1.CreatePlacementGroupResponse, error) {
	g, err := s.svc.CreatePlacementGroup(ctx, req.GetTerritorySlug(), req.GetTitle())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreatePlacementGroupResponse{Group: placementGroupToProto(g)}, nil
}
