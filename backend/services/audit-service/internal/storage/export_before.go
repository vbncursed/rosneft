package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// ExportBefore streams every entry older than `before` into fn, oldest first.
//
// Streaming rather than returning a slice: the point of the export is a journal
// too large to keep, so materialising it is the one thing the caller cannot
// afford. An error from fn aborts the walk — a truncated archive that looked
// complete would be worse than no archive.
//
// It deletes nothing. Removing rows would need the append-only trigger out of
// the way, and the only way to reclaim space without that is partitioning,
// which this system has deliberately not adopted.
func (r *PG) ExportBefore(ctx context.Context, before time.Time, fn func(domain.Entry) error) error {
	const q = `SELECT ` + entryColumns + ` FROM audit_log WHERE at < $1 ORDER BY id ASC`

	rows, err := r.pool.Query(ctx, q, before)
	if err != nil {
		return fmt.Errorf("storage.ExportBefore: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		e, scanErr := scanEntry(rows)
		if scanErr != nil {
			return fmt.Errorf("storage.ExportBefore: scan: %w", scanErr)
		}
		if err := fn(e); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("storage.ExportBefore: rows: %w", err)
	}
	return nil
}
