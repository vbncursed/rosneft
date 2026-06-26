package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteDocument(ctx context.Context, req *catalogv1.DeleteDocumentRequest) (*catalogv1.DeleteDocumentResponse, error) {
	if err := s.svc.DeleteDocument(ctx, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteDocumentResponse{}, nil
}
