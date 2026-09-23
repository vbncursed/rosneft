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

// batchByKeyQuery also answers the size the batch had when it landed, as far
// as its rows still show it: the highest batch_index + 1.
const batchByKeyQuery = `SELECT ` + placementSelectCols + `, max(pl.batch_index) OVER () + 1
	FROM ` + placementJoin + `
	WHERE t.slug = $1 AND pl.idempotency_key = $2
	ORDER BY pl.batch_index`

// querier is what batchByKey reads through: the create's own transaction, or
// the pool — for PlacementBatch, and once a create has lost a key race and
// rolled back.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// CreatePlacements inserts every placement in one audited transaction and
// answers them in input order. Any failing item rolls the whole batch back, so
// a refused batch leaves nothing behind, and its error is a domain.ItemError
// naming that item.
//
// A non-empty key makes the batch idempotent on its territory: a batch already
// stored under the key is answered as it was stored and nothing is written
// (batchByKey says when it is refused instead). Two requests
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
		out, err = batchByKey(ctx, r.pool, ps[0].TerritorySlug, key, len(ps))
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
		if prior, err := batchByKey(ctx, tx, ps[0].TerritorySlug, key, len(ps)); err != nil || prior != nil {
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

// PlacementBatch reads the batch stored under key on territorySlug, as
// batchByKey answers it for a request of size items. The service asks it
// before validating anything against the territory as it is now.
func (r *PG) PlacementBatch(ctx context.Context, territorySlug, key string, size int) ([]domain.Placement, error) {
	out, err := batchByKey(ctx, r.pool, territorySlug, key, size)
	if err != nil {
		return nil, createPlacementError("storage.PlacementBatch", err)
	}
	return out, nil
}

// batchByKey reads the batch stored under key on territorySlug, in batch
// order, for a request of size items. nil: nothing is stored under the key.
// A batch that landed at another size is ErrIdempotencyConflict. One that
// landed at this size and lost rows since (a gap below its highest index) was
// edited, so what remains is the answer.
//
// ponytail: a batch whose trailing rows were deleted looks intact and smaller,
// so its replay is a conflict; a stored batch_size column would tell the two
// apart if that retry ever matters.
func batchByKey(ctx context.Context, q querier, territorySlug, key string, size int) ([]domain.Placement, error) {
	rows, err := q.Query(ctx, batchByKeyQuery, territorySlug, key)
	if err != nil {
		return nil, fmt.Errorf("read batch by key: %w", err)
	}
	var landed int
	prior, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Placement, error) {
		return scanPlacement(withTrailing{row, []any{&landed}})
	})
	switch {
	case err != nil:
		return nil, fmt.Errorf("read batch by key: %w", err)
	case len(prior) == 0:
		return nil, nil
	case landed != size:
		return nil, domain.ErrIdempotencyConflict
	}
	return prior, nil
}

// withTrailing scans a row into scanPlacement's columns plus the extra ones
// the query appends after them.
type withTrailing struct {
	rowScanner
	extra []any
}

func (w withTrailing) Scan(dst ...any) error { return w.rowScanner.Scan(append(dst, w.extra...)...) }

// isKeyRace reports whether a batch insert lost to a concurrent one under the
// same key.
func isKeyRace(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == keyIndex
}
