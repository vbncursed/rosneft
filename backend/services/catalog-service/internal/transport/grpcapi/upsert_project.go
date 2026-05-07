package grpcapi

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) UpsertProject(ctx context.Context, req *catalogv1.UpsertProjectRequest) (*catalogv1.UpsertProjectResponse, error) {
	in := req.GetProject()
	if in == nil {
		return nil, status.Error(codes.InvalidArgument, "project is required")
	}
	p, err := s.svc.UpsertProject(ctx, projectFromProto(in))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpsertProjectResponse{Project: projectToProto(p)}, nil
}
