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

const createPlacementQuery = `
	WITH w AS (
		INSERT INTO placements AS pl (
			territory_id, model_id,
			position_x, position_y, position_z,
			rotation_x, rotation_y, rotation_z,
			scale_x, scale_y, scale_z,
			label, visible_panorama_ids,
			idempotency_key, batch_index, group_id
		)
		SELECT t.id, m.id,
			$3, $4, $5,
			$6, $7, $8,
			$9, $10, $11,
			$12, COALESCE($13::bigint[], '{}'),
			NULLIF($14::text, ''), CASE WHEN $14::text = '' THEN NULL ELSE $15::int END,
			$16::bigint
		FROM territories t, models m
		WHERE t.slug = $1 AND m.slug = $2
		RETURNING ` + placementWriteReturning + `
	)
	` + placementFromWrite

// CreatePlacement inserts a new placement and returns the row as stored
// (including the assigned ID and timestamps). A missing territory or model
// slug yields a domain not-found error; the scale CHECK constraint becomes
// ErrInvalidInput.
//
// Wrapped in audittx.Run so the audit trigger can attribute the insert.
func (r *PG) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	var out domain.Placement
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		out, err = insertPlacement(ctx, tx, p, "", 0)
		return err
	})
	if err != nil {
		return domain.Placement{}, createPlacementError("storage.CreatePlacement", err)
	}
	return out, nil
}

// createPlacementError keeps a domain refusal bare, so the sentinel's own text
// is what the caller sees, and wraps anything else with op.
func createPlacementError(op string, err error) error {
	if errors.Is(err, domain.ErrTerritoryNotFound) || errors.Is(err, domain.ErrModelNotFound) ||
		errors.Is(err, domain.ErrInvalidInput) || errors.Is(err, domain.ErrIdempotencyConflict) ||
		errors.Is(err, domain.ErrPlacementGroupNotFound) {
		return err
	}
	return fmt.Errorf("%s: %w", op, err)
}

// insertPlacement runs createPlacementQuery for one placement inside tx and
// maps a refusal onto the domain (see missingSide, placementRefusal). A
// non-empty key stamps the row as item index of that keyed batch; an empty one
// leaves both columns NULL.
func insertPlacement(ctx context.Context, tx pgx.Tx, p domain.Placement, key string, index int) (domain.Placement, error) {
	out, err := scanPlacement(tx.QueryRow(ctx, createPlacementQuery,
		p.TerritorySlug, p.ModelSlug,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.Rotation.X, p.Rotation.Y, p.Rotation.Z,
		p.Scale.X, p.Scale.Y, p.Scale.Z,
		p.Label, p.VisiblePanoramaIDs,
		key, index, p.GroupID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Placement{}, missingSide(ctx, tx, p.TerritorySlug)
	}
	return out, placementRefusal(err)
}

// missingSide says which side of the territory/model match found no row. The
// route's gate has already found the territory, so this is almost always the
// model; the one extra query runs on the refusal path only. An empty SELECT
// does not abort tx, so it can still ask.
func missingSide(ctx context.Context, tx pgx.Tx, territorySlug string) error {
	var territoryExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM territories WHERE slug = $1)`,
		territorySlug).Scan(&territoryExists); err != nil {
		return fmt.Errorf("placement insert matched no row: %w", err)
	}
	if territoryExists {
		return domain.ErrModelNotFound
	}
	return domain.ErrTerritoryNotFound
}

// placementRefusal maps the group FK onto ErrPlacementGroupNotFound and the
// scale CHECK onto ErrInvalidInput; any other failure passes through for the
// caller to wrap.
func placementRefusal(err error) error {
	if isGroupFKViolation(err) {
		return domain.ErrPlacementGroupNotFound
	}
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == "23514" && pgErr.ConstraintName == "placements_scale_positive" {
		return fmt.Errorf("%w: scale must be positive", domain.ErrInvalidInput)
	}
	return err
}
