package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListMeasurements(ctx context.Context, req *catalogv1.ListMeasurementsRequest) (*catalogv1.ListMeasurementsResponse, error) {
	items, err := s.svc.ListMeasurements(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Measurement, len(items))
	for i, m := range items {
		out[i] = measurementToProto(m)
	}
	return &catalogv1.ListMeasurementsResponse{Measurements: out}, nil
}
