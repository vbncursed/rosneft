package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// checkpointColumns is the projection every checkpoint scan expects, in order.
const checkpointColumns = `id, at, from_id, to_id, watermark, row_count, digest, prev_digest`

// LastCheckpoint returns the newest checkpoint. The bool is false on a journal
// that has never been checkpointed — the caller seeds one rather than treating
// it as an error.
func (r *PG) LastCheckpoint(ctx context.Context) (domain.Checkpoint, bool, error) {
	const q = `SELECT ` + checkpointColumns + ` FROM audit_checkpoint ORDER BY id DESC LIMIT 1`

	var c domain.Checkpoint
	err := r.pool.QueryRow(ctx, q).Scan(&c.ID, &c.At, &c.FromID, &c.ToID,
		&c.Watermark, &c.RowCount, &c.Digest, &c.PrevDigest)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Checkpoint{}, false, nil
	}
	if err != nil {
		return domain.Checkpoint{}, false, fmt.Errorf("storage.LastCheckpoint: %w", err)
	}
	return c, true, nil
}
