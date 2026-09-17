//go:build integration

package storage_test

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// RescaleSuite covers the RescaleTerritoryPlacements CTE: one factor,
// old_max / newMax, applied to the territory's placements and measurements in
// the same statement, and to nothing on any other territory.
type RescaleSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG
}

func TestRescaleSuite(t *testing.T) { suite.Run(t, new(RescaleSuite)) }

func (s *RescaleSuite) SetupSuite() {
	s.ctr, s.pool = startCatalogDB(&s.Suite)
	s.pg = storage.New(s.pool)
	_, err := s.pool.Exec(s.T().Context(),
		`INSERT INTO models (slug, title, source_blob_hash) VALUES ('pump', 'pump', 'pump')`)
	assert.NilError(s.T(), err)
}

func (s *RescaleSuite) TearDownSuite() { stopCatalogDB(s.ctr, s.pool) }

func (s *RescaleSuite) SetupTest() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `DELETE FROM measurements; DELETE FROM placements;
		UPDATE territories SET rescale_baseline_max = NULL`)
	assert.NilError(s.T(), err)
	for _, slug := range []string{"a", "b"} {
		_, err = s.pg.CreatePlacement(ctx, domain.Placement{
			TerritorySlug: slug, ModelSlug: "pump",
			Position: domain.Vec3{X: 1, Y: 2, Z: 3}, Scale: domain.Vec3{X: 1, Y: 1, Z: 1},
		})
		assert.NilError(s.T(), err)
		_, err = s.pg.CreateMeasurement(ctx, domain.Measurement{
			TerritorySlug: slug,
			Points:        []domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: -4, Y: 5, Z: -6}},
		})
		assert.NilError(s.T(), err)
		assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, slug, 10))
	}
}

func (s *RescaleSuite) points(slug string) []float64 {
	var points []float64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT m.points FROM measurements m JOIN territories t ON t.id = m.territory_id
		WHERE t.slug = $1`, slug).Scan(&points))
	return points
}

func (s *RescaleSuite) positionX(slug string) float64 {
	var x float64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT p.position_x FROM placements p JOIN territories t ON t.id = p.territory_id
		WHERE t.slug = $1`, slug).Scan(&x))
	return x
}

func (s *RescaleSuite) TestScalesTheTerritorysMeasurementsWithItsPlacements() {
	updated, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), updated, 1)

	assert.DeepEqual(s.T(), s.points("a"), []float64{2, 4, 6, -8, 10, -12})
	assert.Equal(s.T(), s.positionX("a"), 2.0)
}

func (s *RescaleSuite) TestLeavesAnotherTerritoryAlone() {
	_, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 5)
	assert.NilError(s.T(), err)

	assert.DeepEqual(s.T(), s.points("b"), []float64{1, 2, 3, -4, 5, -6})
	assert.Equal(s.T(), s.positionX("b"), 1.0)
}

func (s *RescaleSuite) TestAFactorOfOneWritesNothing() {
	_, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 10)
	assert.NilError(s.T(), err)

	var entries int
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT count(*) FROM measurements m JOIN territories t ON t.id = m.territory_id
		WHERE t.slug = 'a' AND m.updated_at > m.created_at`).Scan(&entries))
	assert.Equal(s.T(), entries, 0)
	assert.DeepEqual(s.T(), s.points("a"), []float64{1, 2, 3, -4, 5, -6})
}
