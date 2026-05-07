package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetModel(ctx context.Context, req *catalogv1.GetModelRequest) (*catalogv1.GetModelResponse, error) {
	m, err := s.svc.GetModel(ctx, req.GetSlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetModelResponse{Model: modelToProto(m)}, nil
}
