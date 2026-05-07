package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreatePlacement(ctx context.Context, req *catalogv1.CreatePlacementRequest) (*catalogv1.CreatePlacementResponse, error) {
	out, err := s.svc.CreatePlacement(ctx, domain.Placement{
		TerritorySlug: req.GetTerritorySlug(),
		ModelSlug:     req.GetModelSlug(),
		Position:      vec3FromProto(req.GetPosition()),
		Rotation:      vec3FromProto(req.GetRotation()),
		Scale:         vec3FromProto(req.GetScale()),
		Label:         req.GetLabel(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreatePlacementResponse{Placement: placementToProto(out)}, nil
}
