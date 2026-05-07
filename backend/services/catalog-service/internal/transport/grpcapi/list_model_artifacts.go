package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListModelArtifacts(ctx context.Context, req *catalogv1.ListModelArtifactsRequest) (*catalogv1.ListModelArtifactsResponse, error) {
	out, err := s.svc.ListModelArtifacts(ctx, req.GetModelSlug())
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListModelArtifactsResponse{Artifacts: make([]*catalogv1.ModelArtifact, 0, len(out))}
	for _, a := range out {
		resp.Artifacts = append(resp.Artifacts, modelArtifactToProto(a))
	}
	return resp, nil
}
