//go:build integration

package storage_test

import (
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"gotest.tools/v3/assert"
)

func (s *PlainArtifactsSuite) TestListTerritoryArtifactsDistinguishesMissingFromEmpty() {
	ctx := s.T().Context()
	s.seedTerritory("empty")
	got, err := s.pg.ListTerritoryArtifacts(ctx, "empty")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
	_, err = s.pg.ListTerritoryArtifacts(ctx, "missing")
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}
