package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type TerritoriesSuite struct {
	suite.Suite
	cat  *mocks.CatalogMock
	mesh *mocks.MeshMock
	svc  *service.Gateway
	ctx  context.Context
}

func TestTerritoriesSuite(t *testing.T) {
	suite.Run(t, new(TerritoriesSuite))
}

func (s *TerritoriesSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.mesh = mocks.NewMeshMock(mc)
	s.svc = service.New(s.cat, s.mesh, mocks.NewUploadMock(mc))
	s.ctx = s.T().Context()
}

func (s *TerritoriesSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetTerritory(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestCreateRejectsEmptyTitle() {
	_, _, err := s.svc.CreateTerritory(s.ctx, domain.Territory{SourceBlobHash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestCreateRejectsEmptyHash() {
	_, _, err := s.svc.CreateTerritory(s.ctx, domain.Territory{Title: "x"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestCreateUpsertsAndSubmitsJob() {
	in := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "h"}
	s.cat.UpsertTerritoryMock.Expect(s.ctx, in).Return(in, nil)
	s.mesh.SubmitConversionMock.Expect(s.ctx, domain.KindTerritory, "t1").
		Return(domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1"}, nil)

	saved, job, err := s.svc.CreateTerritory(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Slug, "t1")
	assert.Equal(s.T(), job.ID, "job-1")
}

func (s *TerritoriesSuite) TestCreateReturnsCatalogError() {
	s.cat.UpsertTerritoryMock.Return(domain.Territory{}, errors.New("db down"))
	_, _, err := s.svc.CreateTerritory(s.ctx, domain.Territory{Slug: "t1", Title: "x", SourceBlobHash: "h"})
	assert.ErrorContains(s.T(), err, "db down")
}

func (s *TerritoriesSuite) TestCreateSurfaceMeshErrorWithSavedTerritory() {
	// If the catalog upsert succeeded but the mesh queue is down, the gateway
	// must still return the persisted territory so the user can retry the
	// conversion later — losing the save would re-trigger the upload flow.
	in := domain.Territory{Slug: "t1", Title: "x", SourceBlobHash: "h"}
	s.cat.UpsertTerritoryMock.Expect(s.ctx, in).Return(in, nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{}, errors.New("redis down"))

	saved, job, err := s.svc.CreateTerritory(s.ctx, in)
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), saved.Slug, "t1")
	assert.Equal(s.T(), job.ID, "")
}

func (s *TerritoriesSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteTerritory(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestArtifactsRejectEmptySlug() {
	_, err := s.svc.ListTerritoryArtifacts(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.GetTerritoryArtifact(s.ctx, "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
