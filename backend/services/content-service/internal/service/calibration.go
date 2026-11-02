package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// PutCalibration replaces a document's calibration points. A document on
// another territory is ErrDocumentNotFound, same as an unknown id.
func (c *Content) PutCalibration(
	ctx context.Context,
	territorySlug string,
	docID int64,
	cal domain.Calibration,
) (domain.Calibration, error) {
	if err := requireDocument(territorySlug, docID); err != nil {
		return domain.Calibration{}, fmt.Errorf("service.PutCalibration: %w", err)
	}
	if err := cal.Validate(); err != nil {
		return domain.Calibration{}, fmt.Errorf("service.PutCalibration: %w", err)
	}
	return c.repo.PutDocumentCalibration(ctx, territorySlug, docID, cal)
}

// DeleteCalibration removes a document's calibration. A document without one
// is not an error; an unknown or foreign document is ErrDocumentNotFound.
func (c *Content) DeleteCalibration(ctx context.Context, territorySlug string, docID int64) error {
	if err := requireDocument(territorySlug, docID); err != nil {
		return fmt.Errorf("service.DeleteCalibration: %w", err)
	}
	return c.repo.DeleteDocumentCalibration(ctx, territorySlug, docID)
}

func requireDocument(territorySlug string, docID int64) error {
	if territorySlug == "" {
		return fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if docID <= 0 {
		return fmt.Errorf("%w: document id is required", domain.ErrInvalidInput)
	}
	return nil
}
