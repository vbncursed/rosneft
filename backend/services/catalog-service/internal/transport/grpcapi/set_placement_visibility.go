package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetPlacementVisibility(ctx context.Context, req *catalogv1.SetPlacementVisibilityRequest) (*catalogv1.SetPlacementVisibilityResponse, error) {
	out, err := s.svc.SetPlacementVisibility(ctx, req.GetTerritorySlug(), req.GetPlacementId(), req.GetPanoramaIds())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetPlacementVisibilityResponse{Placement: placementToProto(out)}, nil
}
