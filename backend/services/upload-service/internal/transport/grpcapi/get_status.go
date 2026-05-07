package grpcapi

import (
	"context"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

func (s *Server) GetStatus(ctx context.Context, req *uploadv1.GetStatusRequest) (*uploadv1.GetStatusResponse, error) {
	out, err := s.svc.GetStatus(ctx, req.GetUploadId())
	if err != nil {
		return nil, mapError(err)
	}
	return &uploadv1.GetStatusResponse{Offset: out.Offset, Size: out.Size}, nil
}
