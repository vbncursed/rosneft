package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeletePlacement(ctx context.Context, req *catalogv1.DeletePlacementRequest) (*catalogv1.DeletePlacementResponse, error) {
	if err := s.svc.DeletePlacement(ctx, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeletePlacementResponse{}, nil
}
