//go:build integration

package storage_test

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// MeasurementsSuite runs the measurement storage against a real Postgres: the
// territory scope of every id-addressed statement and the points shape
// constraint are SQL, and a mock would only prove argument passing.
type MeasurementsSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	onA domain.Measurement // lives on territory "a"
}

func TestMeasurementsSuite(t *testing.T) { suite.Run(t, new(MeasurementsSuite)) }

// startCatalogDB runs Postgres, applies catalog's migrations and seeds
// territories "a" and "b".
func startCatalogDB(s *suite.Suite) (*tcpostgres.PostgresContainer, *pgxpool.Pool) {
	ctx := s.T().Context()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))
	pool, err := pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	for _, slug := range []string{"a", "b"} {
		_, err = pool.Exec(ctx,
			`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1, $1, $1)`, slug)
		assert.NilError(s.T(), err)
	}
	return ctr, pool
}

func stopCatalogDB(ctr *tcpostgres.PostgresContainer, pool *pgxpool.Pool) {
	if pool != nil {
		pool.Close()
	}
	if ctr != nil {
		_ = testcontainers.TerminateContainer(ctr)
	}
}

func (s *MeasurementsSuite) SetupSuite() {
	s.ctr, s.pool = startCatalogDB(&s.Suite)
	s.pg = storage.New(s.pool)
}

func (s *MeasurementsSuite) TearDownSuite() { stopCatalogDB(s.ctr, s.pool) }

func (s *MeasurementsSuite) SetupTest() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `DELETE FROM measurements`)
	assert.NilError(s.T(), err)
	s.onA, err = s.pg.CreateMeasurement(ctx, chain("a", false, 2))
	assert.NilError(s.T(), err)
}

// chain is an n-point chain on slug with distinct coordinates.
func chain(slug string, closed bool, n int) domain.Measurement {
	m := domain.Measurement{TerritorySlug: slug, Closed: closed}
	for i := range n {
		f := float64(i + 1)
		m.Points = append(m.Points, domain.Vec3{X: f, Y: f * 10, Z: -f})
	}
	return m
}

// stored reads onA's points straight from the table; nil when the row is gone.
func (s *MeasurementsSuite) stored() []float64 {
	var points []float64
	err := s.pool.QueryRow(s.T().Context(),
		`SELECT points FROM measurements WHERE id = $1`, s.onA.ID).Scan(&points)
	if err != nil {
		return nil
	}
	return points
}

func (s *MeasurementsSuite) TestCreateStoresTheChainAndItsAuthor() {
	const actor = "0b6f3b5e-7c1a-4f2e-9d3c-5a8b1e2f4c6d"
	ctx := grpcutil.WithActor(s.T().Context(), grpcutil.Actor{ID: actor})
	out, err := s.pg.CreateMeasurement(ctx, chain("b", true, 3))
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out.ID > 0)
	assert.Equal(s.T(), out.TerritorySlug, "b")
	assert.Equal(s.T(), out.Closed, true)
	assert.DeepEqual(s.T(), out.Points, chain("b", true, 3).Points)
	assert.Equal(s.T(), out.CreatedBy, actor)
	assert.Equal(s.T(), s.onA.CreatedBy, "")
}

func (s *MeasurementsSuite) TestCreateOnAnUnknownTerritoryIsNotFound() {
	_, err := s.pg.CreateMeasurement(s.T().Context(), chain("nowhere", false, 2))
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

func (s *MeasurementsSuite) TestTheShapeConstraintRefusesShortChains() {
	for _, m := range []domain.Measurement{chain("a", false, 1), chain("a", true, 2)} {
		_, err := s.pg.CreateMeasurement(s.T().Context(), m)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

func (s *MeasurementsSuite) TestListReturnsOnlyTheTerritorysRowsInIDOrder() {
	ctx := s.T().Context()
	second, err := s.pg.CreateMeasurement(ctx, chain("a", false, 3))
	assert.NilError(s.T(), err)
	_, err = s.pg.CreateMeasurement(ctx, chain("b", false, 2))
	assert.NilError(s.T(), err)

	out, err := s.pg.ListMeasurements(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), out[0].ID, s.onA.ID)
	assert.Equal(s.T(), out[1].ID, second.ID)
	assert.Equal(s.T(), len(out[1].Points), 3)
}

func (s *MeasurementsSuite) TestListOfAnUnknownTerritoryIsNotFound() {
	_, err := s.pg.ListMeasurements(s.T().Context(), "nowhere")
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

func (s *MeasurementsSuite) TestUpdateUnderItsOwnTerritoryApplies() {
	m := chain("a", true, 4)
	m.ID = s.onA.ID
	out, err := s.pg.UpdateMeasurement(s.T().Context(), m)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Closed, true)
	assert.Equal(s.T(), len(s.stored()), 12)
}

func (s *MeasurementsSuite) TestUpdateUnderAnotherTerritoryIsNotFound() {
	m := chain("b", false, 3)
	m.ID = s.onA.ID
	_, err := s.pg.UpdateMeasurement(s.T().Context(), m)
	assert.ErrorIs(s.T(), err, domain.ErrMeasurementNotFound)
	assert.Equal(s.T(), len(s.stored()), 6)
}

func (s *MeasurementsSuite) TestDeleteUnderAnotherTerritoryIsNotFound() {
	err := s.pg.DeleteMeasurement(s.T().Context(), "b", s.onA.ID)
	assert.ErrorIs(s.T(), err, domain.ErrMeasurementNotFound)
	assert.Assert(s.T(), s.stored() != nil)
}

func (s *MeasurementsSuite) TestDeleteUnderItsOwnTerritoryRemoves() {
	assert.NilError(s.T(), s.pg.DeleteMeasurement(s.T().Context(), "a", s.onA.ID))
	assert.Assert(s.T(), s.stored() == nil)
}

func (s *MeasurementsSuite) TestDeleteAllTouchesOnlyTheTerritory() {
	ctx := s.T().Context()
	_, err := s.pg.CreateMeasurement(ctx, chain("a", false, 2))
	assert.NilError(s.T(), err)
	onB, err := s.pg.CreateMeasurement(ctx, chain("b", false, 2))
	assert.NilError(s.T(), err)

	n, err := s.pg.DeleteMeasurements(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)
	left, err := s.pg.ListMeasurements(ctx, "b")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(left), 1)
	assert.Equal(s.T(), left[0].ID, onB.ID)
}
