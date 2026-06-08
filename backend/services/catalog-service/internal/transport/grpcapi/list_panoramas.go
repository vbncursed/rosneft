package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListPanoramas(ctx context.Context, req *catalogv1.ListPanoramasRequest) (*catalogv1.ListPanoramasResponse, error) {
	items, err := s.svc.ListPanoramas(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Panorama, len(items))
	for i, p := range items {
		out[i] = panoramaToProto(p)
	}
	return &catalogv1.ListPanoramasResponse{Panoramas: out}, nil
}
