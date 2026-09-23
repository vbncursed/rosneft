package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// Every measurement handler passes req.Slug down: the territory gate authorised
// that slug only, and catalog scopes each id by it.

func (s *Server) ListMeasurements(ctx context.Context, req ListMeasurementsRequestObject) (ListMeasurementsResponseObject, error) {
	out, err := s.svc.ListMeasurements(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return ListMeasurements404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListMeasurements500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return ListMeasurements200JSONResponse(measurementsToAPI(out)), nil
}

func (s *Server) CreateMeasurement(ctx context.Context, req CreateMeasurementRequestObject) (CreateMeasurementResponseObject, error) {
	if req.Body == nil {
		return CreateMeasurement400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	m, err := s.svc.CreateMeasurement(ctx, measurementFromAPI(req.Slug, 0, *req.Body))
	switch {
	case isInvalid(err):
		return CreateMeasurement400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreateMeasurement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreateMeasurement500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return CreateMeasurement201JSONResponse(measurementToAPI(m)), nil
}

func (s *Server) UpdateMeasurement(ctx context.Context, req UpdateMeasurementRequestObject) (UpdateMeasurementResponseObject, error) {
	if req.Body == nil {
		return UpdateMeasurement400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	m, err := s.svc.UpdateMeasurement(ctx, measurementFromAPI(req.Slug, req.Id, *req.Body))
	switch {
	case isInvalid(err):
		return UpdateMeasurement400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return UpdateMeasurement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return UpdateMeasurement500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return UpdateMeasurement200JSONResponse(measurementToAPI(m)), nil
}

func (s *Server) DeleteMeasurement(ctx context.Context, req DeleteMeasurementRequestObject) (DeleteMeasurementResponseObject, error) {
	err := s.svc.DeleteMeasurement(ctx, req.Slug, req.Id)
	switch {
	case isInvalid(err):
		return DeleteMeasurement400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return DeleteMeasurement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteMeasurement500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return DeleteMeasurement204Response{}, nil
}

func (s *Server) DeleteMeasurements(ctx context.Context, req DeleteMeasurementsRequestObject) (DeleteMeasurementsResponseObject, error) {
	n, err := s.svc.DeleteMeasurements(ctx, req.Slug)
	switch {
	case isInvalid(err):
		return DeleteMeasurements400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return DeleteMeasurements404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteMeasurements500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return DeleteMeasurements200JSONResponse{Deleted: n}, nil
}
