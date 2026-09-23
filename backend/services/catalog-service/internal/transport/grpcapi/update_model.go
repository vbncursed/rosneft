package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) UpdateModel(ctx context.Context, req *catalogv1.UpdateModelRequest) (*catalogv1.UpdateModelResponse, error) {
	out, err := s.svc.UpdateModel(ctx, req.GetSlug(), domain.ModelPatch{
		Title:             req.Title,
		Description:       req.Description,
		ThumbnailBlobHash: req.ThumbnailBlobHash,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdateModelResponse{Model: modelToProto(out)}, nil
}
