package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListDocuments(ctx context.Context, req ListDocumentsRequestObject) (ListDocumentsResponseObject, error) {
	out, err := s.svc.ListDocuments(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return ListDocuments404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListDocuments500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListDocuments200JSONResponse, len(out))
	for i, d := range out {
		resp[i] = documentToAPI(d)
	}
	return resp, nil
}

func (s *Server) CreateDocument(ctx context.Context, req CreateDocumentRequestObject) (CreateDocumentResponseObject, error) {
	if req.Body == nil {
		return CreateDocument400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}}, nil
	}
	body := *req.Body
	d, err := s.svc.CreateDocument(ctx, domain.Document{
		TerritorySlug:  req.Slug,
		Title:          body.Title,
		SourceBlobHash: body.SourceBlobHash,
	})
	switch {
	case isInvalid(err):
		return CreateDocument400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreateDocument404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreateDocument500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return CreateDocument201JSONResponse(documentToAPI(d)), nil
}

func (s *Server) DeleteDocument(ctx context.Context, req DeleteDocumentRequestObject) (DeleteDocumentResponseObject, error) {
	err := s.svc.DeleteDocument(ctx, req.Id)
	switch {
	case isNotFound(err):
		return DeleteDocument404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteDocument500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeleteDocument204Response{}, nil
}
