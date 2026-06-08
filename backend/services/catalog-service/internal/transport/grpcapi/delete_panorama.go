package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeletePanorama(ctx context.Context, req *catalogv1.DeletePanoramaRequest) (*catalogv1.DeletePanoramaResponse, error) {
	if err := s.svc.DeletePanorama(ctx, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeletePanoramaResponse{}, nil
}
