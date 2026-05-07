package grpcapi

import (
	"context"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

func (s *Server) Initiate(ctx context.Context, req *uploadv1.InitiateRequest) (*uploadv1.InitiateResponse, error) {
	out, err := s.svc.Initiate(ctx, req.GetSize(), req.GetContentType())
	if err != nil {
		return nil, mapError(err)
	}
	return &uploadv1.InitiateResponse{UploadId: out.ID}, nil
}
