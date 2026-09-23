package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// keyIndex is the unique index over (territory_id, idempotency_key,
// batch_index) — migration 00018.
const keyIndex = "placements_idempotency_key"

const batchByKeyQuery = `SELECT ` + placementSelectCols + `
	FROM ` + placementJoin + `
	WHERE t.slug = $1 AND pl.idempotency_key = $2
	ORDER BY pl.batch_index`

// querier is what batchByKey reads through: the create's own transaction, or
// the pool once that transaction has lost a key race and rolled back.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// CreatePlacements inserts every placement in one audited transaction and
// answers them in input order. Any failing item rolls the whole batch back, so
// a refused batch leaves nothing behind, and its error is a domain.ItemError
// naming that item.
//
// A non-empty key makes the batch idempotent on its territory: a batch already
// stored under the key is answered as it was stored and nothing is written,
// or refused with ErrIdempotencyConflict when its size differs. Two requests
// racing on one key collide on keyIndex; the loser rolls back and answers the
// winner's rows.
//
// ponytail: one statement per item inside the transaction; a pgx.Batch would
// save round trips if batches ever approach the 100 cap in practice.
func (r *PG) CreatePlacements(ctx context.Context, key string, ps []domain.Placement) ([]domain.Placement, error) {
	if len(ps) == 0 {
		return []domain.Placement{}, nil
	}
	var out []domain.Placement
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		out, err = createBatch(ctx, tx, key, ps)
		return err
	})
	if isKeyRace(err) {
		out, err = batchByKey(ctx, r.pool, key, ps)
		if err == nil && out == nil {
			err = errors.New("the batch that won the key race is gone")
		}
	}
	if err != nil {
		return nil, createPlacementError("storage.CreatePlacements", err)
	}
	return out, nil
}

// createBatch answers the batch key already names, or inserts ps under key.
func createBatch(ctx context.Context, tx pgx.Tx, key string, ps []domain.Placement) ([]domain.Placement, error) {
	if key != "" {
		if prior, err := batchByKey(ctx, tx, key, ps); err != nil || prior != nil {
			return prior, err
		}
	}
	out := make([]domain.Placement, 0, len(ps))
	for i, p := range ps {
		created, err := insertPlacement(ctx, tx, p, key, i)
		if err != nil {
			return nil, domain.ItemError{Index: i, Err: err}
		}
		out = append(out, created)
	}
	return out, nil
}

// batchByKey reads the batch stored under key on ps's territory, in batch
// order: nil when there is none, ErrIdempotencyConflict when its size is not
// len(ps).
func batchByKey(ctx context.Context, q querier, key string, ps []domain.Placement) ([]domain.Placement, error) {
	rows, err := q.Query(ctx, batchByKeyQuery, ps[0].TerritorySlug, key)
	if err != nil {
		return nil, fmt.Errorf("read batch by key: %w", err)
	}
	prior, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Placement, error) {
		return scanPlacement(row)
	})
	switch {
	case err != nil:
		return nil, fmt.Errorf("read batch by key: %w", err)
	case len(prior) == 0:
		return nil, nil
	case len(prior) != len(ps):
		return nil, domain.ErrIdempotencyConflict
	}
	return prior, nil
}

// isKeyRace reports whether a batch insert lost to a concurrent one under the
// same key.
func isKeyRace(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == keyIndex
}
