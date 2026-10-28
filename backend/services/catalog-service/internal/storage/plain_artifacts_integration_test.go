//go:build integration

package storage_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// PlainArtifactsSuite covers the lod0_hash -> plain_hash mapping against a real
// Postgres: one statement writes the artifact and the mapping, and every read
// joins it back, so only a real database can say they agree.
type PlainArtifactsSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG
}

func TestPlainArtifactsSuite(t *testing.T) { suite.Run(t, new(PlainArtifactsSuite)) }

func (s *PlainArtifactsSuite) SetupSuite() {
	ctx := context.Background()
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
	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)
}

func (s *PlainArtifactsSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// SetupTest starts every test from empty tables.
func (s *PlainArtifactsSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(),
		`TRUNCATE plain_artifacts, territory_artifacts, model_artifacts, territories, models RESTART IDENTITY CASCADE`)
	assert.NilError(s.T(), err)
}

func (s *PlainArtifactsSuite) seedTerritory(slug string) {
	_, err := s.pool.Exec(s.T().Context(),
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1,$1,$2)`, slug, "src-"+slug)
	assert.NilError(s.T(), err)
}

func (s *PlainArtifactsSuite) seedModel(slug string) {
	_, err := s.pool.Exec(
		s.T().Context(),
		`INSERT INTO models (slug, title, source_blob_hash, thumbnail_blob_hash) VALUES ($1,$1,$2,'')`,
		slug,
		"src-"+slug,
	)
	assert.NilError(s.T(), err)
}

func art(slug string, lod uint32, hash, plain string) domain.Artifact {
	return domain.Artifact{Slug: slug, LOD: lod, Hash: hash, PlainHash: plain, ContentType: "model/gltf-binary"}
}

func (s *PlainArtifactsSuite) plainRows(plain string) int {
	var n int
	err := s.pool.QueryRow(s.T().Context(), `SELECT count(*) FROM plain_artifacts WHERE plain_hash = $1`, plain).
		Scan(&n)
	assert.NilError(s.T(), err)
	return n
}

func plains(as []domain.Artifact) []string {
	out := make([]string, len(as))
	for i, a := range as {
		out[i] = a.PlainHash
	}
	return out
}

func (s *PlainArtifactsSuite) TestMappingIsWrittenForLOD0AndReadEverywhere() {
	ctx := s.T().Context()
	s.seedTerritory("t")
	got, err := s.pg.RegisterTerritoryArtifact(ctx, art("t", 0, "l0", "p0"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.PlainHash, "p0")
	got, err = s.pg.RegisterTerritoryArtifact(ctx, art("t", 1, "l1", ""))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.PlainHash, "")

	one, err := s.pg.GetTerritoryArtifact(ctx, "t", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), one.PlainHash, "p0")

	chain, err := s.pg.ListTerritoryArtifacts(ctx, "t")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), plains(chain), []string{"p0", ""})

	listed, err := s.pg.ListTerritories(ctx, "", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed), 1)
	assert.DeepEqual(s.T(), plains(listed[0].Artifacts), []string{"p0", ""})
}

func (s *PlainArtifactsSuite) TestModelChainCarriesPlain() {
	ctx := s.T().Context()
	s.seedModel("m")
	_, err := s.pg.RegisterModelArtifact(ctx, art("m", 0, "ml0", "mp0"))
	assert.NilError(s.T(), err)
	_, err = s.pg.RegisterModelArtifact(ctx, art("m", 1, "ml1", ""))
	assert.NilError(s.T(), err)

	one, err := s.pg.GetModelArtifact(ctx, "m", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), one.PlainHash, "mp0")
	chain, err := s.pg.ListModelArtifacts(ctx, "m")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), plains(chain), []string{"mp0", ""})
	listed, err := s.pg.ListModels(ctx, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed), 1)
	assert.DeepEqual(s.T(), plains(listed[0].Artifacts), []string{"mp0", ""})
}

func (s *PlainArtifactsSuite) TestLowerLODNeverWritesAMapping() {
	s.seedTerritory("t")
	_, err := s.pg.RegisterTerritoryArtifact(s.T().Context(), art("t", 1, "l1", "x"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.plainRows("x"), 0)
}

// The rollback case: the old release re-registers LOD0 without a plain. A new
// hash must read empty; the old bytes coming back must read their old plain.
func (s *PlainArtifactsSuite) TestReRegisteredLOD0WithANewHashReadsEmpty() {
	ctx := s.T().Context()
	s.seedTerritory("t")
	_, err := s.pg.RegisterTerritoryArtifact(ctx, art("t", 0, "l0", "p0"))
	assert.NilError(s.T(), err)
	_, err = s.pg.RegisterTerritoryArtifact(ctx, art("t", 0, "l0b", ""))
	assert.NilError(s.T(), err)
	got, err := s.pg.GetTerritoryArtifact(ctx, "t", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.PlainHash, "")

	_, err = s.pg.RegisterTerritoryArtifact(ctx, art("t", 0, "l0", ""))
	assert.NilError(s.T(), err)
	got, err = s.pg.GetTerritoryArtifact(ctx, "t", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.PlainHash, "p0")
}

func (s *PlainArtifactsSuite) TestUnknownTerritoryWritesNoMapping() {
	_, err := s.pg.RegisterTerritoryArtifact(s.T().Context(), art("nope", 0, "l0", "q"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
	assert.Equal(s.T(), s.plainRows("q"), 0)
}

func (s *PlainArtifactsSuite) TestSharedLOD0IsOneRow() {
	ctx := s.T().Context()
	s.seedModel("m1")
	s.seedModel("m2")
	for _, slug := range []string{"m1", "m2"} {
		_, err := s.pg.RegisterModelArtifact(ctx, art(slug, 0, "shared", "sp"))
		assert.NilError(s.T(), err)
	}
	assert.Equal(s.T(), s.plainRows("sp"), 1)
	for _, slug := range []string{"m1", "m2"} {
		got, err := s.pg.GetModelArtifact(ctx, slug, 0)
		assert.NilError(s.T(), err)
		assert.Equal(s.T(), got.PlainHash, "sp")
	}
}
