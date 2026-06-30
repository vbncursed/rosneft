package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// forbiddenRoot builds the 403 envelope for a non-Root caller hitting a
// Root-only endpoint.
func forbiddenRoot() ForbiddenJSONResponse {
	return ForbiddenJSONResponse{Code: apperr.SlugForbidden, Message: "root only"}
}

func (s *Server) GetTerritoryAdmins(ctx context.Context, req GetTerritoryAdminsRequestObject) (GetTerritoryAdminsResponseObject, error) {
	if !authhttp.IsOwner(ctx) {
		return GetTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenRoot()}, nil
	}
	ids, err := s.svc.GetTerritoryAdmins(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return GetTerritoryAdmins404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case isInvalid(err):
		return GetTerritoryAdmins404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetTerritoryAdmins500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetTerritoryAdmins200JSONResponse{UserIds: ids}, nil
}

func (s *Server) SetTerritoryAdmins(ctx context.Context, req SetTerritoryAdminsRequestObject) (SetTerritoryAdminsResponseObject, error) {
	if !authhttp.IsOwner(ctx) {
		return SetTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenRoot()}, nil
	}
	if req.Body == nil {
		return SetTerritoryAdmins400JSONResponse{BadRequestJSONResponse: errResp(nil)}, nil
	}
	err := s.svc.SetTerritoryAdmins(ctx, req.Slug, req.Body.UserIds)
	switch {
	case isNotFound(err):
		return SetTerritoryAdmins404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case isInvalid(err):
		return SetTerritoryAdmins400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return SetTerritoryAdmins500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return SetTerritoryAdmins204Response{}, nil
}
