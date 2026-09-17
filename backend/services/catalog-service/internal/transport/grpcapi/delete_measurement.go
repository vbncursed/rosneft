package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteMeasurement(ctx context.Context, req *catalogv1.DeleteMeasurementRequest) (*catalogv1.DeleteMeasurementResponse, error) {
	if err := s.svc.DeleteMeasurement(ctx, req.GetTerritorySlug(), req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteMeasurementResponse{}, nil
}
