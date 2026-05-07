package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetModelArtifact(ctx context.Context, req *catalogv1.GetModelArtifactRequest) (*catalogv1.GetModelArtifactResponse, error) {
	a, err := s.svc.GetModelArtifact(ctx, req.GetModelSlug(), req.GetLod())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetModelArtifactResponse{Artifact: modelArtifactToProto(a)}, nil
}
