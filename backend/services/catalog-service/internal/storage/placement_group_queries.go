package storage

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// placementGroupCols reads a group aliased g joined to its territory t. The
// writes alias their RETURNING CTE as g, so one list serves all of them.
const placementGroupCols = `g.id, t.slug, g.title, g.created_at, g.updated_at`

// placementGroupReturning is the RETURNING list that feeds placementGroupCols.
const placementGroupReturning = `g.id, g.territory_id, g.title, g.created_at, g.updated_at`

func scanPlacementGroup(r rowScanner) (domain.PlacementGroup, error) {
	var g domain.PlacementGroup
	err := r.Scan(&g.ID, &g.TerritorySlug, &g.Title, &g.CreatedAt, &g.UpdatedAt)
	return g, err
}

// isGroupTitleViolation reports whether err is placement_groups_title_len
// firing: the backstop behind the service's own title check.
func isGroupTitleViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == "23514" && pgErr.ConstraintName == "placement_groups_title_len"
}

// isGroupTitleTaken reports whether err is placement_groups_territory_title
// firing: another group on the territory already has this title.
func isGroupTitleTaken(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == "placement_groups_territory_title"
}
