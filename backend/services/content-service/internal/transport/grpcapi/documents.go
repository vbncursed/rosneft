package grpcapi

import (
	"context"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

func (s *Server) ListDocuments(ctx context.Context, req *contentv1.ListDocumentsRequest) (*contentv1.ListDocumentsResponse, error) {
	items, err := s.svc.ListDocuments(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*contentv1.Document, len(items))
	for i, d := range items {
		out[i] = documentToProto(d)
	}
	return &contentv1.ListDocumentsResponse{Documents: out}, nil
}

func (s *Server) CreateDocument(ctx context.Context, req *contentv1.CreateDocumentRequest) (*contentv1.CreateDocumentResponse, error) {
	out, err := s.svc.CreateDocument(ctx, domain.Document{
		TerritorySlug:  req.GetTerritorySlug(),
		Title:          req.GetTitle(),
		SourceBlobHash: req.GetSourceBlobHash(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &contentv1.CreateDocumentResponse{Document: documentToProto(out)}, nil
}

func (s *Server) DeleteDocument(ctx context.Context, req *contentv1.DeleteDocumentRequest) (*contentv1.DeleteDocumentResponse, error) {
	if err := s.svc.DeleteDocument(ctx, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &contentv1.DeleteDocumentResponse{}, nil
}
