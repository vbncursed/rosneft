package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// ResolveTerritorySlugs labels territory ids for the audit journal.
func (s *Server) ResolveTerritorySlugs(
	ctx context.Context, req *catalogv1.ResolveTerritorySlugsRequest,
) (*catalogv1.ResolveTerritorySlugsResponse, error) {
	slugs, err := s.svc.ResolveTerritorySlugs(ctx, req.GetIds())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.ResolveTerritorySlugsResponse{Slugs: slugs}, nil
}
