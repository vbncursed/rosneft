package grpcapi

import (
	"context"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
)

func (s *Server) GetJob(ctx context.Context, req *meshv1.GetJobRequest) (*meshv1.GetJobResponse, error) {
	job, err := s.svc.GetJob(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return &meshv1.GetJobResponse{Job: jobToProto(job)}, nil
}
