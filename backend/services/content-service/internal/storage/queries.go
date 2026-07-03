package storage

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// pgUniqueViolation is Postgres' SQLSTATE for a unique-constraint breach.
const pgUniqueViolation = "23505"

// isUniqueViolation reports whether err is a Postgres unique-constraint
// violation — the signal that a slug candidate is already taken.
func isUniqueViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == pgUniqueViolation
}

// rowScanner accepts either pgx.Row or pgx.Rows in scan helpers.
type rowScanner interface {
	Scan(dst ...any) error
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
