package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListPlacements(ctx context.Context, req ListPlacementsRequestObject) (ListPlacementsResponseObject, error) {
	out, err := s.svc.ListPlacements(ctx, req.Slug)
	switch {
	case isInvalid(err):
		return ListPlacements500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	case isNotFound(err):
		return ListPlacements404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListPlacements500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListPlacements200JSONResponse, len(out))
	for i, p := range out {
		resp[i] = placementToAPI(p)
	}
	return resp, nil
}

func (s *Server) CreatePlacement(ctx context.Context, req CreatePlacementRequestObject) (CreatePlacementResponseObject, error) {
	if req.Body == nil {
		return CreatePlacement400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	p, err := s.svc.CreatePlacement(ctx, placementFromCreate(req.Slug, *req.Body))
	switch {
	case isInvalid(err):
		return CreatePlacement400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreatePlacement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreatePlacement500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return CreatePlacement201JSONResponse(placementToAPI(p)), nil
}

func (s *Server) CreatePlacements(ctx context.Context, req CreatePlacementsRequestObject) (CreatePlacementsResponseObject, error) {
	if req.Body == nil {
		return CreatePlacements400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	items := make([]domain.Placement, len(req.Body.Items))
	for i, it := range req.Body.Items {
		items[i] = placementFromCreate(req.Slug, it)
	}
	out, err := s.svc.CreatePlacements(ctx, req.Slug, items)
	switch {
	case isInvalid(err):
		return CreatePlacements400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreatePlacements404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreatePlacements500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(CreatePlacements201JSONResponse, len(out))
	for i, p := range out {
		resp[i] = placementToAPI(p)
	}
	return resp, nil
}

func (s *Server) UpdatePlacement(ctx context.Context, req UpdatePlacementRequestObject) (UpdatePlacementResponseObject, error) {
	if req.Body == nil {
		return UpdatePlacement400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	body := *req.Body
	label := ""
	if body.Label != nil {
		label = *body.Label
	}
	p, err := s.svc.UpdatePlacement(ctx, domain.Placement{
		ID:            req.Id,
		TerritorySlug: req.Slug,
		Position:      vec3PtrFromAPI(body.Position),
		Rotation:      vec3PtrFromAPI(body.Rotation),
		Scale:         vec3PtrFromAPI(body.Scale),
		Label:         label,
	})
	switch {
	case isInvalid(err):
		return UpdatePlacement400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return UpdatePlacement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return UpdatePlacement500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return UpdatePlacement200JSONResponse(placementToAPI(p)), nil
}

func (s *Server) SetPlacementVisibility(ctx context.Context, req SetPlacementVisibilityRequestObject) (SetPlacementVisibilityResponseObject, error) {
	if req.Body == nil {
		return SetPlacementVisibility400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	p, err := s.svc.SetPlacementVisibility(ctx, req.Slug, req.Id, req.Body.PanoramaIds)
	switch {
	case isInvalid(err):
		return SetPlacementVisibility400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return SetPlacementVisibility404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return SetPlacementVisibility500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return SetPlacementVisibility200JSONResponse(placementToAPI(p)), nil
}

func (s *Server) DeletePlacement(ctx context.Context, req DeletePlacementRequestObject) (DeletePlacementResponseObject, error) {
	err := s.svc.DeletePlacement(ctx, req.Slug, req.Id)
	switch {
	case isNotFound(err):
		return DeletePlacement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeletePlacement500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeletePlacement204Response{}, nil
}
