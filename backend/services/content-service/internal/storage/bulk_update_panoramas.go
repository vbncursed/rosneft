package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// updatePanoramas runs q, an UPDATE of the panoramas on territory $1 whose ids
// are $2 with the new value $3, in one audited transaction, and rolls it back
// unless it matched every id. ids must be distinct; the service de-duplicates
// them. An id that is unknown or on another territory is ErrPanoramaNotFound
// and nothing changes: the gateway's gate checked the slug only. Each changed
// row is its own journal entry.
func (r *PG) updatePanoramas(ctx context.Context, op, q, territorySlug string, ids []int64, value any) (int, error) {
	var updated int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, q, territorySlug, ids, value)
		if err != nil {
			return err
		}
		updated = tag.RowsAffected()
		if updated != int64(len(ids)) {
			return domain.ErrPanoramaNotFound
		}
		return nil
	})
	switch {
	case err == nil:
		return int(updated), nil
	case errors.Is(err, domain.ErrPanoramaNotFound):
		return 0, err
	}
	return 0, fmt.Errorf("%s: %w", op, err)
}
