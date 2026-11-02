package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// lockDocument takes a row lock on the document and returns
// ErrDocumentNotFound unless it sits on territorySlug — an unknown id and an
// id of another territory are indistinguishable to the caller. The lock
// serialises concurrent writes to one document's calibration.
func lockDocument(ctx context.Context, tx pgx.Tx, territorySlug string, id int64) error {
	var one int
	err := tx.QueryRow(ctx, `
		SELECT 1 FROM territory_documents d
		JOIN territories t ON t.id = d.territory_id
		WHERE d.id = $2 AND t.slug = $1
		FOR UPDATE OF d`, territorySlug, id).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrDocumentNotFound
	}
	if err != nil {
		return fmt.Errorf("lock document: %w", err)
	}
	return nil
}
