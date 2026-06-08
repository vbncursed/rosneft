package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreatePanorama(ctx context.Context, req *catalogv1.CreatePanoramaRequest) (*catalogv1.CreatePanoramaResponse, error) {
	out, err := s.svc.CreatePanorama(ctx, domain.Panorama{
		TerritorySlug:  req.GetTerritorySlug(),
		Slug:           req.GetSlug(),
		Title:          req.GetTitle(),
		SourceBlobHash: req.GetSourceBlobHash(),
		Position:       vec3FromProto(req.GetPosition()),
		YawOffset:      req.GetYawOffset(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreatePanoramaResponse{Panorama: panoramaToProto(out)}, nil
}
