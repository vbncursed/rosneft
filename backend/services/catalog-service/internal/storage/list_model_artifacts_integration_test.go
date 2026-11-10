//go:build integration

package storage_test

import (
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"gotest.tools/v3/assert"
)

func (s *PlainArtifactsSuite) TestListModelArtifactsDistinguishesMissingFromEmpty() {
	ctx := s.T().Context()
	s.seedModel("empty")
	got, err := s.pg.ListModelArtifacts(ctx, "empty")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
	_, err = s.pg.ListModelArtifacts(ctx, "missing")
	assert.ErrorIs(s.T(), err, domain.ErrModelNotFound)
}
