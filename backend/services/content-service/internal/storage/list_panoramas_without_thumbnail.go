package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// ListPanoramasWithoutThumbnail returns every panorama on any territory whose
// thumbnail has not been made yet, oldest first. It is the startup backfill's
// work list and crosses territories on purpose: no caller is behind it, and it
// hands nothing back to a reader.
func (r *PG) ListPanoramasWithoutThumbnail(ctx context.Context) ([]domain.Panorama, error) {
	const q = `SELECT ` + panoramaSelectCols + `
		FROM ` + panoramaJoin + `
		WHERE pa.thumbnail_blob_hash = ''
		ORDER BY pa.id`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPanoramasWithoutThumbnail: query: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Panorama, error) {
		return scanPanorama(row)
	})
	if err != nil {
		return nil, fmt.Errorf("storage.ListPanoramasWithoutThumbnail: scan: %w", err)
	}
	return out, nil
}
