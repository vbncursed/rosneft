package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
)

type TerritoriesSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestTerritoriesSuite(t *testing.T) {
	suite.Run(t, new(TerritoriesSuite))
}

func (s *TerritoriesSuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
}

func (s *TerritoriesSuite) TestCreateRejectsEmptyTitle() {
	_, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{SourceBlobHash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestUpsertRejectsEmptySourceHash() {
	_, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Slug: "t1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestUpsertForwardsValidInput() {
	in := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "abc"}
	out, err := s.svc.UpsertTerritory(s.T().Context(), in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "t1")
	assert.DeepEqual(s.T(), s.repo.LastUpsertTerritory, in)
}

func (s *TerritoriesSuite) TestCreateGeneratesSlugFromTitle() {
	out, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Title: "Москва", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "moskva")
}

func (s *TerritoriesSuite) TestCreateResolvesSlugCollision() {
	first, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Title: "Москва", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), first.Slug, "moskva")

	second, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Title: "Москва", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), second.Slug, "moskva-2")
}

func (s *TerritoriesSuite) TestUpsertPropagatesRepoError() {
	s.repo.ErrUpsertTerritory = errors.New("db down")
	_, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Slug: "t1", SourceBlobHash: "h"})
	assert.ErrorContains(s.T(), err, "db down")
}

func (s *TerritoriesSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetTerritory(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestGetReturnsNotFoundForUnknown() {
	_, err := s.svc.GetTerritory(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestGetReturnsExisting() {
	_, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Slug: "t1", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)

	got, err := s.svc.GetTerritory(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "t1")
}

func (s *TerritoriesSuite) TestListReturnsEverything() {
	for _, slug := range []string{"a", "b", "c"} {
		_, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Slug: slug, SourceBlobHash: "h"})
		assert.NilError(s.T(), err)
	}
	got, err := s.svc.ListTerritories(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 3))
}

func (s *TerritoriesSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteTerritory(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestDeleteReturnsNotFoundForUnknown() {
	err := s.svc.DeleteTerritory(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestDeleteRemovesExisting() {
	_, err := s.svc.UpsertTerritory(s.T().Context(), domain.Territory{Slug: "t1", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.svc.DeleteTerritory(s.T().Context(), "t1"))

	_, err = s.svc.GetTerritory(s.T().Context(), "t1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}
