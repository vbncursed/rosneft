package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeleteDocument removes a document by ID. An unknown ID returns
// ErrDocumentNotFound so the service layer can surface it as 404. The blob is
// left in BlobStore (content-addressed, possibly shared).
//
// Wrapped in audittx.Run so the audit trigger can attribute the delete — the
// row is gone afterwards, so its snapshot in the journal is the only record of
// what the document was.
func (r *PG) DeleteDocument(ctx context.Context, id int64) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `DELETE FROM territory_documents WHERE id = $1`, id)
		if execErr != nil {
			return execErr
		}
		affected = tag.RowsAffected()
		return nil
	})
	if err != nil {
		return fmt.Errorf("storage.DeleteDocument: %w", err)
	}
	if affected == 0 {
		return domain.ErrDocumentNotFound
	}
	return nil
}
