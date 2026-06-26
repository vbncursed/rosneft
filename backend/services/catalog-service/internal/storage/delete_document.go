package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteDocument removes a document by ID. An unknown ID returns
// ErrDocumentNotFound so the service layer can surface it as 404. The blob is
// left in BlobStore (content-addressed, possibly shared).
func (r *PG) DeleteDocument(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM territory_documents WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage.DeleteDocument: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrDocumentNotFound
	}
	return nil
}
