package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateMeasurement replaces a chain's points and closed flag. The statement
// is scoped to m.TerritorySlug, so an id from another territory is
// ErrMeasurementNotFound exactly like an unknown id — the gateway's territory
// gate checks only the slug in the URL.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) UpdateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	q := `
		WITH m AS (
			UPDATE measurements m SET points = $3, closed = $4, updated_at = NOW()
			FROM territories t
			WHERE m.id = $2 AND m.territory_id = t.id AND t.slug = $1
			RETURNING ` + measurementReturning + `
		)
		SELECT ` + measurementCols + `
		FROM m JOIN territories t ON t.id = m.territory_id`

	var out domain.Measurement
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var scanErr error
		out, scanErr = scanMeasurement(tx.QueryRow(ctx, q,
			m.TerritorySlug, m.ID, domain.FlattenPoints(m.Points), m.Closed))
		return scanErr
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.Measurement{}, domain.ErrMeasurementNotFound
	case isMeasurementShapeViolation(err):
		return domain.Measurement{}, fmt.Errorf("storage.UpdateMeasurement: %w: points do not form a chain", domain.ErrInvalidInput)
	default:
		return domain.Measurement{}, fmt.Errorf("storage.UpdateMeasurement: %w", err)
	}
}
