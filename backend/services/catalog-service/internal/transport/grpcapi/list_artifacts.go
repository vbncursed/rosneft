package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListArtifacts(ctx context.Context, req *catalogv1.ListArtifactsRequest) (*catalogv1.ListArtifactsResponse, error) {
	items, err := s.svc.ListArtifacts(ctx, req.GetProjectSlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Artifact, len(items))
	for i, a := range items {
		out[i] = artifactToProto(a)
	}
	return &catalogv1.ListArtifactsResponse{Artifacts: out}, nil
}
