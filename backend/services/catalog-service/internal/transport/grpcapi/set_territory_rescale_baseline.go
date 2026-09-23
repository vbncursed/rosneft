package grpcapi

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetTerritoryRescaleBaseline(ctx context.Context, req *catalogv1.SetTerritoryRescaleBaselineRequest) (*catalogv1.SetTerritoryRescaleBaselineResponse, error) {
	// A message field has presence: a gateway built before the centre existed
	// sends none, and reading that as the origin would shift every binding.
	if req.GetSourceCenter() == nil {
		return nil, status.Error(codes.InvalidArgument, "source_center is required")
	}
	err := s.svc.SetTerritoryRescaleBaseline(ctx, req.GetTerritorySlug(), req.GetSourceMax(), vec3FromProto(req.GetSourceCenter()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetTerritoryRescaleBaselineResponse{}, nil
}
