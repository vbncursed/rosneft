package httpapi

import (
	"context"

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
		return CreatePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "missing body"}}, nil
	}
	body := *req.Body
	label := ""
	if body.Label != nil {
		label = *body.Label
	}
	p, err := s.svc.CreatePlacement(ctx, domain.Placement{
		TerritorySlug: req.Slug,
		ModelSlug:     body.ModelSlug,
		Position:      vec3PtrFromAPI(body.Position),
		Rotation:      vec3PtrFromAPI(body.Rotation),
		Scale:         vec3PtrFromAPI(body.Scale),
		Label:         label,
	})
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

func (s *Server) UpdatePlacement(ctx context.Context, req UpdatePlacementRequestObject) (UpdatePlacementResponseObject, error) {
	if req.Body == nil {
		return UpdatePlacement400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "missing body"}}, nil
	}
	body := *req.Body
	label := ""
	if body.Label != nil {
		label = *body.Label
	}
	p, err := s.svc.UpdatePlacement(ctx, domain.Placement{
		ID:       req.Id,
		Position: vec3PtrFromAPI(body.Position),
		Rotation: vec3PtrFromAPI(body.Rotation),
		Scale:    vec3PtrFromAPI(body.Scale),
		Label:    label,
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

func (s *Server) DeletePlacement(ctx context.Context, req DeletePlacementRequestObject) (DeletePlacementResponseObject, error) {
	err := s.svc.DeletePlacement(ctx, req.Id)
	switch {
	case isNotFound(err):
		return DeletePlacement404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeletePlacement500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeletePlacement204Response{}, nil
}
