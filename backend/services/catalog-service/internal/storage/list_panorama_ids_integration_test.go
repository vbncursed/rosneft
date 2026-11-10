//go:build integration

package storage_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *BatchSuite) TestListPanoramaIDs() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "list-panoramas-yard")
	s.seedTerritory(ctx, "list-panoramas-other")
	s.seedTerritory(ctx, "list-panoramas-empty")
	first := s.seedPanorama(ctx, "list-panoramas-yard", "z-first")
	s.seedPanorama(ctx, "list-panoramas-other", "foreign")
	second := s.seedPanorama(ctx, "list-panoramas-yard", "a-second")
	_, err := s.pool.Exec(ctx, `UPDATE panoramas SET hidden = true WHERE id = $1`, first)
	assert.NilError(s.T(), err)

	s.Run("IDs belong to the territory and are sorted including hidden", func() {
		got, err := s.pg.ListPanoramaIDs(ctx, "list-panoramas-yard")
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got, []int64{first, second})
	})
	s.Run("known territory without panoramas", func() {
		got, err := s.pg.ListPanoramaIDs(ctx, "list-panoramas-empty")
		assert.NilError(s.T(), err)
		assert.Assert(s.T(), got == nil)
	})
	s.Run("unknown territory", func() {
		got, err := s.pg.ListPanoramaIDs(ctx, "list-panoramas-missing")
		assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
		assert.Assert(s.T(), got == nil)
	})
}
