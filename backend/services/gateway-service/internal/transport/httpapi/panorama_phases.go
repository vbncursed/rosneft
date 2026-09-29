package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Every handler here passes req.Slug down: the territory gate authorised that
// slug only, and content scopes every panorama id and phase flag by it. The
// phase travels as the string it arrived as; the service refuses anything but
// the three.

func (s *Server) SetPanoramasHidden(ctx context.Context, req SetPanoramasHiddenRequestObject) (SetPanoramasHiddenResponseObject, error) {
	if req.Body == nil {
		return SetPanoramasHidden400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	n, err := s.svc.SetPanoramasHidden(ctx, req.Slug, req.Body.Ids, req.Body.Hidden)
	switch {
	case isInvalid(err):
		return SetPanoramasHidden400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return SetPanoramasHidden404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return SetPanoramasHidden500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return SetPanoramasHidden200JSONResponse{Updated: n}, nil
}

func (s *Server) SetPanoramasPhase(ctx context.Context, req SetPanoramasPhaseRequestObject) (SetPanoramasPhaseResponseObject, error) {
	if req.Body == nil {
		return SetPanoramasPhase400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	n, err := s.svc.SetPanoramasPhase(ctx, req.Slug, req.Body.Ids, string(req.Body.Phase))
	switch {
	case isInvalid(err):
		return SetPanoramasPhase400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return SetPanoramasPhase404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return SetPanoramasPhase500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return SetPanoramasPhase200JSONResponse{Updated: n}, nil
}

func (s *Server) SetPanoramaPhaseHidden(ctx context.Context, req SetPanoramaPhaseHiddenRequestObject) (SetPanoramaPhaseHiddenResponseObject, error) {
	if req.Body == nil {
		return SetPanoramaPhaseHidden400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	p, err := s.svc.SetPanoramaPhaseHidden(ctx, req.Slug, string(req.Phase), req.Body.Hidden)
	switch {
	case isInvalid(err):
		return SetPanoramaPhaseHidden400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return SetPanoramaPhaseHidden404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return SetPanoramaPhaseHidden500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return SetPanoramaPhaseHidden200JSONResponse(panoramaPhaseToAPI(p)), nil
}

func panoramaPhaseToAPI(p domain.PanoramaPhase) PanoramaPhase {
	return PanoramaPhase{Phase: PanoramaPhaseName(p.Phase), Hidden: p.Hidden}
}

// panoramaPhasesToAPI always returns a slice, never nil: the list is required
// in the bundle.
func panoramaPhasesToAPI(in []domain.PanoramaPhase) []PanoramaPhase {
	out := make([]PanoramaPhase, len(in))
	for i, p := range in {
		out[i] = panoramaPhaseToAPI(p)
	}
	return out
}
