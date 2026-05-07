package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) GetArtifact(ctx context.Context, request GetArtifactRequestObject) (GetArtifactResponseObject, error) {
	if request.Lod < 0 {
		return GetArtifact400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "lod must be >= 0"}}, nil
	}
	a, err := s.svc.GetArtifact(ctx, request.Slug, uint32(request.Lod))
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return GetArtifact400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrArtifactNotFound):
		return GetArtifact404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return nil, err
	}
	return GetArtifact200JSONResponse(artifactToAPI(a)), nil
}
