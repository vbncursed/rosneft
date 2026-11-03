//go:build integration

package storage_test

import (
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"gotest.tools/v3/assert"
)

func (s *PlacementScopeSuite) TestListPlacementsIsScopedAndDistinguishesMissing() {
	ctx := s.T().Context()
	got, err := s.pg.ListPlacements(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 1)
	assert.Equal(s.T(), got[0].ID, s.placementA.ID)
	got, err = s.pg.ListPlacements(ctx, "b")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
	_, err = s.pg.ListPlacements(ctx, "missing")
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}
