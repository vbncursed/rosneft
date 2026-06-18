package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

type ModelsSuite struct {
	suite.Suite
	cat  *fakeCatalog
	mesh *fakeMesh
	svc  *service.Gateway
}

func TestModelsSuite(t *testing.T) {
	suite.Run(t, new(ModelsSuite))
}

func (s *ModelsSuite) SetupTest() {
	s.cat = newFakeCatalog()
	s.mesh = newFakeMesh()
	s.mesh.NextJob = domain.Job{ID: "job-1", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending}
	s.svc = service.New(s.cat, s.mesh, &fakeUpload{})
}

func (s *ModelsSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetModel(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestCreateRejectsMissingFields() {
	// Missing source hash, then missing title. The slug is no longer
	// required — the catalog derives it from the title.
	_, _, err := s.svc.CreateModel(s.T().Context(), domain.Model{Title: "x"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, _, err = s.svc.CreateModel(s.T().Context(), domain.Model{SourceBlobHash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestCreateUpsertsAndSubmitsJob() {
	saved, job, err := s.svc.CreateModel(s.T().Context(),
		domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: "h"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Slug, "m1")
	assert.Equal(s.T(), job.ID, "job-1")
	assert.Equal(s.T(), s.mesh.LastSubmitKind, domain.KindModel)
}

func (s *ModelsSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteModel(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestArtifactsRejectEmptySlug() {
	_, err := s.svc.ListModelArtifacts(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.GetModelArtifact(s.T().Context(), "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
