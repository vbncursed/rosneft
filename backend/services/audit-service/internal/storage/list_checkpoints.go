package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// ListCheckpoints returns every checkpoint oldest-first — the order verify has
// to walk to follow the chain. The table gains one row per tick, so a full read
// stays small: at the default five-minute cadence it is roughly 105k rows after
// a year.
func (r *PG) ListCheckpoints(ctx context.Context) ([]domain.Checkpoint, error) {
	const q = `SELECT ` + checkpointColumns + ` FROM audit_checkpoint ORDER BY id ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("storage.ListCheckpoints: %w", err)
	}
	defer rows.Close()

	var out []domain.Checkpoint
	for rows.Next() {
		var c domain.Checkpoint
		if scanErr := rows.Scan(&c.ID, &c.At, &c.FromID, &c.ToID, &c.Watermark,
			&c.RowCount, &c.Digest, &c.PrevDigest); scanErr != nil {
			return nil, fmt.Errorf("storage.ListCheckpoints: scan: %w", scanErr)
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListCheckpoints: rows: %w", err)
	}
	return out, nil
}
