package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

type GetJobSuite struct {
	suite.Suite
	queue *fakeQueue
	svc   *service.Mesh
}

func TestGetJobSuite(t *testing.T) {
	suite.Run(t, new(GetJobSuite))
}

func (s *GetJobSuite) SetupTest() {
	s.queue = newFakeQueue()
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: newFakeCatalog(),
		Blobs:   &fakeBlobs{},
		IDGen:   func() string { return "fixed-id" },
	})
}

func (s *GetJobSuite) TestRejectsEmptyID() {
	_, err := s.svc.GetJob(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *GetJobSuite) TestReturnsNotFoundForUnknown() {
	_, err := s.svc.GetJob(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
}

func (s *GetJobSuite) TestReturnsExisting() {
	s.queue.jobs["job-1"] = domain.Job{ID: "job-1", Status: domain.JobStatusRunning}
	got, err := s.svc.GetJob(s.T().Context(), "job-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Status, domain.JobStatusRunning)
}
