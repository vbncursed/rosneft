package grpcapi

import (
	"context"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

func (s *Server) Abort(ctx context.Context, req *uploadv1.AbortRequest) (*uploadv1.AbortResponse, error) {
	if err := s.svc.Abort(ctx, req.GetUploadId()); err != nil {
		return nil, mapError(err)
	}
	return &uploadv1.AbortResponse{}, nil
}
