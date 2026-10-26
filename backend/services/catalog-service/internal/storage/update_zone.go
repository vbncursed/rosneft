package storage

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateZone retitles zone id on territorySlug when p.Title is set and replaces
// its tags when p.SetTags is, in one transaction. The statement is scoped to
// the slug, so a zone of another territory is ErrZoneNotFound exactly like an
// unknown id. A title another zone there already has, or a tag slug naming no
// tag, is ErrInvalidInput and changes nothing.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) UpdateZone(ctx context.Context, territorySlug string, id int64, p domain.ZonePatch) (domain.Zone, error) {
	const q = `
		UPDATE site_zones z SET title = COALESCE($3::text, z.title), updated_at = NOW()
		FROM territories t
		WHERE z.id = $2 AND z.territory_id = t.id AND t.slug = $1
		RETURNING z.id`

	var out domain.Zone
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, q, territorySlug, id, p.Title).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrZoneNotFound
		} else if err != nil {
			return err
		}
		if p.SetTags {
			if err := setZoneTags(ctx, tx, id, p.TagSlugs); err != nil {
				return err
			}
		}
		var err error
		out, err = zoneByID(ctx, tx, territorySlug, id)
		return err
	})
	if err != nil {
		return domain.Zone{}, zoneWriteError("UpdateZone", err)
	}
	return out, nil
}
