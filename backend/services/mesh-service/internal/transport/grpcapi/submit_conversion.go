package grpcapi

import (
	"context"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
)

func (s *Server) SubmitConversion(ctx context.Context, req *meshv1.SubmitConversionRequest) (*meshv1.SubmitConversionResponse, error) {
	job, err := s.svc.SubmitConversion(ctx, req.GetProjectSlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &meshv1.SubmitConversionResponse{Job: jobToProto(job)}, nil
}
