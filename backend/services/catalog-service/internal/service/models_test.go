package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type ModelsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestModelsSuite(t *testing.T) {
	suite.Run(t, new(ModelsSuite))
}

func (s *ModelsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ModelsSuite) TestCreateRejectsEmptyTitle() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{SourceBlobHash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestUpsertRejectsEmptySourceHash() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{Slug: "m1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestUpsertForwardsValidInput() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: "h"}
	s.repo.UpsertModelMock.Expect(s.ctx, in).Return(in, nil)
	out, err := s.svc.UpsertModel(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "m1")
}

func (s *ModelsSuite) TestCreateGeneratesSlugFromTitle() {
	in := domain.Model{Title: "Насос K-200", SourceBlobHash: "h"}
	s.repo.CreateModelMock.
		Expect(s.ctx, domain.Model{Slug: "nasos-k-200", Title: "Насос K-200", SourceBlobHash: "h"}).
		Return(domain.Model{Slug: "nasos-k-200"}, nil)
	out, err := s.svc.UpsertModel(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "nasos-k-200")
}

func (s *ModelsSuite) TestCreateResolvesSlugCollision() {
	taken := domain.Model{Slug: "box", Title: "Box", SourceBlobHash: "h"}
	free := domain.Model{Slug: "box-2", Title: "Box", SourceBlobHash: "h"}
	s.repo.CreateModelMock.When(s.ctx, taken).Then(domain.Model{}, domain.ErrSlugConflict)
	s.repo.CreateModelMock.When(s.ctx, free).Then(domain.Model{Slug: "box-2"}, nil)

	out, err := s.svc.UpsertModel(s.ctx, domain.Model{Title: "Box", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "box-2")
}

func (s *ModelsSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetModel(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestGetReturnsNotFoundForUnknown() {
	s.repo.GetModelMock.Expect(s.ctx, "missing").Return(domain.Model{}, domain.ErrModelNotFound)
	_, err := s.svc.GetModel(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}

func (s *ModelsSuite) TestGetReturnsExisting() {
	s.repo.GetModelMock.Expect(s.ctx, "m1").Return(domain.Model{Slug: "m1"}, nil)
	got, err := s.svc.GetModel(s.ctx, "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "m1")
}

func (s *ModelsSuite) TestListReturnsEverything() {
	s.repo.ListModelsMock.Return([]domain.Model{{Slug: "a"}, {Slug: "b"}}, nil)
	got, err := s.svc.ListModels(s.ctx)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 2))
}

func (s *ModelsSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteModel(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestDeleteReturnsNotFoundForUnknown() {
	s.repo.DeleteModelMock.Expect(s.ctx, "missing").Return(domain.ErrModelNotFound)
	err := s.svc.DeleteModel(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}

func (s *ModelsSuite) TestDeleteRemovesExisting() {
	s.repo.DeleteModelMock.Expect(s.ctx, "m1").Return(nil)
	assert.NilError(s.T(), s.svc.DeleteModel(s.ctx, "m1"))
}
