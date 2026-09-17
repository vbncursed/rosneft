//go:build integration

package storage_test

import (
	"database/sql"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // registers "pgx" for goose
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/storage"
)

// catalogMigrations holds the DDL for every table content reads and writes.
// Content's own migration is a deliberate no-op (catalog owns the schema, see
// content's 00001_init.sql), and catalog's migrate package is internal to
// another module, so the files are read from the repo checkout instead.
const catalogMigrations = "../../../catalog-service/internal/migrate/migrations"

// TerritoryScopeSuite pins the id-keyed panorama and document mutations to the
// territory in the URL. The gateway's RequireTerritoryAccess checks only that
// slug, so a query keyed on the id alone let a tenant rewrite or delete another
// tenant's row by putting its id under their own territory.
type TerritoryScopeSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	panoramaA, documentA   int64 // both on territory "a"
	placementA, placementB int64 // one per territory, each listing panoramaA
}

func TestTerritoryScopeSuite(t *testing.T) { suite.Run(t, new(TerritoryScopeSuite)) }

func (s *TerritoryScopeSuite) SetupSuite() {
	ctx := s.T().Context()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	db, err := sql.Open("pgx", dsn)
	assert.NilError(s.T(), err)
	defer func() { _ = db.Close() }()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS(catalogMigrations))
	assert.NilError(s.T(), err)
	_, err = provider.Up(ctx)
	assert.NilError(s.T(), err)

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)

	_, err = s.pool.Exec(ctx, `
		INSERT INTO territories (slug, title, source_blob_hash) VALUES ('a','a','a'), ('b','b','b');
		INSERT INTO models (slug, title, source_blob_hash) VALUES ('pump','pump','pump')`)
	assert.NilError(s.T(), err)
}

func (s *TerritoryScopeSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// SetupTest reseeds one panorama and one document on "a", plus a placement on
// each territory whose allowlist names that panorama. The one on "b" stands in
// for a row written before allowlists were checked against the territory.
func (s *TerritoryScopeSuite) SetupTest() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `DELETE FROM placements; DELETE FROM panoramas; DELETE FROM territory_documents`)
	assert.NilError(s.T(), err)

	q := func(query string, args ...any) int64 {
		var id int64
		assert.NilError(s.T(), s.pool.QueryRow(ctx, query, args...).Scan(&id))
		return id
	}
	s.panoramaA = q(`INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
		SELECT id, 'north', 'original', 'pano' FROM territories WHERE slug = 'a' RETURNING id`)
	s.documentA = q(`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		SELECT id, 'spec', 'doc' FROM territories WHERE slug = 'a' RETURNING id`)
	placement := `INSERT INTO placements (territory_id, model_id, visible_panorama_ids)
		SELECT t.id, m.id, ARRAY[$2::bigint] FROM territories t, models m
		WHERE t.slug = $1 AND m.slug = 'pump' RETURNING id`
	s.placementA = q(placement, "a", s.panoramaA)
	s.placementB = q(placement, "b", s.panoramaA)
}

func (s *TerritoryScopeSuite) count(table string, id int64) int {
	var n int
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT count(*) FROM `+table+` WHERE id = $1`, id).Scan(&n))
	return n
}

func (s *TerritoryScopeSuite) allowlist(placementID int64) []int64 {
	var ids []int64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT visible_panorama_ids FROM placements WHERE id = $1`, placementID).Scan(&ids))
	return ids
}

func (s *TerritoryScopeSuite) panoramaTitle() string {
	var title string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT title FROM panoramas WHERE id = $1`, s.panoramaA).Scan(&title))
	return title
}

func (s *TerritoryScopeSuite) renamed(slug string) domain.Panorama {
	return domain.Panorama{ID: s.panoramaA, TerritorySlug: slug, Title: "renamed"}
}

func (s *TerritoryScopeSuite) TestUpdatePanoramaUnderAnotherTerritoryIsNotFound() {
	_, err := s.pg.UpdatePanorama(s.T().Context(), s.renamed("b"))
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
	assert.Equal(s.T(), s.panoramaTitle(), "original")
}

func (s *TerritoryScopeSuite) TestUpdatePanoramaUnderItsOwnTerritoryApplies() {
	out, err := s.pg.UpdatePanorama(s.T().Context(), s.renamed("a"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.TerritorySlug, "a")
	assert.Equal(s.T(), s.panoramaTitle(), "renamed")
}

func (s *TerritoryScopeSuite) TestDeletePanoramaUnderAnotherTerritoryIsNotFoundAndScrubsNothing() {
	err := s.pg.DeletePanorama(s.T().Context(), "b", s.panoramaA)
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
	assert.Equal(s.T(), s.count("panoramas", s.panoramaA), 1)
	assert.DeepEqual(s.T(), s.allowlist(s.placementA), []int64{s.panoramaA})
	assert.DeepEqual(s.T(), s.allowlist(s.placementB), []int64{s.panoramaA})
}

func (s *TerritoryScopeSuite) TestDeletePanoramaScrubsOnlyItsOwnTerritory() {
	assert.NilError(s.T(), s.pg.DeletePanorama(s.T().Context(), "a", s.panoramaA))
	assert.Equal(s.T(), s.count("panoramas", s.panoramaA), 0)
	assert.DeepEqual(s.T(), s.allowlist(s.placementA), []int64{})
	assert.DeepEqual(s.T(), s.allowlist(s.placementB), []int64{s.panoramaA})
}

func (s *TerritoryScopeSuite) TestDeleteDocumentUnderAnotherTerritoryIsNotFound() {
	err := s.pg.DeleteDocument(s.T().Context(), "b", s.documentA)
	assert.ErrorIs(s.T(), err, domain.ErrDocumentNotFound)
	assert.Equal(s.T(), s.count("territory_documents", s.documentA), 1)
}

func (s *TerritoryScopeSuite) TestDeleteDocumentUnderItsOwnTerritoryRemoves() {
	assert.NilError(s.T(), s.pg.DeleteDocument(s.T().Context(), "a", s.documentA))
	assert.Equal(s.T(), s.count("territory_documents", s.documentA), 0)
}
