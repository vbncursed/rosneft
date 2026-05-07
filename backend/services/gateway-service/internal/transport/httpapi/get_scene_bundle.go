package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) GetSceneBundle(ctx context.Context, request GetSceneBundleRequestObject) (GetSceneBundleResponseObject, error) {
	bundle, err := s.svc.GetSceneBundle(ctx, request.Slug)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return GetSceneBundle400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrProjectNotFound):
		return GetSceneBundle404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return GetSceneBundle500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return GetSceneBundle200JSONResponse(sceneBundleToAPI(bundle)), nil
}
