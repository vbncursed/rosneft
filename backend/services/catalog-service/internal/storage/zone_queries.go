package storage

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// zoneCols reads a zone aliased z. The tags come from a second query
// (attachZoneTags), so a zone is never fanned out into one row per tag.
const zoneCols = `z.id, z.title, z.points, z.drawing_width_m, z.drawing_height_m, z.created_at, z.updated_at`

const zoneFrom = `FROM site_zones z JOIN territories t ON t.id = z.territory_id `

func scanZone(r rowScanner) (domain.Zone, error) {
	var z domain.Zone
	var flat []float64
	if err := r.Scan(
		&z.ID,
		&z.Title,
		&flat,
		&z.DrawingWidthM,
		&z.DrawingHeightM,
		&z.CreatedAt,
		&z.UpdatedAt,
	); err != nil {
		return domain.Zone{}, err
	}
	points, err := domain.PointsFromFlat(flat)
	if err != nil || len(points) != len(z.Corners) {
		return domain.Zone{}, fmt.Errorf("zone %d stores %d coordinates, want 12", z.ID, len(flat))
	}
	copy(z.Corners[:], points)
	return z, nil
}

// loadZones reads the zones matching where (a constant clause over z and t,
// with args) in id order, tags attached.
func loadZones(ctx context.Context, q querier, where string, args ...any) ([]domain.Zone, error) {
	rows, err := q.Query(ctx, `SELECT `+zoneCols+` `+zoneFrom+where+` ORDER BY z.id`, args...)
	if err != nil {
		return nil, fmt.Errorf("query zones: %w", err)
	}
	zones, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Zone, error) { return scanZone(row) })
	if err != nil {
		return nil, fmt.Errorf("scan zones: %w", err)
	}
	if len(zones) == 0 {
		return []domain.Zone{}, nil
	}
	ids := make([]int64, len(zones))
	for i, z := range zones {
		ids[i] = z.ID
	}
	type link struct {
		zoneID int64
		tag    domain.ModelTag
	}
	rows, err = q.Query(ctx, `
		SELECT zt.zone_id, m.id, m.slug, m.title
		FROM site_zone_tags zt JOIN model_tags m ON m.id = zt.tag_id
		WHERE zt.zone_id = ANY($1)
		ORDER BY zt.zone_id, m.id`, ids)
	if err != nil {
		return nil, fmt.Errorf("query zone tags: %w", err)
	}
	links, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (link, error) {
		var l link
		err := row.Scan(&l.zoneID, &l.tag.ID, &l.tag.Slug, &l.tag.Title)
		return l, err
	})
	if err != nil {
		return nil, fmt.Errorf("scan zone tags: %w", err)
	}
	for _, l := range links {
		i := slices.IndexFunc(zones, func(z domain.Zone) bool { return z.ID == l.zoneID })
		zones[i].Tags = append(zones[i].Tags, l.tag)
	}
	return zones, nil
}

// setZoneTags makes slugs the tag set of zone zoneID, inside the caller's
// transaction (delete, then insert). A slug naming no tag is ErrInvalidInput.
func setZoneTags(ctx context.Context, tx pgx.Tx, zoneID int64, slugs []string) error {
	want := slices.Compact(slices.Sorted(slices.Values(slugs)))
	rows, err := tx.Query(ctx, `SELECT id FROM model_tags WHERE slug = ANY($1)`, want)
	if err != nil {
		return fmt.Errorf("resolve tags: %w", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return fmt.Errorf("resolve tags: %w", err)
	}
	if len(ids) != len(want) {
		return fmt.Errorf("%w: unknown model tag", domain.ErrInvalidInput)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM site_zone_tags WHERE zone_id = $1`, zoneID); err != nil {
		return fmt.Errorf("clear tags: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO site_zone_tags (zone_id, tag_id) SELECT $1, unnest($2::bigint[])`, zoneID, ids); err != nil {
		return fmt.Errorf("link tags: %w", err)
	}
	return nil
}

// zoneByID reads the zone just written, through the writing transaction.
func zoneByID(ctx context.Context, tx pgx.Tx, territorySlug string, id int64) (domain.Zone, error) {
	zones, err := loadZones(ctx, tx, `WHERE t.slug = $1 AND z.id = $2`, territorySlug, id)
	if err != nil {
		return domain.Zone{}, err
	}
	if len(zones) == 0 {
		return domain.Zone{}, pgx.ErrNoRows
	}
	return zones[0], nil
}

// isZoneTitleTaken reports whether err is site_zones_territory_title firing:
// another zone on the territory already has this title.
func isZoneTitleTaken(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == "site_zones_territory_title"
}

// zoneWriteError maps what a zone write's transaction returned: a sentinel the
// closure already chose passes through, a title clash is ErrInvalidInput.
func zoneWriteError(op string, err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidInput),
		errors.Is(err, domain.ErrTerritoryNotFound),
		errors.Is(err, domain.ErrZoneNotFound):
		return err
	case isZoneTitleTaken(err):
		return fmt.Errorf("storage.%s: %w: a zone with this title already exists", op, domain.ErrInvalidInput)
	}
	return fmt.Errorf("storage.%s: %w", op, err)
}
