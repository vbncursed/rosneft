//go:build integration

package storage_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// The no-op half of RescaleSuite (rescale_integration_test.go): a rescale
// that moves nothing must write nothing, so the audit journal gains no empty
// entries, and must still clear the baseline.

func (s *RescaleSuite) TestAFactorOfOneWritesNothing() {
	_, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 10, domain.Vec3{})
	assert.NilError(s.T(), err)

	var entries int
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT count(*) FROM measurements m JOIN territories t ON t.id = m.territory_id
		WHERE t.slug = 'a' AND m.updated_at > m.created_at`).Scan(&entries))
	assert.Equal(s.T(), entries, 0)
	assert.DeepEqual(s.T(), s.points("a"), []float64{1, 2, 3, -4, 5, -6})
}

// The same size at the same off-origin centre is an identical re-scan: the
// offset (c − c')·2/M is zero without either centre being zero, so the guard
// must skip every write — none of the three tables is touched — and still
// clear the baseline.
func (s *RescaleSuite) TestIdenticalNonZeroCentresWriteNothing() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `UPDATE territories SET rescale_baseline_max = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", 10, oldCenter))

	updated, err := s.pg.RescaleTerritoryPlacements(ctx, "a", 10, oldCenter)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), updated, 0)

	var touched int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM placements p JOIN territories t ON t.id = p.territory_id
		        WHERE t.slug = 'a' AND p.updated_at > p.created_at)
		     + (SELECT count(*) FROM measurements m JOIN territories t ON t.id = m.territory_id
		        WHERE t.slug = 'a' AND m.updated_at > m.created_at)
		     + (SELECT count(*) FROM panoramas pn JOIN territories t ON t.id = pn.territory_id
		        WHERE t.slug = 'a' AND pn.updated_at > pn.created_at)`).Scan(&touched))
	assert.Equal(s.T(), touched, 0)
	assert.DeepEqual(s.T(), s.points("a"), []float64{1, 2, 3, -4, 5, -6})
	assert.Equal(s.T(), s.panorama("a"), panoramaAt)

	var pending bool
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT rescale_baseline_max IS NOT NULL FROM territories WHERE slug = 'a'`).Scan(&pending))
	assert.Assert(s.T(), !pending, "the baseline is cleared even when nothing moved")
}
