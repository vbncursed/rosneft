package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteMeasurements(ctx context.Context, req *catalogv1.DeleteMeasurementsRequest) (*catalogv1.DeleteMeasurementsResponse, error) {
	deleted, err := s.svc.DeleteMeasurements(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteMeasurementsResponse{Deleted: uint32(deleted)}, nil
}
