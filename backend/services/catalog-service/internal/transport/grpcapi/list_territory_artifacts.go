package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListTerritoryArtifacts(ctx context.Context, req *catalogv1.ListTerritoryArtifactsRequest) (*catalogv1.ListTerritoryArtifactsResponse, error) {
	out, err := s.svc.ListTerritoryArtifacts(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListTerritoryArtifactsResponse{Artifacts: make([]*catalogv1.TerritoryArtifact, 0, len(out))}
	for _, a := range out {
		resp.Artifacts = append(resp.Artifacts, territoryArtifactToProto(a))
	}
	return resp, nil
}
