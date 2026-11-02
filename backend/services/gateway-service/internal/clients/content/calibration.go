package content

import (
	"context"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// PutDocumentCalibration replaces the whole point set of document id on
// territorySlug and answers what was stored.
func (c *Client) PutDocumentCalibration(
	ctx context.Context,
	territorySlug string,
	id int64,
	cal domain.Calibration,
) (domain.Calibration, error) {
	resp, err := c.cc.PutDocumentCalibration(ctx, &contentv1.PutDocumentCalibrationRequest{
		TerritorySlug: territorySlug,
		DocumentId:    id,
		Calibration:   calibrationToProto(cal),
	})
	if err != nil {
		return domain.Calibration{}, calibrationRefusal("content.PutDocumentCalibration", err)
	}
	if out := calibrationFromProto(resp.GetCalibration()); out != nil {
		return *out, nil
	}
	return domain.Calibration{}, nil
}

// DeleteDocumentCalibration removes the calibration of document id on territorySlug.
func (c *Client) DeleteDocumentCalibration(ctx context.Context, territorySlug string, id int64) error {
	_, err := c.cc.DeleteDocumentCalibration(ctx, &contentv1.DeleteDocumentCalibrationRequest{
		TerritorySlug: territorySlug, DocumentId: id,
	})
	if err != nil {
		return calibrationRefusal("content.DeleteDocumentCalibration", err)
	}
	return nil
}

// calibrationRefusal maps a failed calibration write; content answers a
// foreign document exactly like an unknown one.
func calibrationRefusal(op string, err error) error {
	return grpcerr.Refused(op, err, domain.ErrDocumentNotFound, domain.ErrTerritoryNotFound)
}

func calibrationToProto(c domain.Calibration) *contentv1.Calibration {
	pts := make([]*contentv1.CalibrationPoint, len(c.Points))
	for i, p := range c.Points {
		pts[i] = &contentv1.CalibrationPoint{
			PdfX: p.PDF.X, PdfY: p.PDF.Y,
			SceneX: p.Scene.X, SceneY: p.Scene.Y, SceneZ: p.Scene.Z,
		}
		if p.UTM != nil {
			pts[i].UtmE, pts[i].UtmN = &p.UTM.E, &p.UTM.N
		}
	}
	return &contentv1.Calibration{Page: c.Page, Points: pts}
}

// calibrationFromProto answers nil for an uncalibrated document. A point with
// only one of utm_e / utm_n has no UTM: content never stores half a pair.
func calibrationFromProto(c *contentv1.Calibration) *domain.Calibration {
	if c == nil {
		return nil
	}
	pts := make([]domain.CalibrationPoint, len(c.GetPoints()))
	for i, p := range c.GetPoints() {
		pts[i] = domain.CalibrationPoint{
			PDF:   domain.Vec2{X: p.GetPdfX(), Y: p.GetPdfY()},
			Scene: domain.Vec3{X: p.GetSceneX(), Y: p.GetSceneY(), Z: p.GetSceneZ()},
		}
		if p.UtmE != nil && p.UtmN != nil {
			pts[i].UTM = &domain.UTM{E: p.GetUtmE(), N: p.GetUtmN()}
		}
	}
	return &domain.Calibration{Page: c.GetPage(), Points: pts}
}
