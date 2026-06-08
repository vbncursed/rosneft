package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) UpdatePanorama(ctx context.Context, req *catalogv1.UpdatePanoramaRequest) (*catalogv1.UpdatePanoramaResponse, error) {
	out, err := s.svc.UpdatePanorama(ctx, domain.Panorama{
		ID:        req.GetId(),
		Title:     req.GetTitle(),
		Position:  vec3FromProto(req.GetPosition()),
		YawOffset: req.GetYawOffset(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdatePanoramaResponse{Panorama: panoramaToProto(out)}, nil
}
