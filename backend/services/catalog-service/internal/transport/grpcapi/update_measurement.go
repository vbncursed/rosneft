package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) UpdateMeasurement(ctx context.Context, req *catalogv1.UpdateMeasurementRequest) (*catalogv1.UpdateMeasurementResponse, error) {
	points, err := domain.PointsFromFlat(req.GetPoints())
	if err != nil {
		return nil, mapError(err)
	}
	out, err := s.svc.UpdateMeasurement(ctx, domain.Measurement{
		ID:            req.GetId(),
		TerritorySlug: req.GetTerritorySlug(),
		Points:        points,
		Closed:        req.GetClosed(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdateMeasurementResponse{Measurement: measurementToProto(out)}, nil
}
