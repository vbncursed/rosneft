package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteModel(ctx context.Context, req *catalogv1.DeleteModelRequest) (*catalogv1.DeleteModelResponse, error) {
	if err := s.svc.DeleteModel(ctx, req.GetSlug()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteModelResponse{}, nil
}
