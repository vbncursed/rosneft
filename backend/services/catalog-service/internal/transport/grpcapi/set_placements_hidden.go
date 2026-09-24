package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetPlacementsHidden(ctx context.Context, req *catalogv1.SetPlacementsHiddenRequest) (*catalogv1.SetPlacementsHiddenResponse, error) {
	n, err := s.svc.SetPlacementsHidden(ctx, req.GetTerritorySlug(), req.GetIds(), req.GetHidden())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetPlacementsHiddenResponse{Updated: uint32(n)}, nil
}
