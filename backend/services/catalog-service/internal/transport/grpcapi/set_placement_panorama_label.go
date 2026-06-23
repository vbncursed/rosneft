package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetPlacementPanoramaLabel(ctx context.Context, req *catalogv1.SetPlacementPanoramaLabelRequest) (*catalogv1.SetPlacementPanoramaLabelResponse, error) {
	out, err := s.svc.SetPlacementPanoramaLabel(ctx, req.GetTerritorySlug(), req.GetPlacementId(), req.GetPanoramaId(), req.GetLabel())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetPlacementPanoramaLabelResponse{Placement: placementToProto(out)}, nil
}
