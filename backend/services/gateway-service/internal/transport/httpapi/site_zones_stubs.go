package httpapi

import (
	"context"
	"errors"
)

// errNotImplemented is what every site-zones route answers until Task 6 wires
// it: a 500 with the generic body, the cause on the request's log line.
var errNotImplemented = errors.New("site zones: not implemented")

// shortcut: stub until Task 6
func (s *Server) ListModelTags(ctx context.Context, _ ListModelTagsRequestObject) (ListModelTagsResponseObject, error) {
	return ListModelTags500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}

// shortcut: stub until Task 6
func (s *Server) ListZones(ctx context.Context, _ ListZonesRequestObject) (ListZonesResponseObject, error) {
	return ListZones500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}

// shortcut: stub until Task 6
func (s *Server) CreateZone(ctx context.Context, _ CreateZoneRequestObject) (CreateZoneResponseObject, error) {
	return CreateZone500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}

// shortcut: stub until Task 6
func (s *Server) UpdateZone(ctx context.Context, _ UpdateZoneRequestObject) (UpdateZoneResponseObject, error) {
	return UpdateZone500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}

// shortcut: stub until Task 6
func (s *Server) DeleteZone(ctx context.Context, _ DeleteZoneRequestObject) (DeleteZoneResponseObject, error) {
	return DeleteZone500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}

// shortcut: stub until Task 6
func (s *Server) PutDocumentCalibration(ctx context.Context, _ PutDocumentCalibrationRequestObject) (PutDocumentCalibrationResponseObject, error) {
	return PutDocumentCalibration500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}

// shortcut: stub until Task 6
func (s *Server) DeleteDocumentCalibration(ctx context.Context, _ DeleteDocumentCalibrationRequestObject) (DeleteDocumentCalibrationResponseObject, error) {
	return DeleteDocumentCalibration500JSONResponse{InternalJSONResponse: internalResp(ctx, errNotImplemented)}, nil
}
