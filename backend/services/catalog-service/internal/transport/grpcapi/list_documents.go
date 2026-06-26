package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListDocuments(ctx context.Context, req *catalogv1.ListDocumentsRequest) (*catalogv1.ListDocumentsResponse, error) {
	items, err := s.svc.ListDocuments(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Document, len(items))
	for i, d := range items {
		out[i] = documentToProto(d)
	}
	return &catalogv1.ListDocumentsResponse{Documents: out}, nil
}
