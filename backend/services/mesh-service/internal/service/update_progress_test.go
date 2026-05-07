package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

type UpdateProgressSuite struct {
	suite.Suite
	queue *fakeQueue
	svc   *service.Mesh
}

func TestUpdateProgressSuite(t *testing.T) {
	suite.Run(t, new(UpdateProgressSuite))
}

func (s *UpdateProgressSuite) SetupTest() {
	s.queue = newFakeQueue()
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: newFakeCatalog(),
		Blobs:   &fakeBlobs{},
		IDGen:   func() string { return "id" },
	})
	s.queue.jobs["job-1"] = domain.Job{ID: "job-1", Status: domain.JobStatusRunning}
}

func (s *UpdateProgressSuite) TestPersistsProgressAndStage() {
	err := s.svc.UpdateProgress(s.T().Context(), "job-1", 0.5, "encoding")
	assert.NilError(s.T(), err)
	got := s.queue.jobs["job-1"]
	assert.Equal(s.T(), got.Progress, float32(0.5))
	assert.Equal(s.T(), got.Stage, "encoding")
}

func (s *UpdateProgressSuite) TestSurfaceUnknownJob() {
	err := s.svc.UpdateProgress(s.T().Context(), "missing", 0.5, "encoding")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
}

func (s *UpdateProgressSuite) TestPreservesOtherFields() {
	// Status, Kind, Slug must not be touched by a progress update —
	// progress is a coarse checkpoint, not a full job replacement.
	s.queue.jobs["job-1"] = domain.Job{
		ID:     "job-1",
		Kind:   domain.KindTerritory,
		Slug:   "t1",
		Status: domain.JobStatusRunning,
	}
	err := s.svc.UpdateProgress(s.T().Context(), "job-1", 0.42, "x")
	assert.NilError(s.T(), err)
	got := s.queue.jobs["job-1"]
	assert.Equal(s.T(), got.Status, domain.JobStatusRunning)
	assert.Equal(s.T(), got.Kind, domain.KindTerritory)
	assert.Equal(s.T(), got.Slug, "t1")
}
