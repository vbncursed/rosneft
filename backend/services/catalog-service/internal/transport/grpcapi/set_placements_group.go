package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetPlacementsGroup(ctx context.Context, req *catalogv1.SetPlacementsGroupRequest) (*catalogv1.SetPlacementsGroupResponse, error) {
	n, err := s.svc.SetPlacementsGroup(ctx, req.GetTerritorySlug(), req.GetIds(), req.GroupId)
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetPlacementsGroupResponse{Updated: uint32(n)}, nil
}
