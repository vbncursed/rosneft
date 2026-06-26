package storage

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// pgUniqueViolation is Postgres' SQLSTATE for a unique-constraint breach.
const pgUniqueViolation = "23505"

// isUniqueViolation reports whether err is a Postgres unique-constraint
// violation — the signal that a slug candidate is already taken.
func isUniqueViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation
}

// entityColumns is the SELECT/RETURNING list for models. Territories used
// to share it, but they now carry an extra external_panorama_url column —
// see territoryColumns. Models keep the original shape.
const entityColumns = `slug, title, description, source_blob_hash, created_at, updated_at`

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
	err := r.Scan(&m.Slug, &m.Title, &m.Description, &m.SourceBlobHash, &m.CreatedAt, &m.UpdatedAt)
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
	pl.label, pl.created_at, pl.updated_at, pl.visible_panorama_ids`

// placementJoin is the FROM clause used together with placementSelectCols.
const placementJoin = `placements pl
	JOIN territories t ON t.id = pl.territory_id
	JOIN models m      ON m.id = pl.model_id`

func scanPlacement(r rowScanner) (domain.Placement, error) {
	var p domain.Placement
	err := r.Scan(
		&p.ID, &p.TerritorySlug, &p.ModelSlug,
		&p.Position.X, &p.Position.Y, &p.Position.Z,
		&p.Rotation.X, &p.Rotation.Y, &p.Rotation.Z,
		&p.Scale.X, &p.Scale.Y, &p.Scale.Z,
		&p.Label, &p.CreatedAt, &p.UpdatedAt, &p.VisiblePanoramaIDs,
	)
	return p, err
}

// panoramaSelectCols joins to territories once to resolve the slug in a
// single round-trip rather than firing an extra lookup per row.
const panoramaSelectCols = `pa.id, t.slug AS territory_slug, pa.slug, pa.title,
	pa.source_blob_hash,
	pa.position_x, pa.position_y, pa.position_z,
	pa.yaw_offset, pa.created_at, pa.updated_at`

// panoramaJoin is the FROM clause used together with panoramaSelectCols.
const panoramaJoin = `panoramas pa
	JOIN territories t ON t.id = pa.territory_id`

func scanPanorama(r rowScanner) (domain.Panorama, error) {
	var p domain.Panorama
	err := r.Scan(
		&p.ID, &p.TerritorySlug, &p.Slug, &p.Title,
		&p.SourceBlobHash,
		&p.Position.X, &p.Position.Y, &p.Position.Z,
		&p.YawOffset, &p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}

// documentSelectCols joins to territories once to resolve the slug in a single
// round-trip rather than firing an extra lookup per row.
const documentSelectCols = `d.id, t.slug AS territory_slug, d.title,
	d.source_blob_hash, d.created_at`

// documentJoin is the FROM clause used together with documentSelectCols.
const documentJoin = `territory_documents d
	JOIN territories t ON t.id = d.territory_id`

func scanDocument(r rowScanner) (domain.Document, error) {
	var d domain.Document
	err := r.Scan(&d.ID, &d.TerritorySlug, &d.Title, &d.SourceBlobHash, &d.CreatedAt)
	return d, err
}
