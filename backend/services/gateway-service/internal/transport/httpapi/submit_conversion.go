package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) SubmitConversion(ctx context.Context, request SubmitConversionRequestObject) (SubmitConversionResponseObject, error) {
	job, err := s.svc.SubmitConversion(ctx, request.Slug)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return SubmitConversion400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return SubmitConversion500JSONResponse{InternalJSONResponse: InternalJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	}
	return SubmitConversion202JSONResponse(jobToAPI(job)), nil
}
