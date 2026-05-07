package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetArtifact(ctx context.Context, req *catalogv1.GetArtifactRequest) (*catalogv1.GetArtifactResponse, error) {
	a, err := s.svc.GetArtifact(ctx, req.GetProjectSlug(), req.GetLod())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetArtifactResponse{Artifact: artifactToProto(a)}, nil
}
