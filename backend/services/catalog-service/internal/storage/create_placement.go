package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePlacement inserts a new placement and returns the row as stored
// (including the assigned ID and timestamps). Foreign-key violations on
// parent/asset are translated to ErrProjectNotFound; the no-self-placement
// CHECK constraint becomes ErrSelfPlacement.
func (r *PG) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	const q = `
		WITH inserted AS (
			INSERT INTO placements (
				parent_id, asset_id,
				position_x, position_y, position_z,
				rotation_x, rotation_y, rotation_z,
				scale_x, scale_y, scale_z,
				label
			)
			SELECT pp.id, ap.id,
				$3, $4, $5,
				$6, $7, $8,
				$9, $10, $11,
				$12
			FROM projects pp, projects ap
			WHERE pp.slug = $1 AND ap.slug = $2
			RETURNING id, parent_id, asset_id,
				position_x, position_y, position_z,
				rotation_x, rotation_y, rotation_z,
				scale_x, scale_y, scale_z,
				label, created_at, updated_at
		)
		SELECT i.id, pp.slug, ap.slug,
			i.position_x, i.position_y, i.position_z,
			i.rotation_x, i.rotation_y, i.rotation_z,
			i.scale_x, i.scale_y, i.scale_z,
			i.label, i.created_at, i.updated_at
		FROM inserted i
		JOIN projects pp ON pp.id = i.parent_id
		JOIN projects ap ON ap.id = i.asset_id`

	row := r.pool.QueryRow(ctx, q,
		p.ParentSlug, p.AssetSlug,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.Rotation.X, p.Rotation.Y, p.Rotation.Z,
		p.Scale.X, p.Scale.Y, p.Scale.Z,
		p.Label,
	)
	out, err := scanPlacement(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Either parent or asset slug didn't match — the WITH stage
			// produced no row, so the JOIN found nothing to return.
			return domain.Placement{}, domain.ErrProjectNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" { // check_violation
			switch pgErr.ConstraintName {
			case "placements_no_self":
				return domain.Placement{}, domain.ErrSelfPlacement
			case "placements_scale_positive":
				return domain.Placement{}, fmt.Errorf("storage.CreatePlacement: %w: scale must be positive", domain.ErrInvalidInput)
			}
		}
		return domain.Placement{}, fmt.Errorf("storage.CreatePlacement: %w", err)
	}
	return out, nil
}
