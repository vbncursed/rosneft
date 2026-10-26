package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// ListModelTags needs only a session: the tag list is the same for everyone.
func (s *Server) ListModelTags(ctx context.Context, _ ListModelTagsRequestObject) (ListModelTagsResponseObject, error) {
	out, err := s.svc.ListModelTags(ctx)
	if err != nil {
		return ListModelTags500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return ListModelTags200JSONResponse(modelTagsToAPI(out)), nil
}

// CreateModelTag and UpdateModelTag are model:write routes (routePerms); the
// catalog validates the slug and title and answers the refusal in its words.
func (s *Server) CreateModelTag(ctx context.Context, req CreateModelTagRequestObject) (CreateModelTagResponseObject, error) {
	if req.Body == nil {
		return CreateModelTag400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	tag, err := s.svc.CreateModelTag(ctx, req.Body.Slug, req.Body.Title)
	switch {
	case isInvalid(err):
		return CreateModelTag400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return CreateModelTag500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return CreateModelTag201JSONResponse(modelTagToAPI(tag)), nil
}

func (s *Server) UpdateModelTag(ctx context.Context, req UpdateModelTagRequestObject) (UpdateModelTagResponseObject, error) {
	if req.Body == nil {
		return UpdateModelTag400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	tag, err := s.svc.UpdateModelTag(ctx, req.Slug, req.Body.Title)
	switch {
	case isInvalid(err):
		return UpdateModelTag400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return UpdateModelTag404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return UpdateModelTag500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return UpdateModelTag200JSONResponse(modelTagToAPI(tag)), nil
}
