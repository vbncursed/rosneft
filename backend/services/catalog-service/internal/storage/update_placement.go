package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdatePlacement replaces the placement's transform and label and bumps
// updated_at. Returns ErrPlacementNotFound for unknown IDs.
func (r *PG) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	const q = `
		WITH updated AS (
			UPDATE placements SET
				position_x = $2, position_y = $3, position_z = $4,
				rotation_x = $5, rotation_y = $6, rotation_z = $7,
				scale_x    = $8, scale_y    = $9, scale_z    = $10,
				label      = $11,
				updated_at = NOW()
			WHERE id = $1
			RETURNING id, territory_id, model_id,
				position_x, position_y, position_z,
				rotation_x, rotation_y, rotation_z,
				scale_x, scale_y, scale_z,
				label, created_at, updated_at, visible_panorama_ids
		)
		SELECT u.id, t.slug, m.slug,
			u.position_x, u.position_y, u.position_z,
			u.rotation_x, u.rotation_y, u.rotation_z,
			u.scale_x, u.scale_y, u.scale_z,
			u.label, u.created_at, u.updated_at, u.visible_panorama_ids
		FROM updated u
		JOIN territories t ON t.id = u.territory_id
		JOIN models m      ON m.id = u.model_id`

	row := r.pool.QueryRow(ctx, q,
		p.ID,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.Rotation.X, p.Rotation.Y, p.Rotation.Z,
		p.Scale.X, p.Scale.Y, p.Scale.Z,
		p.Label,
	)
	out, err := scanPlacement(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Placement{}, domain.ErrPlacementNotFound
		}
		if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == "23514" && pgErr.ConstraintName == "placements_scale_positive" {
			return domain.Placement{}, fmt.Errorf("storage.UpdatePlacement: %w: scale must be positive", domain.ErrInvalidInput)
		}
		return domain.Placement{}, fmt.Errorf("storage.UpdatePlacement: %w", err)
	}
	return out, nil
}
