package storage

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateZone adds a zone to territorySlug with its tags, in one transaction. An
// unknown territory is ErrTerritoryNotFound; a tag slug naming no tag, or a
// title another zone there already has (case and blanks aside), is
// ErrInvalidInput. The author is the request's actor, NULL when there is none.
//
// Wrapped in audittx.Run so the audit trigger can attribute the inserts.
func (r *PG) CreateZone(ctx context.Context, territorySlug string, z domain.ZoneCreate) (domain.Zone, error) {
	const q = `
		INSERT INTO site_zones (territory_id, title, points, drawing_width_m, drawing_height_m, created_by)
		SELECT t.id, $2, $3, $4, $5, NULLIF($6, '')::uuid FROM territories t WHERE t.slug = $1
		RETURNING id`

	actorID := grpcutil.ActorFromContext(ctx).ID
	var out domain.Zone
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var id int64
		err := tx.QueryRow(ctx, q, territorySlug, z.Title, domain.FlattenPoints(z.Corners[:]),
			z.DrawingWidthM, z.DrawingHeightM, actorID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrTerritoryNotFound
		}
		if err != nil {
			return err
		}
		if err := setZoneTags(ctx, tx, id, z.TagSlugs); err != nil {
			return err
		}
		out, err = zoneByID(ctx, tx, territorySlug, id)
		return err
	})
	if err != nil {
		return domain.Zone{}, zoneWriteError("CreateZone", err)
	}
	return out, nil
}
