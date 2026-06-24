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

type GetJobSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	svc   *service.Mesh
	ctx   context.Context
}

func TestGetJobSuite(t *testing.T) {
	suite.Run(t, new(GetJobSuite))
}

func (s *GetJobSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: mocks.NewCatalogMock(mc),
		Blobs:   mocks.NewBlobStoreMock(mc),
		IDGen:   func() string { return "fixed-id" },
	})
	s.ctx = s.T().Context()
}

func (s *GetJobSuite) TestRejectsEmptyID() {
	_, err := s.svc.GetJob(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *GetJobSuite) TestReturnsNotFoundForUnknown() {
	s.queue.GetJobMock.Expect(s.ctx, "missing").Return(domain.Job{}, domain.ErrJobNotFound)
	_, err := s.svc.GetJob(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
}

func (s *GetJobSuite) TestReturnsExisting() {
	s.queue.GetJobMock.Expect(s.ctx, "job-1").Return(domain.Job{ID: "job-1", Status: domain.JobStatusRunning}, nil)
	got, err := s.svc.GetJob(s.ctx, "job-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Status, domain.JobStatusRunning)
}
