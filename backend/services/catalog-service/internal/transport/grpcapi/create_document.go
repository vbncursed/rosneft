package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreateDocument(ctx context.Context, req *catalogv1.CreateDocumentRequest) (*catalogv1.CreateDocumentResponse, error) {
	out, err := s.svc.CreateDocument(ctx, domain.Document{
		TerritorySlug:  req.GetTerritorySlug(),
		Title:          req.GetTitle(),
		SourceBlobHash: req.GetSourceBlobHash(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreateDocumentResponse{Document: documentToProto(out)}, nil
}
