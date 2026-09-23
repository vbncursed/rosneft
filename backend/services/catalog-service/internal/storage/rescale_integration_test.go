//go:build integration

package storage_test

import (
	"math"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// RescaleSuite covers the RescaleTerritoryPlacements CTE: scale by
// old_max/newMax and shift by (old_center − new_center)·2/newMax, applied to
// the territory's placements, measurements and panoramas in one statement, and
// to nothing on any other territory.
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
	_, err := s.pool.Exec(ctx, `DELETE FROM measurements; DELETE FROM placements; DELETE FROM panoramas;
		UPDATE territories SET rescale_baseline_max = NULL, rescale_baseline_center_x = NULL,
			rescale_baseline_center_y = NULL, rescale_baseline_center_z = NULL`)
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
		_, err = s.pool.Exec(ctx, `
			INSERT INTO panoramas (territory_id, slug, title, source_blob_hash, position_x, position_y, position_z)
			SELECT id, 'pano', 'pano', 'pano', $2, $3, $4 FROM territories WHERE slug = $1`,
			slug, panoramaAt.X, panoramaAt.Y, panoramaAt.Z)
		assert.NilError(s.T(), err)
		assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, slug, 10, domain.Vec3{}))
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
	updated, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 5, domain.Vec3{})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), updated, 1)

	assert.DeepEqual(s.T(), s.points("a"), []float64{2, 4, 6, -8, 10, -12})
	assert.Equal(s.T(), s.positionX("a"), 2.0)
}

func (s *RescaleSuite) TestLeavesAnotherTerritoryAlone() {
	_, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 5, domain.Vec3{})
	assert.NilError(s.T(), err)

	assert.DeepEqual(s.T(), s.points("b"), []float64{1, 2, 3, -4, 5, -6})
	assert.Equal(s.T(), s.positionX("b"), 1.0)
	assert.Equal(s.T(), s.panorama("b"), panoramaAt)
}

// baseline reads a pending baseline back; call it only while one is set.
func (s *RescaleSuite) baseline(slug string) (float64, domain.Vec3) {
	var m float64
	var c domain.Vec3
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT rescale_baseline_max, rescale_baseline_center_x,
		       rescale_baseline_center_y, rescale_baseline_center_z
		FROM territories WHERE slug = $1`, slug).Scan(&m, &c.X, &c.Y, &c.Z))
	return m, c
}

// A second replace before the first converted keeps the first's baseline, its
// center included: both describe the mesh the placements were positioned on.
func (s *RescaleSuite) TestTheFirstBaselineKeepsItsCenter() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `UPDATE territories SET rescale_baseline_max = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", 8, domain.Vec3{X: 1, Y: 2, Z: 3}))
	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", 4, domain.Vec3{X: 9, Y: 9, Z: 9}))

	m, c := s.baseline("a")
	assert.Equal(s.T(), m, 8.0)
	assert.Equal(s.T(), c, domain.Vec3{X: 1, Y: 2, Z: 3})
}

// The old source's bbox (center c, max axis M) and the replacement's (c', M').
// A scene-space point s stands for the world point s·M/2 + c; after the rescale
// it must stand for the same world point under the new normalization.
var (
	oldCenter  = domain.Vec3{X: 10, Y: 20, Z: 30}
	newCenter  = domain.Vec3{X: 12, Y: 18, Z: 30.5}
	panoramaAt = domain.Vec3{X: 0.5, Y: -0.25, Z: 0.75}
)

const oldMax, newMax = 8.0, 10.0

func worldOf(s domain.Vec3, m float64, c domain.Vec3) domain.Vec3 {
	return domain.Vec3{X: s.X*m/2 + c.X, Y: s.Y*m/2 + c.Y, Z: s.Z*m/2 + c.Z}
}

func (s *RescaleSuite) assertSameWorldPoint(before, after domain.Vec3) {
	s.T().Helper()
	want, got := worldOf(before, oldMax, oldCenter), worldOf(after, newMax, newCenter)
	for _, d := range []float64{want.X - got.X, want.Y - got.Y, want.Z - got.Z} {
		assert.Assert(s.T(), math.Abs(d) < 1e-9, "world point moved: want %+v, got %+v", want, got)
	}
}

func (s *RescaleSuite) placement(slug string) (pos, scale domain.Vec3) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT p.position_x, p.position_y, p.position_z, p.scale_x, p.scale_y, p.scale_z
		FROM placements p JOIN territories t ON t.id = p.territory_id
		WHERE t.slug = $1`, slug).Scan(&pos.X, &pos.Y, &pos.Z, &scale.X, &scale.Y, &scale.Z))
	return pos, scale
}

func (s *RescaleSuite) panorama(slug string) (pos domain.Vec3) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT pn.position_x, pn.position_y, pn.position_z
		FROM panoramas pn JOIN territories t ON t.id = pn.territory_id
		WHERE t.slug = $1`, slug).Scan(&pos.X, &pos.Y, &pos.Z))
	return pos
}

func (s *RescaleSuite) TestKeepsEveryBindingOnItsWorldPointWhenTheCenterMoves() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `UPDATE territories SET rescale_baseline_max = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", oldMax, oldCenter))

	_, err = s.pg.RescaleTerritoryPlacements(ctx, "a", newMax, newCenter)
	assert.NilError(s.T(), err)

	pos, scale := s.placement("a")
	s.assertSameWorldPoint(domain.Vec3{X: 1, Y: 2, Z: 3}, pos)
	for _, v := range []float64{scale.X, scale.Y, scale.Z} {
		assert.Assert(s.T(), math.Abs(v-oldMax/newMax) < 1e-9, "scale %v, want %v", v, oldMax/newMax)
	}
	points, err := domain.PointsFromFlat(s.points("a"))
	assert.NilError(s.T(), err)
	s.assertSameWorldPoint(domain.Vec3{X: 1, Y: 2, Z: 3}, points[0])
	s.assertSameWorldPoint(domain.Vec3{X: -4, Y: 5, Z: -6}, points[1])
	s.assertSameWorldPoint(panoramaAt, s.panorama("a"))

	var cleared int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `
		SELECT num_nulls(rescale_baseline_max, rescale_baseline_center_x,
		                 rescale_baseline_center_y, rescale_baseline_center_z)
		FROM territories WHERE slug = 'a'`).Scan(&cleared))
	assert.Equal(s.T(), cleared, 4)
}

// A baseline captured before the center columns existed carries a max alone;
// it completes with the scale-only rescale it was captured for.
func (s *RescaleSuite) TestANullBaselineCenterOnlyScales() {
	_, err := s.pool.Exec(s.T().Context(), `UPDATE territories SET rescale_baseline_center_x = NULL,
		rescale_baseline_center_y = NULL, rescale_baseline_center_z = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)

	_, err = s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 5, newCenter)
	assert.NilError(s.T(), err)

	assert.DeepEqual(s.T(), s.points("a"), []float64{2, 4, 6, -8, 10, -12})
	assert.Equal(s.T(), s.positionX("a"), 2.0)
	assert.Equal(s.T(), s.panorama("a"), domain.Vec3{X: 1, Y: -0.5, Z: 1.5})
}

// Same size, shifted bbox: the factor is 1 but every point still moves, so the
// no-op guard has to look at the offset too.
func (s *RescaleSuite) TestAMovedCenterAloneStillShifts() {
	_, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 10, domain.Vec3{X: -5})
	assert.NilError(s.T(), err)

	assert.Equal(s.T(), s.positionX("a"), 2.0) // 1·1 + (0 − −5)·2/10
}
