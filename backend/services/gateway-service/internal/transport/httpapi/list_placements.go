package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListPlacements(ctx context.Context, request ListPlacementsRequestObject) (ListPlacementsResponseObject, error) {
	items, err := s.svc.ListPlacements(ctx, request.Slug)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return ListPlacements400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrProjectNotFound):
		return ListPlacements404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return ListPlacements500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return ListPlacements200JSONResponse(placementsToAPI(items)), nil
}
