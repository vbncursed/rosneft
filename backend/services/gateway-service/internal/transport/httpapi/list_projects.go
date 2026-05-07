package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListProjects(ctx context.Context, request ListProjectsRequestObject) (ListProjectsResponseObject, error) {
	limit := int32(0)
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	cursor := ""
	if request.Params.Cursor != nil {
		cursor = *request.Params.Cursor
	}

	page, err := s.svc.ListProjectsPage(ctx, limit, cursor)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return ListProjects400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return ListProjects500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}

	resp := ListProjects200JSONResponse{Body: projectsToAPI(page.Items)}
	if page.NextCursor != "" {
		c := page.NextCursor
		resp.Headers.XNextCursor = &c
	}
	return resp, nil
}
