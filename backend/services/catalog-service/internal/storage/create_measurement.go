package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateMeasurement inserts a chain on m.TerritorySlug. created_by is the
// request's actor (the gateway's session user id, carried in gRPC metadata),
// NULL for a write with none. An unknown territory is ErrTerritoryNotFound;
// the points CHECK is ErrInvalidInput.
//
// Wrapped in audittx.Run so the audit trigger can attribute the insert.
func (r *PG) CreateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	q := `
		WITH m AS (
			INSERT INTO measurements AS m (territory_id, points, closed, created_by)
			SELECT t.id, $2, $3, NULLIF($4, '')::uuid
			FROM territories t
			WHERE t.slug = $1
			RETURNING ` + measurementReturning + `
		)
		SELECT ` + measurementCols + `
		FROM m JOIN territories t ON t.id = m.territory_id`

	actorID := grpcutil.ActorFromContext(ctx).ID
	var out domain.Measurement
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var scanErr error
		out, scanErr = scanMeasurement(tx.QueryRow(ctx, q,
			m.TerritorySlug, domain.FlattenPoints(m.Points), m.Closed, actorID))
		return scanErr
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.Measurement{}, domain.ErrTerritoryNotFound
	case isMeasurementShapeViolation(err):
		return domain.Measurement{}, fmt.Errorf("storage.CreateMeasurement: %w: points do not form a chain", domain.ErrInvalidInput)
	default:
		return domain.Measurement{}, fmt.Errorf("storage.CreateMeasurement: %w", err)
	}
}
