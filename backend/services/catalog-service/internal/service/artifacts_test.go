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

type ArtifactsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestArtifactsSuite(t *testing.T) {
	suite.Run(t, new(ArtifactsSuite))
}

func (s *ArtifactsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ArtifactsSuite) TestRegisterTerritoryRejectsEmptySlug() {
	_, err := s.svc.RegisterTerritoryArtifact(s.ctx, domain.Artifact{Hash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterTerritoryRejectsEmptyHash() {
	_, err := s.svc.RegisterTerritoryArtifact(s.ctx, domain.Artifact{Slug: "t1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterTerritoryForwardsValidInput() {
	in := domain.Artifact{Slug: "t1", LOD: 0, Hash: "abc", Size: 100}
	s.repo.RegisterTerritoryArtifactMock.Expect(s.ctx, in).Return(in, nil)
	out, err := s.svc.RegisterTerritoryArtifact(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "abc")
}

func (s *ArtifactsSuite) TestDeleteTerritoryArtifactsRejectsEmptySlug() {
	err := s.svc.DeleteTerritoryArtifacts(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestDeleteTerritoryArtifactsClearsRows() {
	s.repo.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	assert.NilError(s.T(), s.svc.DeleteTerritoryArtifacts(s.ctx, "t1"))
}

func (s *ArtifactsSuite) TestRegisterModelRejectsEmptySlug() {
	_, err := s.svc.RegisterModelArtifact(s.ctx, domain.Artifact{Hash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterModelRejectsEmptyHash() {
	_, err := s.svc.RegisterModelArtifact(s.ctx, domain.Artifact{Slug: "m1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterModelForwardsValidInput() {
	in := domain.Artifact{Slug: "m1", LOD: 1, Hash: "xyz"}
	s.repo.RegisterModelArtifactMock.Expect(s.ctx, in).Return(in, nil)
	_, err := s.svc.RegisterModelArtifact(s.ctx, in)
	assert.NilError(s.T(), err)
}

func (s *ArtifactsSuite) TestGetTerritoryRejectsEmptySlug() {
	_, err := s.svc.GetTerritoryArtifact(s.ctx, "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestGetTerritoryReturnsNotFound() {
	s.repo.GetTerritoryArtifactMock.Expect(s.ctx, "t1", 0).Return(domain.Artifact{}, domain.ErrArtifactNotFound)
	_, err := s.svc.GetTerritoryArtifact(s.ctx, "t1", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrArtifactNotFound))
}

func (s *ArtifactsSuite) TestGetTerritoryReturnsExisting() {
	s.repo.GetTerritoryArtifactMock.Expect(s.ctx, "t1", 0).Return(domain.Artifact{Slug: "t1", Hash: "h0"}, nil)
	got, err := s.svc.GetTerritoryArtifact(s.ctx, "t1", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Hash, "h0")
}

func (s *ArtifactsSuite) TestGetModelRejectsEmptySlug() {
	_, err := s.svc.GetModelArtifact(s.ctx, "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestListTerritoryRejectsEmptySlug() {
	_, err := s.svc.ListTerritoryArtifacts(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestListTerritoryReturnsAll() {
	s.repo.ListTerritoryArtifactsMock.Expect(s.ctx, "t1").Return([]domain.Artifact{
		{Slug: "t1", LOD: 0, Hash: "h"},
		{Slug: "t1", LOD: 1, Hash: "h"},
		{Slug: "t1", LOD: 2, Hash: "h"},
	}, nil)
	got, err := s.svc.ListTerritoryArtifacts(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 3))
}

func (s *ArtifactsSuite) TestListModelRejectsEmptySlug() {
	_, err := s.svc.ListModelArtifacts(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
