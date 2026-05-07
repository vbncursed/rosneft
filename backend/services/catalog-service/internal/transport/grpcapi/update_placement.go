package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) UpdatePlacement(ctx context.Context, req *catalogv1.UpdatePlacementRequest) (*catalogv1.UpdatePlacementResponse, error) {
	out, err := s.svc.UpdatePlacement(ctx, domain.Placement{
		ID:       req.GetId(),
		Position: vec3FromProto(req.GetPosition()),
		Rotation: vec3FromProto(req.GetRotation()),
		Scale:    vec3FromProto(req.GetScale()),
		Label:    req.GetLabel(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdatePlacementResponse{Placement: placementToProto(out)}, nil
}
