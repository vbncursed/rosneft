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

type ArtifactsSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestArtifactsSuite(t *testing.T) {
	suite.Run(t, new(ArtifactsSuite))
}

func (s *ArtifactsSuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
}

func (s *ArtifactsSuite) TestRegisterTerritoryRejectsEmptySlug() {
	_, err := s.svc.RegisterTerritoryArtifact(s.T().Context(), domain.Artifact{Hash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterTerritoryRejectsEmptyHash() {
	_, err := s.svc.RegisterTerritoryArtifact(s.T().Context(), domain.Artifact{Slug: "t1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterTerritoryForwardsValidInput() {
	in := domain.Artifact{Slug: "t1", LOD: 0, Hash: "abc", Size: 100}
	out, err := s.svc.RegisterTerritoryArtifact(s.T().Context(), in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "abc")
	assert.DeepEqual(s.T(), s.repo.LastRegisterTerritoryArtifact, in)
}

func (s *ArtifactsSuite) TestRegisterModelRejectsEmptySlug() {
	_, err := s.svc.RegisterModelArtifact(s.T().Context(), domain.Artifact{Hash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterModelRejectsEmptyHash() {
	_, err := s.svc.RegisterModelArtifact(s.T().Context(), domain.Artifact{Slug: "m1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestRegisterModelForwardsValidInput() {
	in := domain.Artifact{Slug: "m1", LOD: 1, Hash: "xyz"}
	_, err := s.svc.RegisterModelArtifact(s.T().Context(), in)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), s.repo.LastRegisterModelArtifact, in)
}

func (s *ArtifactsSuite) TestGetTerritoryRejectsEmptySlug() {
	_, err := s.svc.GetTerritoryArtifact(s.T().Context(), "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestGetTerritoryReturnsNotFound() {
	_, err := s.svc.GetTerritoryArtifact(s.T().Context(), "t1", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrArtifactNotFound))
}

func (s *ArtifactsSuite) TestGetTerritoryReturnsExisting() {
	_, err := s.svc.RegisterTerritoryArtifact(s.T().Context(), domain.Artifact{Slug: "t1", LOD: 0, Hash: "h0"})
	assert.NilError(s.T(), err)
	got, err := s.svc.GetTerritoryArtifact(s.T().Context(), "t1", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Hash, "h0")
}

func (s *ArtifactsSuite) TestGetModelRejectsEmptySlug() {
	_, err := s.svc.GetModelArtifact(s.T().Context(), "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestListTerritoryRejectsEmptySlug() {
	_, err := s.svc.ListTerritoryArtifacts(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ArtifactsSuite) TestListTerritoryReturnsAll() {
	ctx := s.T().Context()
	for _, lod := range []uint32{0, 1, 2} {
		_, err := s.svc.RegisterTerritoryArtifact(ctx, domain.Artifact{Slug: "t1", LOD: lod, Hash: "h"})
		assert.NilError(s.T(), err)
	}
	got, err := s.svc.ListTerritoryArtifacts(ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 3))
}

func (s *ArtifactsSuite) TestListModelRejectsEmptySlug() {
	_, err := s.svc.ListModelArtifacts(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
