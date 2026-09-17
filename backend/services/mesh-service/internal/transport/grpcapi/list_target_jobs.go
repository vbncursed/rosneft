package grpcapi

import (
	"context"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
)

// ListTargetJobs returns the latest job of every target, whatever its status
// — the console's "what is converting" read.
func (s *Server) ListTargetJobs(ctx context.Context, _ *meshv1.ListTargetJobsRequest) (*meshv1.ListTargetJobsResponse, error) {
	jobs, err := s.svc.ListTargetJobs(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*meshv1.Job, len(jobs))
	for i, j := range jobs {
		out[i] = jobToProto(j)
	}
	return &meshv1.ListTargetJobsResponse{Jobs: out}, nil
}
