package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// Every handler here passes req.Slug down: the territory gate authorised that
// slug only, and the catalog scopes every id, placement or group, by it.

func (s *Server) SetPlacementsHidden(ctx context.Context, req SetPlacementsHiddenRequestObject) (SetPlacementsHiddenResponseObject, error) {
	if req.Body == nil {
		return SetPlacementsHidden400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	n, err := s.svc.SetPlacementsHidden(ctx, req.Slug, req.Body.Ids, req.Body.Hidden)
	switch {
	case isInvalid(err):
		return SetPlacementsHidden400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return SetPlacementsHidden404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return SetPlacementsHidden500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return SetPlacementsHidden200JSONResponse{Updated: n}, nil
}

func (s *Server) SetPlacementsGroup(ctx context.Context, req SetPlacementsGroupRequestObject) (SetPlacementsGroupResponseObject, error) {
	if req.Body == nil {
		return SetPlacementsGroup400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	n, err := s.svc.SetPlacementsGroup(ctx, req.Slug, req.Body.Ids, req.Body.GroupId)
	switch {
	case isInvalid(err):
		return SetPlacementsGroup400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return SetPlacementsGroup404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return SetPlacementsGroup500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return SetPlacementsGroup200JSONResponse{Updated: n}, nil
}

func (s *Server) CreatePlacementGroup(ctx context.Context, req CreatePlacementGroupRequestObject) (CreatePlacementGroupResponseObject, error) {
	if req.Body == nil {
		return CreatePlacementGroup400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	g, err := s.svc.CreatePlacementGroup(ctx, req.Slug, req.Body.Title)
	switch {
	case isInvalid(err):
		return CreatePlacementGroup400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreatePlacementGroup404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreatePlacementGroup500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return CreatePlacementGroup201JSONResponse(placementGroupToAPI(g)), nil
}

func (s *Server) UpdatePlacementGroup(ctx context.Context, req UpdatePlacementGroupRequestObject) (UpdatePlacementGroupResponseObject, error) {
	if req.Body == nil {
		return UpdatePlacementGroup400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	g, err := s.svc.RenamePlacementGroup(ctx, req.Slug, req.Id, req.Body.Title)
	switch {
	case isInvalid(err):
		return UpdatePlacementGroup400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return UpdatePlacementGroup404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return UpdatePlacementGroup500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return UpdatePlacementGroup200JSONResponse(placementGroupToAPI(g)), nil
}

func (s *Server) DeletePlacementGroup(ctx context.Context, req DeletePlacementGroupRequestObject) (DeletePlacementGroupResponseObject, error) {
	err := s.svc.DeletePlacementGroup(ctx, req.Slug, req.Id)
	switch {
	case isInvalid(err):
		return DeletePlacementGroup400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return DeletePlacementGroup404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeletePlacementGroup500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return DeletePlacementGroup204Response{}, nil
}
