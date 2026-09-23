package grpcapi

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) RescaleTerritoryPlacements(ctx context.Context, req *catalogv1.RescaleTerritoryPlacementsRequest) (*catalogv1.RescaleTerritoryPlacementsResponse, error) {
	// Refused, not defaulted to the origin: a stale mesh-worker then fails the
	// job before LOD0 is published, the reconciler retries it, and the retry
	// succeeds once the worker is current — nothing is moved by a wrong offset.
	if req.GetNewSourceCenter() == nil {
		return nil, status.Error(codes.InvalidArgument, "new_source_center is required")
	}
	updated, err := s.svc.RescaleTerritoryPlacements(ctx, req.GetTerritorySlug(), req.GetNewSourceMax(), vec3FromProto(req.GetNewSourceCenter()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RescaleTerritoryPlacementsResponse{Updated: uint32(updated)}, nil
}
