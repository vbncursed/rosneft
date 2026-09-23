package storage

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// pgUniqueViolation is Postgres' SQLSTATE for a unique-constraint breach.
const pgUniqueViolation = "23505"

// pgRestrictViolation is what an explicit ON DELETE RESTRICT raises (SQLSTATE
// 23001). 23503, foreign_key_violation, is the NO ACTION / insert-update code
// and never fires for this delete — checking it here left a placed model's
// delete as a raw 500 until auth-service's integration test showed which
// code Postgres actually sends.
const pgRestrictViolation = "23001"

// isUniqueViolation reports whether err is a Postgres unique-constraint
// violation — the signal that a slug candidate is already taken.
func isUniqueViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation
}

// entityColumns is the SELECT/RETURNING list for models. Territories carry
// their own extra external_panorama_url column (see territoryColumns);
// models carry thumbnail_blob_hash, slotted right after source_blob_hash to
// match scanModel's Scan order.
const entityColumns = `slug, title, description, source_blob_hash, thumbnail_blob_hash, created_at, updated_at`

// territoryColumns is the territory-only SELECT/RETURNING list. Same as
// entityColumns plus external_panorama_url, slotted right after
// source_blob_hash to match scanTerritory's Scan order.
const territoryColumns = `slug, title, description, source_blob_hash, external_panorama_url, created_at, updated_at`

// artifactReturningCols is used in INSERT ... RETURNING. Columns are
// unqualified.
const artifactReturningCols = `lod, hash, content_type, size_bytes, vertices, faces,
	bbox_min_x, bbox_min_y, bbox_min_z,
	bbox_max_x, bbox_max_y, bbox_max_z,
	created_at`

// artifactSelectCols is used in SELECT with the entity JOIN; created_at
// must be aliased because the entity table also has a created_at column.
const artifactSelectCols = `a.lod, a.hash, a.content_type, a.size_bytes, a.vertices, a.faces,
	a.bbox_min_x, a.bbox_min_y, a.bbox_min_z,
	a.bbox_max_x, a.bbox_max_y, a.bbox_max_z,
	a.created_at`

// rowScanner accepts either pgx.Row or pgx.Rows in scan helpers.
type rowScanner interface {
	Scan(dst ...any) error
}

func scanTerritory(r rowScanner) (domain.Territory, error) {
	var t domain.Territory
	err := r.Scan(&t.Slug, &t.Title, &t.Description, &t.SourceBlobHash, &t.ExternalPanoramaURL, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func scanModel(r rowScanner) (domain.Model, error) {
	var m domain.Model
	err := r.Scan(&m.Slug, &m.Title, &m.Description, &m.SourceBlobHash, &m.ThumbnailBlobHash, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

// scanTerritoryListed scans a territory row plus its trailing
// placement_count, used by both ListTerritories' and GetTerritory's
// correlated-count query.
func scanTerritoryListed(r rowScanner) (domain.Territory, error) {
	var t domain.Territory
	err := r.Scan(&t.Slug, &t.Title, &t.Description, &t.SourceBlobHash, &t.ExternalPanoramaURL, &t.CreatedAt, &t.UpdatedAt, &t.PlacementCount)
	return t, err
}

// scanModelListed scans a model row plus its trailing usage_count, used by
// both ListModels' and GetModel's correlated-count query.
func scanModelListed(r rowScanner) (domain.Model, error) {
	var m domain.Model
	err := r.Scan(&m.Slug, &m.Title, &m.Description, &m.SourceBlobHash, &m.ThumbnailBlobHash, &m.CreatedAt, &m.UpdatedAt, &m.UsageCount)
	return m, err
}

func scanArtifact(r rowScanner, slug string) (domain.Artifact, error) {
	a := domain.Artifact{Slug: slug}
	err := r.Scan(
		&a.LOD, &a.Hash, &a.ContentType, &a.Size, &a.Vertices, &a.Faces,
		&a.BBoxMin.X, &a.BBoxMin.Y, &a.BBoxMin.Z,
		&a.BBoxMax.X, &a.BBoxMax.Y, &a.BBoxMax.Z,
		&a.CreatedAt,
	)
	return a, err
}

// placementSelectCols joins to territories and models exactly once each
// to resolve slugs in a single round-trip rather than firing two extra
// lookups per row.
const placementSelectCols = `pl.id, t.slug AS territory_slug, m.slug AS model_slug,
	pl.position_x, pl.position_y, pl.position_z,
	pl.rotation_x, pl.rotation_y, pl.rotation_z,
	pl.scale_x, pl.scale_y, pl.scale_z,
	pl.label, pl.created_at, pl.updated_at, pl.visible_panorama_ids,
	pl.hidden, pl.group_id`

// placementJoin is the FROM clause used together with placementSelectCols.
const placementJoin = `placements pl
	JOIN territories t ON t.id = pl.territory_id
	JOIN models m      ON m.id = pl.model_id`

// placementWriteReturning is the RETURNING list of every placement write that
// answers the row (the table aliased pl). The CTE it fills, named w, is read
// back through placementFromWrite, so a new column is added here, there and in
// placementSelectCols, and nowhere else.
const placementWriteReturning = `pl.id, pl.territory_id, pl.model_id,
	pl.position_x, pl.position_y, pl.position_z,
	pl.rotation_x, pl.rotation_y, pl.rotation_z,
	pl.scale_x, pl.scale_y, pl.scale_z,
	pl.label, pl.created_at, pl.updated_at, pl.visible_panorama_ids,
	pl.hidden, pl.group_id`

// placementFromWrite resolves the slugs of the rows a write CTE named w
// returned, in scanPlacement's column order.
const placementFromWrite = `SELECT w.id, t.slug, m.slug,
	w.position_x, w.position_y, w.position_z,
	w.rotation_x, w.rotation_y, w.rotation_z,
	w.scale_x, w.scale_y, w.scale_z,
	w.label, w.created_at, w.updated_at, w.visible_panorama_ids,
	w.hidden, w.group_id
	FROM w
	JOIN territories t ON t.id = w.territory_id
	JOIN models m      ON m.id = w.model_id`

func scanPlacement(r rowScanner) (domain.Placement, error) {
	var p domain.Placement
	err := r.Scan(
		&p.ID, &p.TerritorySlug, &p.ModelSlug,
		&p.Position.X, &p.Position.Y, &p.Position.Z,
		&p.Rotation.X, &p.Rotation.Y, &p.Rotation.Z,
		&p.Scale.X, &p.Scale.Y, &p.Scale.Z,
		&p.Label, &p.CreatedAt, &p.UpdatedAt, &p.VisiblePanoramaIDs,
		&p.Hidden, &p.GroupID,
	)
	return p, err
}

// isGroupFKViolation reports whether err is placements_group_fk refusing a
// group_id: the group does not exist, or it belongs to another territory.
func isGroupFKViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == "23503" && pgErr.ConstraintName == "placements_group_fk"
}

// measurementCols reads a measurement aliased m joined to its territory t.
// The mutations alias their RETURNING CTE as m, so one list serves all.
const measurementCols = `m.id, t.slug, m.points, m.closed,
	COALESCE(m.created_by::text, ''), m.created_at, m.updated_at`

// measurementReturning is the RETURNING list that feeds measurementCols.
const measurementReturning = `m.id, m.territory_id, m.points, m.closed,
	m.created_by, m.created_at, m.updated_at`

func scanMeasurement(r rowScanner) (domain.Measurement, error) {
	var (
		m    domain.Measurement
		flat []float64
	)
	if err := r.Scan(&m.ID, &m.TerritorySlug, &flat, &m.Closed, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt); err != nil {
		return domain.Measurement{}, err
	}
	points, err := domain.PointsFromFlat(flat)
	m.Points = points
	return m, err
}

// isMeasurementShapeViolation reports whether err is the points CHECK firing.
func isMeasurementShapeViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == "23514" && pgErr.ConstraintName == "measurements_points_shape"
}
