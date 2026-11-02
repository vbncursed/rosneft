package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// Every zone handler passes req.Slug down: the territory gate authorised that
// slug only, and catalog scopes each zone id by it.

func (s *Server) ListZones(ctx context.Context, req ListZonesRequestObject) (ListZonesResponseObject, error) {
	out, err := s.svc.ListZones(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return ListZones404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListZones500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return ListZones200JSONResponse(zonesToAPI(out)), nil
}

func (s *Server) CreateZone(ctx context.Context, req CreateZoneRequestObject) (CreateZoneResponseObject, error) {
	if req.Body == nil {
		return CreateZone400JSONResponse{
			BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"},
		}, nil
	}
	z, err := s.svc.CreateZone(ctx, req.Slug, zoneCreateFromAPI(*req.Body))
	switch {
	case isInvalid(err):
		return CreateZone400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreateZone404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreateZone500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return CreateZone201JSONResponse(zoneToAPI(z)), nil
}

func (s *Server) UpdateZone(ctx context.Context, req UpdateZoneRequestObject) (UpdateZoneResponseObject, error) {
	if req.Body == nil {
		return UpdateZone400JSONResponse{
			BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"},
		}, nil
	}
	z, err := s.svc.UpdateZone(ctx, req.Slug, req.Id, zonePatchFromAPI(*req.Body))
	switch {
	case isInvalid(err):
		return UpdateZone400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return UpdateZone404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return UpdateZone500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return UpdateZone200JSONResponse(zoneToAPI(z)), nil
}

func (s *Server) DeleteZone(ctx context.Context, req DeleteZoneRequestObject) (DeleteZoneResponseObject, error) {
	err := s.svc.DeleteZone(ctx, req.Slug, req.Id)
	switch {
	case isInvalid(err):
		return DeleteZone400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return DeleteZone404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteZone500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return DeleteZone204Response{}, nil
}
