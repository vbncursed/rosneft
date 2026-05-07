package grpcapi

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) RegisterModelArtifact(ctx context.Context, req *catalogv1.RegisterModelArtifactRequest) (*catalogv1.RegisterModelArtifactResponse, error) {
	if req.GetArtifact() == nil {
		return nil, mapError(fmt.Errorf("%w: artifact is required", domain.ErrInvalidInput))
	}
	out, err := s.svc.RegisterModelArtifact(ctx, modelArtifactFromProto(req.GetArtifact()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RegisterModelArtifactResponse{Artifact: modelArtifactToProto(out)}, nil
}
