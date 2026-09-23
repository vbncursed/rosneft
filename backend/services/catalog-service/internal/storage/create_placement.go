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
	WITH inserted AS (
		INSERT INTO placements (
			territory_id, model_id,
			position_x, position_y, position_z,
			rotation_x, rotation_y, rotation_z,
			scale_x, scale_y, scale_z,
			label, visible_panorama_ids
		)
		SELECT t.id, m.id,
			$3, $4, $5,
			$6, $7, $8,
			$9, $10, $11,
			$12, COALESCE($13::bigint[], '{}')
		FROM territories t, models m
		WHERE t.slug = $1 AND m.slug = $2
		RETURNING id, territory_id, model_id,
			position_x, position_y, position_z,
			rotation_x, rotation_y, rotation_z,
			scale_x, scale_y, scale_z,
			label, created_at, updated_at, visible_panorama_ids
	)
	SELECT i.id, t.slug, m.slug,
		i.position_x, i.position_y, i.position_z,
		i.rotation_x, i.rotation_y, i.rotation_z,
		i.scale_x, i.scale_y, i.scale_z,
		i.label, i.created_at, i.updated_at, i.visible_panorama_ids
	FROM inserted i
	JOIN territories t ON t.id = i.territory_id
	JOIN models m      ON m.id = i.model_id`

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
		out, err = insertPlacement(ctx, tx, p)
		return err
	})
	if err != nil {
		return domain.Placement{}, createPlacementError("storage.CreatePlacement", err)
	}
	return out, nil
}

// insertPlacement runs createPlacementQuery for one placement inside tx.
func insertPlacement(ctx context.Context, tx pgx.Tx, p domain.Placement) (domain.Placement, error) {
	return scanPlacement(tx.QueryRow(ctx, createPlacementQuery,
		p.TerritorySlug, p.ModelSlug,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.Rotation.X, p.Rotation.Y, p.Rotation.Z,
		p.Scale.X, p.Scale.Y, p.Scale.Z,
		p.Label, p.VisiblePanoramaIDs,
	))
}

// createPlacementError maps an insert failure onto the domain. No row means one
// side of the territory/model WHERE did not match; the not-found signal is
// enough for transport to answer 404.
func createPlacementError(op string, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrTerritoryNotFound
	}
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == "23514" && pgErr.ConstraintName == "placements_scale_positive" {
		return fmt.Errorf("%s: %w: scale must be positive", op, domain.ErrInvalidInput)
	}
	return fmt.Errorf("%s: %w", op, err)
}
