package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
)

// DeleteDocumentCalibration drops the document's points. A document without
// any is not an error; one not on territorySlug is ErrDocumentNotFound.
func (r *PG) DeleteDocumentCalibration(ctx context.Context, territorySlug string, documentID int64) error {
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		if err := lockDocument(ctx, tx, territorySlug, documentID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM document_calibration_points WHERE document_id = $1`, documentID)
		return err
	})
	if err != nil {
		return fmt.Errorf("storage.DeleteDocumentCalibration: %w", err)
	}
	return nil
}
