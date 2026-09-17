package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
)

// PanoramasSuite covers the id-keyed panorama mutations: both must carry the
// territory slug down to storage, which scopes the row by it.
type PanoramasSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Content
	ctx  context.Context
}

func TestPanoramasSuite(t *testing.T) {
	suite.Run(t, new(PanoramasSuite))
}

func (s *PanoramasSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *PanoramasSuite) TestUpdateRejectsEmptyTerritorySlug() {
	_, err := s.svc.UpdatePanorama(s.ctx, domain.Panorama{ID: 3, Title: "North"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramasSuite) TestUpdateForwardsTerritorySlug() {
	in := domain.Panorama{ID: 3, TerritorySlug: "site-a", Title: "North"}
	s.repo.UpdatePanoramaMock.Expect(minimock.AnyContext, in).Return(in, nil)
	got, err := s.svc.UpdatePanorama(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), in, got)
}

func (s *PanoramasSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeletePanorama(s.ctx, "site-a", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramasSuite) TestDeleteRejectsEmptyTerritorySlug() {
	err := s.svc.DeletePanorama(s.ctx, "", 3)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramasSuite) TestDeleteForwardsTerritorySlug() {
	s.repo.DeletePanoramaMock.Expect(minimock.AnyContext, "site-a", int64(3)).Return(domain.ErrPanoramaNotFound)
	err := s.svc.DeletePanorama(s.ctx, "site-a", 3)
	assert.Assert(s.T(), errors.Is(err, domain.ErrPanoramaNotFound))
}
