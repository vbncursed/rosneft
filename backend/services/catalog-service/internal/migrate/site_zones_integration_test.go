//go:build integration

package migrate_test

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
)

// SiteZonesSuite pins 00024–00026 (spec 2026-10-26 §7.1–7.3): every model
// carries a tag with no default, zones and calibration points keep their SQL
// invariants, and Down takes back everything the three add.
type SiteZonesSuite struct {
	suite.Suite
	dsn  string
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestSiteZonesSuite(t *testing.T) { suite.Run(t, new(SiteZonesSuite)) }

func (s *SiteZonesSuite) SetupSuite() {
	ctx := s.T().Context()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr
	s.dsn, err = ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))
	s.pool, err = pgxpool.New(ctx, s.dsn)
	assert.NilError(s.T(), err)
}

func (s *SiteZonesSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *SiteZonesSuite) exec(sql string, args ...any) error {
	_, err := s.pool.Exec(s.T().Context(), sql, args...)
	return err
}

func (s *SiteZonesSuite) id(sql string, args ...any) int64 {
	var id int64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), sql, args...).Scan(&id))
	return id
}

// pgCode asserts err is a Postgres error with the given SQLSTATE.
func (s *SiteZonesSuite) pgCode(err error, code string) {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	assert.Assert(s.T(), ok, "want a Postgres error, got %v", err)
	assert.Equal(s.T(), pgErr.Code, code)
}

func (s *SiteZonesSuite) territory(slug string) int64 {
	return s.id(`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1, $1, $1) RETURNING id`, slug)
}

func (s *SiteZonesSuite) taggedModel(slug, tag string) int64 {
	return s.id(`INSERT INTO models (slug, title, source_blob_hash, tag_id)
		SELECT $1, $1, $1, id FROM model_tags WHERE slug = $2 RETURNING id`, slug, tag)
}

func (s *SiteZonesSuite) zone(territoryID int64, title string, points []float64) error {
	return s.exec(`INSERT INTO site_zones (territory_id, title, points) VALUES ($1, $2, $3)`,
		territoryID, title, points)
}

var rect = []float64{0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1}

// Spec §5 "Existing models": a model that predates 00024 lands in ungrouped.
func (s *SiteZonesSuite) TestModelTagsBackfillUngrouped() {
	ctx := s.T().Context()
	assert.NilError(s.T(), migrate.DownTo(ctx, s.dsn, 23))
	old := s.id(`INSERT INTO models (slug, title, source_blob_hash) VALUES ('legacy', 'legacy', 'legacy') RETURNING id`)
	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))

	var tag string
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT t.slug FROM models m JOIN model_tags t ON t.id = m.tag_id WHERE m.id = $1`, old).Scan(&tag))
	assert.Equal(s.T(), tag, "ungrouped")
	assert.Equal(s.T(), s.id(`SELECT count(*) FROM model_tags`), int64(12))
}

// Spec §2 anti-goal: no DEFAULT, so a model written without a tag is refused.
func (s *SiteZonesSuite) TestModelInsertWithoutTagFails() {
	s.pgCode(s.exec(`INSERT INTO models (slug, title, source_blob_hash) VALUES ('untagged', 'u', 'u')`), "23502")

	var def *string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `SELECT column_default FROM information_schema.columns
		WHERE table_name = 'models' AND column_name = 'tag_id'`).Scan(&def))
	assert.Assert(s.T(), def == nil, "models.tag_id must have no default, has %v", def)
}

// ON DELETE RESTRICT answers restrict_violation (23001), not the
// foreign_key_violation (23503) a NO ACTION key would.
func (s *SiteZonesSuite) TestModelTagDeleteRestricted() {
	s.taggedModel("crane-1", "lifting")
	s.pgCode(s.exec(`DELETE FROM model_tags WHERE slug = 'lifting'`), "23001")
}

func (s *SiteZonesSuite) TestZoneTitleUniquePerTerritory() {
	a, b := s.territory("zones-a"), s.territory("zones-b")
	assert.NilError(s.T(), s.zone(a, "North", rect))
	s.pgCode(s.zone(a, " north ", rect), "23505")
	assert.NilError(s.T(), s.zone(b, "North", rect))
}

func (s *SiteZonesSuite) TestZonePointsCardinality() {
	t := s.territory("zones-points")
	s.pgCode(s.zone(t, "Short", rect[:11]), "23514")
}

func (s *SiteZonesSuite) TestCalibrationUtmPaired() {
	t := s.territory("calibrated")
	doc := s.id(`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		VALUES ($1, 'plan', 'plan') RETURNING id`, t)
	const insert = `INSERT INTO document_calibration_points
		(document_id, idx, page, pdf_x, pdf_y, scene_x, scene_y, scene_z, utm_e, utm_n)
		VALUES ($1, $2, 1, 0, 0, 0, 0, 0, $3, $4)`

	s.pgCode(s.exec(insert, doc, 0, 500000.0, nil), "23514")
	assert.NilError(s.T(), s.exec(insert, doc, 0, 500000.0, 6000000.0))
	assert.NilError(s.T(), s.exec(insert, doc, 1, nil, nil))

	assert.NilError(s.T(), s.exec(`DELETE FROM territory_documents WHERE id = $1`, doc))
	assert.Equal(s.T(), s.id(`SELECT count(*) FROM document_calibration_points WHERE document_id = $1`, doc), int64(0))
}

// schema is a textual snapshot of every column, index and constraint in public,
// so a Down that forgets or a re-Up that differs shows up as a diff.
const schema = `
SELECT string_agg(line, E'\n' ORDER BY line) FROM (
  SELECT format('col %s.%s %s %s %s', table_name, column_name, data_type, is_nullable, column_default) AS line
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'goose_db_version'
  UNION ALL
  SELECT format('idx %s', indexdef) FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT format('con %s %s %s', conrelid::regclass, conname, pg_get_constraintdef(oid))
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace
) s`

func (s *SiteZonesSuite) snapshot() string {
	var out string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), schema).Scan(&out))
	return out
}

func (s *SiteZonesSuite) TestMigrations24To26DownUp() {
	ctx := s.T().Context()
	before := s.snapshot()

	assert.NilError(s.T(), migrate.DownTo(ctx, s.dsn, 23))
	var leftovers int64
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND (table_name IN ('model_tags', 'site_zones', 'site_zone_tags', 'document_calibration_points')
		OR (table_name = 'models' AND column_name = 'tag_id'))`).Scan(&leftovers))
	assert.Equal(s.T(), leftovers, int64(0), "Down must drop every table and column 00024–00026 add")

	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))
	assert.Equal(s.T(), s.snapshot(), before)
}
