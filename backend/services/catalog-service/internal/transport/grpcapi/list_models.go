package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListModels(ctx context.Context, _ *catalogv1.ListModelsRequest) (*catalogv1.ListModelsResponse, error) {
	out, err := s.svc.ListModels(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListModelsResponse{Models: make([]*catalogv1.Model, 0, len(out))}
	for _, m := range out {
		resp.Models = append(resp.Models, modelToProto(m))
	}
	return resp, nil
}
