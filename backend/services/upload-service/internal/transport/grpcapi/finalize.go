package grpcapi

import (
	"context"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

func (s *Server) Finalize(ctx context.Context, req *uploadv1.FinalizeRequest) (*uploadv1.FinalizeResponse, error) {
	out, err := s.svc.Finalize(ctx, req.GetUploadId())
	if err != nil {
		return nil, mapError(err)
	}
	return &uploadv1.FinalizeResponse{BlobHash: out.Hash, Size: out.Size}, nil
}
