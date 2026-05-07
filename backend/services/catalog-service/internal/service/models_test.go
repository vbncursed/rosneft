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

type ModelsSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestModelsSuite(t *testing.T) {
	suite.Run(t, new(ModelsSuite))
}

func (s *ModelsSuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
}

func (s *ModelsSuite) TestUpsertRejectsEmptySlug() {
	_, err := s.svc.UpsertModel(s.T().Context(), domain.Model{SourceBlobHash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestUpsertRejectsEmptySourceHash() {
	_, err := s.svc.UpsertModel(s.T().Context(), domain.Model{Slug: "m1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestUpsertForwardsValidInput() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: "h"}
	out, err := s.svc.UpsertModel(s.T().Context(), in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "m1")
	assert.DeepEqual(s.T(), s.repo.LastUpsertModel, in)
}

func (s *ModelsSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetModel(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestGetReturnsNotFoundForUnknown() {
	_, err := s.svc.GetModel(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}

func (s *ModelsSuite) TestGetReturnsExisting() {
	_, err := s.svc.UpsertModel(s.T().Context(), domain.Model{Slug: "m1", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)

	got, err := s.svc.GetModel(s.T().Context(), "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "m1")
}

func (s *ModelsSuite) TestListReturnsEverything() {
	for _, slug := range []string{"a", "b"} {
		_, err := s.svc.UpsertModel(s.T().Context(), domain.Model{Slug: slug, SourceBlobHash: "h"})
		assert.NilError(s.T(), err)
	}
	got, err := s.svc.ListModels(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 2))
}

func (s *ModelsSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteModel(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestDeleteReturnsNotFoundForUnknown() {
	err := s.svc.DeleteModel(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}

func (s *ModelsSuite) TestDeleteRemovesExisting() {
	_, err := s.svc.UpsertModel(s.T().Context(), domain.Model{Slug: "m1", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.svc.DeleteModel(s.T().Context(), "m1"))

	_, err = s.svc.GetModel(s.T().Context(), "m1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}
