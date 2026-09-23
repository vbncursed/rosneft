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

type ModelsSuite struct {
	suite.Suite
	cat  *mocks.CatalogMock
	mesh *mocks.MeshMock
	svc  *service.Gateway
	ctx  context.Context
}

func TestModelsSuite(t *testing.T) {
	suite.Run(t, new(ModelsSuite))
}

func (s *ModelsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.mesh = mocks.NewMeshMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), s.mesh, mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

func (s *ModelsSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetModel(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestCreateRejectsMissingFields() {
	// Missing source hash, then missing title. The slug is no longer required —
	// the catalog derives it from the title.
	_, _, err := s.svc.CreateModel(s.ctx, domain.Model{Title: "x"}, rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, _, err = s.svc.CreateModel(s.ctx, domain.Model{SourceBlobHash: "h"}, rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestCreateUpsertsAndSubmitsJob() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: "h"}
	s.cat.UpsertModelMock.Expect(s.ctx, in).Return(in, nil)
	s.mesh.SubmitConversionMock.Expect(s.ctx, domain.KindModel, "m1").
		Return(domain.Job{ID: "job-1", Kind: domain.KindModel, Slug: "m1"}, nil)

	saved, job, err := s.svc.CreateModel(s.ctx, in, rootScope)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Slug, "m1")
	assert.Equal(s.T(), job.ID, "job-1")
}

func (s *ModelsSuite) TestUpdateRejectsEmptySlug() {
	_, err := s.svc.UpdateModel(s.ctx, "", domain.ModelUpdate{}, rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// A PATCH writes only what it sends, in one catalog call: no GetModel, no
// UpsertModel (neither is expected, so either would fail the test).
func (s *ModelsSuite) TestUpdateSendsTheThumbnailAlone() {
	sent := domain.ModelUpdate{ThumbnailBlobHash: new("thumb-hash")}
	s.cat.UpdateModelMock.Expect(s.ctx, "m1", sent).
		Return(domain.Model{Slug: "m1", ThumbnailBlobHash: "thumb-hash"}, nil)

	saved, err := s.svc.UpdateModel(s.ctx, "m1", sent, rootScope)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.ThumbnailBlobHash, "thumb-hash")
}

func (s *ModelsSuite) TestUpdateSendsOnlyTheEditedFields() {
	sent := domain.ModelUpdate{Title: new("Crate"), Description: new("")}
	s.cat.UpdateModelMock.Expect(s.ctx, "m1", sent).Return(domain.Model{Slug: "m1", Title: "Crate"}, nil)

	saved, err := s.svc.UpdateModel(s.ctx, "m1", sent, rootScope)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Title, "Crate")
}

func (s *ModelsSuite) TestUpdateRejectsBlankTitleBeforeWriting() {
	// No catalog expectation: any catalog call would fail the test.
	_, err := s.svc.UpdateModel(s.ctx, "m1", domain.ModelUpdate{Title: new("  ")}, rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteModel(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestArtifactsRejectEmptySlug() {
	_, err := s.svc.ListModelArtifacts(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.GetModelArtifact(s.ctx, "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
