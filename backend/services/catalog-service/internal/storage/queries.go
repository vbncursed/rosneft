package storage

import "github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"

// projectColumns is the canonical SELECT/RETURNING list for projects.
const projectColumns = `slug, title, subtitle, description,
	source_obj_path, source_mtl_path, source_texture_path,
	created_at, updated_at`

// artifactReturningCols is used in INSERT ... RETURNING; columns are unqualified.
const artifactReturningCols = `lod, hash, content_type, size_bytes, vertices, faces,
	bbox_min_x, bbox_min_y, bbox_min_z,
	bbox_max_x, bbox_max_y, bbox_max_z,
	created_at`

// artifactSelectCols is used in SELECT with the projects JOIN; created_at is
// ambiguous without an alias because projects also has a created_at column.
const artifactSelectCols = `a.lod, a.hash, a.content_type, a.size_bytes, a.vertices, a.faces,
	a.bbox_min_x, a.bbox_min_y, a.bbox_min_z,
	a.bbox_max_x, a.bbox_max_y, a.bbox_max_z,
	a.created_at`

// rowScanner accepts either pgx.Row or pgx.Rows in scan helpers.
type rowScanner interface {
	Scan(dst ...any) error
}

func scanProject(r rowScanner) (domain.Project, error) {
	var p domain.Project
	err := r.Scan(
		&p.Slug, &p.Title, &p.Subtitle, &p.Description,
		&p.SourceObjPath, &p.SourceMtlPath, &p.SourceTexturePath,
		&p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}

func scanArtifact(r rowScanner, slug string) (domain.Artifact, error) {
	a := domain.Artifact{ProjectSlug: slug}
	err := r.Scan(
		&a.LOD, &a.Hash, &a.ContentType, &a.Size, &a.Vertices, &a.Faces,
		&a.BBoxMin.X, &a.BBoxMin.Y, &a.BBoxMin.Z,
		&a.BBoxMax.X, &a.BBoxMax.Y, &a.BBoxMax.Z,
		&a.CreatedAt,
	)
	return a, err
}

// placementSelectCols is the column list used by every placement read query
// — it joins to projects twice to resolve parent/asset slugs in a single
// round-trip rather than paying for two extra lookups per row.
const placementSelectCols = `pl.id, pp.slug AS parent_slug, ap.slug AS asset_slug,
	pl.position_x, pl.position_y, pl.position_z,
	pl.rotation_x, pl.rotation_y, pl.rotation_z,
	pl.scale_x, pl.scale_y, pl.scale_z,
	pl.label, pl.created_at, pl.updated_at`

// placementJoin is the FROM clause used together with placementSelectCols.
const placementJoin = `placements pl
	JOIN projects pp ON pp.id = pl.parent_id
	JOIN projects ap ON ap.id = pl.asset_id`

func scanPlacement(r rowScanner) (domain.Placement, error) {
	var p domain.Placement
	err := r.Scan(
		&p.ID, &p.ParentSlug, &p.AssetSlug,
		&p.Position.X, &p.Position.Y, &p.Position.Z,
		&p.Rotation.X, &p.Rotation.Y, &p.Rotation.Z,
		&p.Scale.X, &p.Scale.Y, &p.Scale.Z,
		&p.Label, &p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}
