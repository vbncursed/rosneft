package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetPlacementGroupHidden(ctx context.Context, req *catalogv1.SetPlacementGroupHiddenRequest) (*catalogv1.SetPlacementGroupHiddenResponse, error) {
	g, err := s.svc.SetPlacementGroupHidden(ctx, req.GetTerritorySlug(), req.GetId(), req.GetHidden())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetPlacementGroupHiddenResponse{Group: placementGroupToProto(g)}, nil
}
