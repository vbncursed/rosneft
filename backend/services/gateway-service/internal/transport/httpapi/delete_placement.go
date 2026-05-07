package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) DeletePlacement(ctx context.Context, request DeletePlacementRequestObject) (DeletePlacementResponseObject, error) {
	err := s.svc.DeletePlacement(ctx, request.Id)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return DeletePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrPlacementNotFound):
		return DeletePlacement404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return DeletePlacement500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return DeletePlacement204Response{}, nil
}
