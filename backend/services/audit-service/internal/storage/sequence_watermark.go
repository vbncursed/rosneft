package storage

import (
	"context"
	"fmt"
)

// SequenceWatermark reports the last id handed out by audit_log's sequence.
//
// This is the one value that sees ids belonging to transactions that have not
// committed: the sequence advances at INSERT time, not at COMMIT. A watermark
// read one tick ago is therefore the point past which every id is settled,
// which is exactly what a digest boundary has to be. max(id) cannot serve —
// it skips a row an in-flight transaction is holding, and that row later lands
// inside an already-digested range.
//
// coalesce covers a sequence that has never been used: pg_sequence_last_value
// returns NULL until the first nextval.
func (r *PG) SequenceWatermark(ctx context.Context) (int64, error) {
	const q = `SELECT coalesce(pg_sequence_last_value('audit_log_id_seq'), 0)`

	var w int64
	if err := r.pool.QueryRow(ctx, q).Scan(&w); err != nil {
		return 0, fmt.Errorf("storage.SequenceWatermark: %w", err)
	}
	return w, nil
}
