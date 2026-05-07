package httpapi

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) GetJob(ctx context.Context, request GetJobRequestObject) (GetJobResponseObject, error) {
	job, err := s.svc.GetJob(ctx, request.Id)
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return GetJob400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case errors.Is(err, domain.ErrJobNotFound):
		return GetJob404JSONResponse{NotFoundJSONResponse: NotFoundJSONResponse{Code: codeOf(err), Message: err.Error()}}, nil
	case err != nil:
		return nil, err
	}
	return GetJob200JSONResponse(jobToAPI(job)), nil
}
