package grpcapi

import (
	"context"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

func (s *Server) HasUploaded(ctx context.Context, req *uploadv1.HasUploadedRequest) (*uploadv1.HasUploadedResponse, error) {
	ok, err := s.svc.HasUploaded(ctx, callerID(ctx), req.GetBlobHash())
	if err != nil {
		return nil, mapError(err)
	}
	return &uploadv1.HasUploadedResponse{Uploaded: ok}, nil
}
