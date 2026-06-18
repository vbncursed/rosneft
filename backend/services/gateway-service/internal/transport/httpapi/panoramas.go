package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListPanoramas(ctx context.Context, req ListPanoramasRequestObject) (ListPanoramasResponseObject, error) {
	out, err := s.svc.ListPanoramas(ctx, req.Slug)
	switch {
	case isInvalid(err):
		return ListPanoramas500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	case isNotFound(err):
		return ListPanoramas404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListPanoramas500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListPanoramas200JSONResponse, len(out))
	for i, p := range out {
		resp[i] = panoramaToAPI(p)
	}
	return resp, nil
}

func (s *Server) CreatePanorama(ctx context.Context, req CreatePanoramaRequestObject) (CreatePanoramaResponseObject, error) {
	if req.Body == nil {
		return CreatePanorama400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "missing body"}}, nil
	}
	body := *req.Body
	var yawOffset float64
	if body.YawOffset != nil {
		yawOffset = *body.YawOffset
	}
	p, err := s.svc.CreatePanorama(ctx, domain.Panorama{
		TerritorySlug: req.Slug,
		// Slug intentionally omitted — the catalog derives it from the title.
		Title:          body.Title,
		SourceBlobHash: body.SourceBlobHash,
		Position:       vec3PtrFromAPI(body.Position),
		YawOffset:      yawOffset,
	})
	switch {
	case isInvalid(err):
		return CreatePanorama400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreatePanorama404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreatePanorama500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return CreatePanorama201JSONResponse(panoramaToAPI(p)), nil
}

func (s *Server) UpdatePanorama(ctx context.Context, req UpdatePanoramaRequestObject) (UpdatePanoramaResponseObject, error) {
	if req.Body == nil {
		return UpdatePanorama400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "missing body"}}, nil
	}
	body := *req.Body
	title := ""
	if body.Title != nil {
		title = *body.Title
	}
	var yawOffset float64
	if body.YawOffset != nil {
		yawOffset = *body.YawOffset
	}
	p, err := s.svc.UpdatePanorama(ctx, domain.Panorama{
		ID:        req.Id,
		Title:     title,
		Position:  vec3PtrFromAPI(body.Position),
		YawOffset: yawOffset,
	})
	switch {
	case isInvalid(err):
		return UpdatePanorama400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return UpdatePanorama404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return UpdatePanorama500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return UpdatePanorama200JSONResponse(panoramaToAPI(p)), nil
}

func (s *Server) DeletePanorama(ctx context.Context, req DeletePanoramaRequestObject) (DeletePanoramaResponseObject, error) {
	err := s.svc.DeletePanorama(ctx, req.Id)
	switch {
	case isNotFound(err):
		return DeletePanorama404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeletePanorama500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeletePanorama204Response{}, nil
}
