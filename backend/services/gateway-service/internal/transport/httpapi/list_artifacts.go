package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListArtifacts(ctx context.Context, request ListArtifactsRequestObject) (ListArtifactsResponseObject, error) {
	items, err := s.svc.ListArtifacts(ctx, request.Slug)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return ListArtifacts400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return ListArtifacts500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return ListArtifacts200JSONResponse(artifactsToAPI(items)), nil
}
