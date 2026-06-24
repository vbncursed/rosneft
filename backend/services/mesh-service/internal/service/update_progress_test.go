package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service/mocks"
)

type UpdateProgressSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	svc   *service.Mesh
	ctx   context.Context
}

func TestUpdateProgressSuite(t *testing.T) {
	suite.Run(t, new(UpdateProgressSuite))
}

func (s *UpdateProgressSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: mocks.NewCatalogMock(mc),
		Blobs:   mocks.NewBlobStoreMock(mc),
		IDGen:   func() string { return "id" },
	})
	s.ctx = s.T().Context()
}

func (s *UpdateProgressSuite) TestPersistsProgressAndStage() {
	s.queue.GetJobMock.Expect(s.ctx, "job-1").Return(domain.Job{ID: "job-1", Status: domain.JobStatusRunning}, nil)
	// Expect verifies progress + stage were written onto the loaded job.
	s.queue.SaveJobMock.Expect(s.ctx, domain.Job{
		ID: "job-1", Status: domain.JobStatusRunning, Progress: 0.5, Stage: "encoding",
	}).Return(nil)

	err := s.svc.UpdateProgress(s.ctx, "job-1", 0.5, "encoding")
	assert.NilError(s.T(), err)
}

func (s *UpdateProgressSuite) TestSurfaceUnknownJob() {
	s.queue.GetJobMock.Expect(s.ctx, "missing").Return(domain.Job{}, domain.ErrJobNotFound)
	err := s.svc.UpdateProgress(s.ctx, "missing", 0.5, "encoding")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
}

func (s *UpdateProgressSuite) TestPreservesOtherFields() {
	// Status, Kind, Slug must survive a progress update — it's a checkpoint,
	// not a full job replacement.
	loaded := domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning}
	s.queue.GetJobMock.Expect(s.ctx, "job-1").Return(loaded, nil)
	saved := loaded
	saved.Progress = 0.42
	saved.Stage = "x"
	s.queue.SaveJobMock.Expect(s.ctx, saved).Return(nil)

	err := s.svc.UpdateProgress(s.ctx, "job-1", 0.42, "x")
	assert.NilError(s.T(), err)
}
