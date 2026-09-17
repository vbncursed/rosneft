//go:build integration

package storage_test

import (
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

// PlacementScopeSuite pins UpdatePlacement and DeletePlacement to the
// territory in the URL. The gateway's RequireTerritoryAccess checks only that
// slug, so a query keyed on the id alone let a tenant rewrite or delete
// another tenant's placement by putting its id under their own territory.
// Only SQL can show the scope holds, so this runs against a real Postgres.
type PlacementScopeSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	placementA domain.Placement // lives on territory "a"
}

func TestPlacementScopeSuite(t *testing.T) { suite.Run(t, new(PlacementScopeSuite)) }

func (s *PlacementScopeSuite) SetupSuite() {
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
	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)

	for _, slug := range []string{"a", "b"} {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1, $1, $1)`, slug)
		assert.NilError(s.T(), err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO models (slug, title, source_blob_hash) VALUES ('pump', 'pump', 'pump')`)
	assert.NilError(s.T(), err)
}

func (s *PlacementScopeSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *PlacementScopeSuite) SetupTest() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `DELETE FROM placements`)
	assert.NilError(s.T(), err)
	s.placementA, err = s.pg.CreatePlacement(ctx, domain.Placement{
		TerritorySlug: "a", ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}, Label: "original",
	})
	assert.NilError(s.T(), err)
}

func (s *PlacementScopeSuite) moved(slug string) domain.Placement {
	return domain.Placement{
		ID:            s.placementA.ID,
		TerritorySlug: slug,
		Position:      domain.Vec3{X: 5, Y: 5, Z: 5},
		Scale:         domain.Vec3{X: 2, Y: 2, Z: 2},
		Label:         "moved",
	}
}

// count reports whether placementA is still stored (1) or gone (0).
func (s *PlacementScopeSuite) count() int {
	var n int
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT count(*) FROM placements WHERE id = $1`, s.placementA.ID).Scan(&n))
	return n
}

// label reads placementA's stored label; the row must exist.
func (s *PlacementScopeSuite) label() string {
	var label string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT label FROM placements WHERE id = $1`, s.placementA.ID).Scan(&label))
	return label
}

func (s *PlacementScopeSuite) TestUpdateUnderAnotherTerritoryIsNotFound() {
	_, err := s.pg.UpdatePlacement(s.T().Context(), s.moved("b"))
	assert.ErrorIs(s.T(), err, domain.ErrPlacementNotFound)
	assert.Equal(s.T(), s.label(), "original")
}

func (s *PlacementScopeSuite) TestUpdateUnderItsOwnTerritoryApplies() {
	out, err := s.pg.UpdatePlacement(s.T().Context(), s.moved("a"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.TerritorySlug, "a")
	assert.Equal(s.T(), out.Label, "moved")
	assert.Equal(s.T(), s.label(), "moved")
}

func (s *PlacementScopeSuite) TestDeleteUnderAnotherTerritoryIsNotFound() {
	err := s.pg.DeletePlacement(s.T().Context(), "b", s.placementA.ID)
	assert.ErrorIs(s.T(), err, domain.ErrPlacementNotFound)
	assert.Equal(s.T(), s.count(), 1)
	assert.Equal(s.T(), s.label(), "original")
}

func (s *PlacementScopeSuite) TestDeleteUnderItsOwnTerritoryRemoves() {
	assert.NilError(s.T(), s.pg.DeletePlacement(s.T().Context(), "a", s.placementA.ID))
	assert.Equal(s.T(), s.count(), 0)
}
