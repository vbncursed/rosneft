package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// PutDocumentCalibration replaces the document's whole point set in one
// transaction, numbering the points 0..n-1 in the order given. A document not
// on territorySlug is ErrDocumentNotFound.
func (r *PG) PutDocumentCalibration(
	ctx context.Context,
	territorySlug string,
	documentID int64,
	c domain.Calibration,
) (domain.Calibration, error) {
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		if err := lockDocument(ctx, tx, territorySlug, documentID); err != nil {
			return err
		}
		if _, err := tx.Exec(
			ctx,
			`DELETE FROM document_calibration_points WHERE document_id = $1`,
			documentID,
		); err != nil {
			return err
		}
		return insertCalibrationPoints(ctx, tx, documentID, c)
	})
	if err != nil {
		return domain.Calibration{}, fmt.Errorf("storage.PutDocumentCalibration: %w", err)
	}
	return c, nil
}

func insertCalibrationPoints(ctx context.Context, tx pgx.Tx, documentID int64, c domain.Calibration) error {
	const q = `
		INSERT INTO document_calibration_points
			(document_id, idx, page, pdf_x, pdf_y, scene_x, scene_y, scene_z, utm_e, utm_n)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
	var batch pgx.Batch
	for i, p := range c.Points {
		var utmE, utmN *float64
		if p.UTM != nil {
			utmE, utmN = &p.UTM.E, &p.UTM.N
		}
		batch.Queue(q, documentID, i, c.Page, p.PDFX, p.PDFY, p.Scene.X, p.Scene.Y, p.Scene.Z, utmE, utmN)
	}
	return tx.SendBatch(ctx, &batch).Close()
}
