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
// (including the assigned ID and timestamps). A missing territory or model
// slug yields a domain not-found error; the scale CHECK constraint becomes
// ErrInvalidInput.
func (r *PG) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	const q = `
		WITH inserted AS (
			INSERT INTO placements (
				territory_id, model_id,
				position_x, position_y, position_z,
				rotation_x, rotation_y, rotation_z,
				scale_x, scale_y, scale_z,
				label
			)
			SELECT t.id, m.id,
				$3, $4, $5,
				$6, $7, $8,
				$9, $10, $11,
				$12
			FROM territories t, models m
			WHERE t.slug = $1 AND m.slug = $2
			RETURNING id, territory_id, model_id,
				position_x, position_y, position_z,
				rotation_x, rotation_y, rotation_z,
				scale_x, scale_y, scale_z,
				label, created_at, updated_at
		)
		SELECT i.id, t.slug, m.slug,
			i.position_x, i.position_y, i.position_z,
			i.rotation_x, i.rotation_y, i.rotation_z,
			i.scale_x, i.scale_y, i.scale_z,
			i.label, i.created_at, i.updated_at
		FROM inserted i
		JOIN territories t ON t.id = i.territory_id
		JOIN models m      ON m.id = i.model_id`

	row := r.pool.QueryRow(ctx, q,
		p.TerritorySlug, p.ModelSlug,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.Rotation.X, p.Rotation.Y, p.Rotation.Z,
		p.Scale.X, p.Scale.Y, p.Scale.Z,
		p.Label,
	)
	out, err := scanPlacement(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// One side of the WHERE didn't match — caller has to figure out
			// which by re-checking, but the not-found signal is enough for
			// transport to map to 404.
			return domain.Placement{}, domain.ErrTerritoryNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" && pgErr.ConstraintName == "placements_scale_positive" {
			return domain.Placement{}, fmt.Errorf("storage.CreatePlacement: %w: scale must be positive", domain.ErrInvalidInput)
		}
		return domain.Placement{}, fmt.Errorf("storage.CreatePlacement: %w", err)
	}
	return out, nil
}
