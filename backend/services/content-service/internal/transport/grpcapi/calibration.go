package grpcapi

import (
	"context"
	"fmt"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

func (s *Server) PutDocumentCalibration(
	ctx context.Context,
	req *contentv1.PutDocumentCalibrationRequest,
) (*contentv1.PutDocumentCalibrationResponse, error) {
	c, err := calibrationFromProto(req.GetCalibration())
	if err != nil {
		return nil, mapError(err)
	}
	out, err := s.svc.PutCalibration(ctx, req.GetTerritorySlug(), req.GetDocumentId(), c)
	if err != nil {
		return nil, mapError(err)
	}
	return &contentv1.PutDocumentCalibrationResponse{Calibration: calibrationToProto(&out)}, nil
}

func (s *Server) DeleteDocumentCalibration(
	ctx context.Context,
	req *contentv1.DeleteDocumentCalibrationRequest,
) (*contentv1.DeleteDocumentCalibrationResponse, error) {
	if err := s.svc.DeleteCalibration(ctx, req.GetTerritorySlug(), req.GetDocumentId()); err != nil {
		return nil, mapError(err)
	}
	return &contentv1.DeleteDocumentCalibrationResponse{}, nil
}

// calibrationFromProto refuses a point carrying only one of utm_e / utm_n.
func calibrationFromProto(c *contentv1.Calibration) (domain.Calibration, error) {
	out := domain.Calibration{Page: int(c.GetPage()), Points: make([]domain.CalibrationPoint, 0, len(c.GetPoints()))}
	for i, p := range c.GetPoints() {
		pt := domain.CalibrationPoint{
			PDFX: p.GetPdfX(), PDFY: p.GetPdfY(),
			Scene: domain.Vec3{X: p.GetSceneX(), Y: p.GetSceneY(), Z: p.GetSceneZ()},
		}
		if p.UtmE != nil != (p.UtmN != nil) {
			return domain.Calibration{}, fmt.Errorf(
				"%w: calibration point %d needs utm_e and utm_n together or neither",
				domain.ErrInvalidInput,
				i,
			)
		}
		if p.UtmE != nil {
			pt.UTM = &domain.UTM{E: p.GetUtmE(), N: p.GetUtmN()}
		}
		out.Points = append(out.Points, pt)
	}
	return out, nil
}

// calibrationToProto answers nil (an absent field) for an uncalibrated document.
func calibrationToProto(c *domain.Calibration) *contentv1.Calibration {
	if c == nil {
		return nil
	}
	pts := make([]*contentv1.CalibrationPoint, len(c.Points))
	for i, p := range c.Points {
		pts[i] = &contentv1.CalibrationPoint{
			PdfX: p.PDFX, PdfY: p.PDFY,
			SceneX: p.Scene.X, SceneY: p.Scene.Y, SceneZ: p.Scene.Z,
		}
		if p.UTM != nil {
			pts[i].UtmE, pts[i].UtmN = &p.UTM.E, &p.UTM.N
		}
	}
	return &contentv1.Calibration{Page: int32(c.Page), Points: pts}
}
