package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListProjects(ctx context.Context, _ *catalogv1.ListProjectsRequest) (*catalogv1.ListProjectsResponse, error) {
	projects, err := s.svc.ListProjects(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Project, len(projects))
	for i, p := range projects {
		out[i] = projectToProto(p)
	}
	return &catalogv1.ListProjectsResponse{Projects: out}, nil
}
