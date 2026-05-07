package httpapi

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) CreatePlacement(ctx context.Context, request CreatePlacementRequestObject) (CreatePlacementResponseObject, error) {
	if request.Body == nil {
		err := fmt.Errorf("%w: request body is required", domain.ErrInvalidInput)
		return CreatePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	out, err := s.svc.CreatePlacement(ctx, domain.Placement{
		ParentSlug: request.Slug,
		AssetSlug:  request.Body.AssetSlug,
		Position:   vec3FromAPIPtr(request.Body.Position),
		Rotation:   vec3FromAPIPtr(request.Body.Rotation),
		Scale:      vec3FromAPIPtr(request.Body.Scale),
		Label:      stringFromPtr(request.Body.Label),
	})
	switch {
	case errors.Is(err, domain.ErrSelfPlacement),
		errors.Is(err, domain.ErrInvalidInput):
		return CreatePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrProjectNotFound):
		return CreatePlacement404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return CreatePlacement500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return CreatePlacement201JSONResponse(placementToAPI(out)), nil
}
