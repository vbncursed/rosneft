package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// PutDocumentCalibration replaces a document's calibration. Content checks the
// page and point rules and scopes the document by territory slug.
func (g *Gateway) PutDocumentCalibration(ctx context.Context, territorySlug string, id int64, c domain.Calibration) (domain.Calibration, error) {
	if err := checkAddress(territorySlug, id); err != nil {
		return domain.Calibration{}, err
	}
	return g.content.PutDocumentCalibration(ctx, territorySlug, id, c)
}

// DeleteDocumentCalibration removes a document's calibration.
func (g *Gateway) DeleteDocumentCalibration(ctx context.Context, territorySlug string, id int64) error {
	if err := checkAddress(territorySlug, id); err != nil {
		return err
	}
	return g.content.DeleteDocumentCalibration(ctx, territorySlug, id)
}
