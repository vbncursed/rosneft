package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// SaveCheckpoint appends one checkpoint and returns it with the server-assigned
// id and timestamp filled in.
func (r *PG) SaveCheckpoint(ctx context.Context, c domain.Checkpoint) (domain.Checkpoint, error) {
	const q = `
		INSERT INTO audit_checkpoint (from_id, to_id, watermark, row_count, digest, prev_digest)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, at`

	err := r.pool.QueryRow(ctx, q, c.FromID, c.ToID, c.Watermark, c.RowCount, c.Digest, c.PrevDigest).
		Scan(&c.ID, &c.At)
	if err != nil {
		return domain.Checkpoint{}, fmt.Errorf("storage.SaveCheckpoint: %w", err)
	}
	return c, nil
}
