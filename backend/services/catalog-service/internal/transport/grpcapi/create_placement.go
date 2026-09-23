package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) CreatePlacement(ctx context.Context, req *catalogv1.CreatePlacementRequest) (*catalogv1.CreatePlacementResponse, error) {
	out, err := s.svc.CreatePlacement(ctx, placementFromCreateRequest(req))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreatePlacementResponse{Placement: placementToProto(out)}, nil
}
