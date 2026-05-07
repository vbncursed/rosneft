package storage

import "github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"

// entityColumns is the SELECT/RETURNING list shared by territories and
// models — they have identical schemas in the database.
const entityColumns = `slug, title, description, source_blob_hash, created_at, updated_at`

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
	err := r.Scan(&t.Slug, &t.Title, &t.Description, &t.SourceBlobHash, &t.CreatedAt, &t.UpdatedAt)
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
	pl.label, pl.created_at, pl.updated_at`

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
		&p.Label, &p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}
