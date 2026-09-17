package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreateMeasurement(ctx context.Context, req *catalogv1.CreateMeasurementRequest) (*catalogv1.CreateMeasurementResponse, error) {
	points, err := domain.PointsFromFlat(req.GetPoints())
	if err != nil {
		return nil, mapError(err)
	}
	out, err := s.svc.CreateMeasurement(ctx, domain.Measurement{
		TerritorySlug: req.GetTerritorySlug(),
		Points:        points,
		Closed:        req.GetClosed(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreateMeasurementResponse{Measurement: measurementToProto(out)}, nil
}
