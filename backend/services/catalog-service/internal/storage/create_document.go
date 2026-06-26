package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateDocument inserts a new document. A missing territory slug yields
// ErrTerritoryNotFound.
func (r *PG) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	const q = `
		WITH inserted AS (
			INSERT INTO territory_documents (territory_id, title, source_blob_hash)
			SELECT t.id, $2, $3
			FROM territories t
			WHERE t.slug = $1
			RETURNING id, territory_id, title, source_blob_hash, created_at
		)
		SELECT i.id, t.slug, i.title, i.source_blob_hash, i.created_at
		FROM inserted i
		JOIN territories t ON t.id = i.territory_id`

	row := r.pool.QueryRow(ctx, q, d.TerritorySlug, d.Title, d.SourceBlobHash)
	out, err := scanDocument(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Document{}, domain.ErrTerritoryNotFound
		}
		return domain.Document{}, fmt.Errorf("storage.CreateDocument: %w", err)
	}
	return out, nil
}
