package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Both handlers pass req.Slug down: the territory gate authorised that slug
// only, and content scopes the document id by it.

func (s *Server) PutDocumentCalibration(
	ctx context.Context,
	req PutDocumentCalibrationRequestObject,
) (PutDocumentCalibrationResponseObject, error) {
	if req.Body == nil {
		return PutDocumentCalibration400JSONResponse{
			BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"},
		}, nil
	}
	c, err := s.svc.PutDocumentCalibration(ctx, req.Slug, req.Id, calibrationFromAPI(*req.Body))
	switch {
	case isInvalid(err):
		return PutDocumentCalibration400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return PutDocumentCalibration404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return PutDocumentCalibration500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return PutDocumentCalibration200JSONResponse(*calibrationToAPI(&c)), nil
}

func (s *Server) DeleteDocumentCalibration(
	ctx context.Context,
	req DeleteDocumentCalibrationRequestObject,
) (DeleteDocumentCalibrationResponseObject, error) {
	err := s.svc.DeleteDocumentCalibration(ctx, req.Slug, req.Id)
	switch {
	case isInvalid(err):
		return DeleteDocumentCalibration400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return DeleteDocumentCalibration404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteDocumentCalibration500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return DeleteDocumentCalibration204Response{}, nil
}

// calibrationToAPI answers nil for a document without one: the Document field
// is required and null then.
func calibrationToAPI(c *domain.Calibration) *Calibration {
	if c == nil {
		return nil
	}
	pts := make([]CalibrationPoint, len(c.Points))
	for i, p := range c.Points {
		pts[i] = CalibrationPoint{Pdf: Vec2{X: p.PDF.X, Y: p.PDF.Y}, Scene: vec3ToAPI(p.Scene)}
		if p.UTM != nil {
			pts[i].Utm = &UtmPoint{E: p.UTM.E, N: p.UTM.N}
		}
	}
	return &Calibration{Page: c.Page, Points: pts}
}

func calibrationFromAPI(c Calibration) domain.Calibration {
	pts := make([]domain.CalibrationPoint, len(c.Points))
	for i, p := range c.Points {
		pts[i] = domain.CalibrationPoint{PDF: domain.Vec2{X: p.Pdf.X, Y: p.Pdf.Y}, Scene: vec3FromAPI(p.Scene)}
		if p.Utm != nil {
			pts[i].UTM = &domain.UTM{E: p.Utm.E, N: p.Utm.N}
		}
	}
	return domain.Calibration{Page: c.Page, Points: pts}
}
