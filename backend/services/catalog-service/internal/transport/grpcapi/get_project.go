package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetProject(ctx context.Context, req *catalogv1.GetProjectRequest) (*catalogv1.GetProjectResponse, error) {
	p, err := s.svc.GetProject(ctx, req.GetSlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetProjectResponse{Project: projectToProto(p)}, nil
}
