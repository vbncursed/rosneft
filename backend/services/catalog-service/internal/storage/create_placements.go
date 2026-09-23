package storage

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePlacements inserts every placement in one audited transaction and
// answers them in input order. Any failing item rolls the whole batch back, so
// a refused batch leaves nothing behind.
//
// ponytail: one statement per item inside the transaction; a pgx.Batch would
// save round trips if batches ever approach the 100 cap in practice.
func (r *PG) CreatePlacements(ctx context.Context, ps []domain.Placement) ([]domain.Placement, error) {
	out := make([]domain.Placement, 0, len(ps))
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		for _, p := range ps {
			created, err := insertPlacement(ctx, tx, p)
			if err != nil {
				return err
			}
			out = append(out, created)
		}
		return nil
	})
	if err != nil {
		return nil, createPlacementError("storage.CreatePlacements", err)
	}
	return out, nil
}
