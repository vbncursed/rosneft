package grpcapi

import (
	"context"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

func (s *Server) ListPanoramas(ctx context.Context, req *contentv1.ListPanoramasRequest) (*contentv1.ListPanoramasResponse, error) {
	items, err := s.svc.ListPanoramas(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*contentv1.Panorama, len(items))
	for i, p := range items {
		out[i] = panoramaToProto(p)
	}
	return &contentv1.ListPanoramasResponse{Panoramas: out}, nil
}

func (s *Server) CreatePanorama(ctx context.Context, req *contentv1.CreatePanoramaRequest) (*contentv1.CreatePanoramaResponse, error) {
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
	return &contentv1.CreatePanoramaResponse{Panorama: panoramaToProto(out)}, nil
}

func (s *Server) UpdatePanorama(ctx context.Context, req *contentv1.UpdatePanoramaRequest) (*contentv1.UpdatePanoramaResponse, error) {
	out, err := s.svc.UpdatePanorama(ctx, domain.Panorama{
		ID:        req.GetId(),
		Title:     req.GetTitle(),
		Position:  vec3FromProto(req.GetPosition()),
		YawOffset: req.GetYawOffset(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &contentv1.UpdatePanoramaResponse{Panorama: panoramaToProto(out)}, nil
}

func (s *Server) DeletePanorama(ctx context.Context, req *contentv1.DeletePanoramaRequest) (*contentv1.DeletePanoramaResponse, error) {
	if err := s.svc.DeletePanorama(ctx, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &contentv1.DeletePanoramaResponse{}, nil
}
