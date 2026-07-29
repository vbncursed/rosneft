package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ComputeDigest folds every audit_log row in (fromID, boundary] into one
// SHA-256, prefixed with the previous checkpoint's digest so the chain cannot
// be re-cut at a different place.
//
// The whole fold happens in Postgres: shipping rows to Go would move bytes for
// no reason and would make the result depend on Go's JSON encoder instead of
// the storage format.
//
// SET LOCAL timezone = 'UTC' is not optional. jsonb renders timestamptz in the
// session's zone, and this project's containers run Europe/Moscow, so without
// it the digest would stop reproducing the moment anything ran elsewhere.
// to_jsonb sorts keys, so column order in the table does not leak in either.
//
// toID comes back as max(id) inside the range rather than the boundary itself:
// nothing can appear past the boundary any more, and a tighter range is cheaper
// to recompute. On an empty range it falls back to fromID so consecutive
// checkpoints stay contiguous and verify never sees a hole.
func (r *PG) ComputeDigest(
	ctx context.Context, fromID, boundary int64, prev string,
) (rowCount int32, toID int64, digest string, err error) {
	const q = `
		SELECT count(*)::int,
		       coalesce(max(l.id), $1),
		       encode(digest($3 || coalesce(string_agg(to_jsonb(l.*)::text, E'\n' ORDER BY l.id), ''),
		                     'sha256'), 'hex')
		FROM audit_log l
		WHERE l.id > $1 AND l.id <= $2`

	err = pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, txErr := tx.Exec(ctx, `SET LOCAL timezone = 'UTC'`); txErr != nil {
			return fmt.Errorf("pin timezone: %w", txErr)
		}
		return tx.QueryRow(ctx, q, fromID, boundary, prev).Scan(&rowCount, &toID, &digest)
	})
	if err != nil {
		return 0, 0, "", fmt.Errorf("storage.ComputeDigest: %w", err)
	}
	return rowCount, toID, digest, nil
}
