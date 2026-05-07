package httpapi

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) UpdatePlacement(ctx context.Context, request UpdatePlacementRequestObject) (UpdatePlacementResponseObject, error) {
	if request.Body == nil {
		err := fmt.Errorf("%w: request body is required", domain.ErrInvalidInput)
		return UpdatePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	out, err := s.svc.UpdatePlacement(ctx, domain.Placement{
		ID:       request.Id,
		Position: vec3FromAPIPtr(request.Body.Position),
		Rotation: vec3FromAPIPtr(request.Body.Rotation),
		Scale:    vec3FromAPIPtr(request.Body.Scale),
		Label:    stringFromPtr(request.Body.Label),
	})
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return UpdatePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrPlacementNotFound):
		return UpdatePlacement404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return UpdatePlacement500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return UpdatePlacement200JSONResponse(placementToAPI(out)), nil
}
