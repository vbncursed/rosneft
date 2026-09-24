package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeletePlacementGroup(ctx context.Context, req *catalogv1.DeletePlacementGroupRequest) (*catalogv1.DeletePlacementGroupResponse, error) {
	if err := s.svc.DeletePlacementGroup(ctx, req.GetTerritorySlug(), req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeletePlacementGroupResponse{}, nil
}
