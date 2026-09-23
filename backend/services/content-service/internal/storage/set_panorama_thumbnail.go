package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
)

// SetPanoramaThumbnail records the thumbnail made for panorama id.
//
// It writes only a row that still has none, so a backfill racing a create
// never replaces a hash. A deleted row matches nothing, which is not an error.
// updated_at is left alone: the thumbnail is derived from the source, not an
// edit anyone made, and the SPA re-keys the anchor card on it.
//
// It is wrapped in audittx.Run like every write to panoramas. The backfill has
// no actor, so the journal records a system change.
func (r *PG) SetPanoramaThumbnail(ctx context.Context, id int64, hash string) error {
	const q = `UPDATE panoramas SET thumbnail_blob_hash = $2 WHERE id = $1 AND thumbnail_blob_hash = ''`
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, q, id, hash)
		return err
	})
	if err != nil {
		return fmt.Errorf("storage.SetPanoramaThumbnail: %w", err)
	}
	return nil
}
