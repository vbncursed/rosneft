package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) GetProject(ctx context.Context, request GetProjectRequestObject) (GetProjectResponseObject, error) {
	p, err := s.svc.GetProject(ctx, request.Slug)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return GetProject400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrProjectNotFound):
		return GetProject404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return GetProject500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return GetProject200JSONResponse(projectToAPI(p)), nil
}
