package grpcapi

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) UpsertModel(ctx context.Context, req *catalogv1.UpsertModelRequest) (*catalogv1.UpsertModelResponse, error) {
	if req.GetModel() == nil {
		return nil, mapError(fmt.Errorf("%w: model is required", domain.ErrInvalidInput))
	}
	out, err := s.svc.UpsertModel(ctx, modelFromProto(req.GetModel()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpsertModelResponse{Model: modelToProto(out)}, nil
}
