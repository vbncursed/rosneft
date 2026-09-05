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

type ListTargetJobsSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	svc   *service.Mesh
	ctx   context.Context
}

func TestListTargetJobsSuite(t *testing.T) { suite.Run(t, new(ListTargetJobsSuite)) }

func (s *ListTargetJobsSuite) SetupTest() {
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

func (s *ListTargetJobsSuite) TestReturnsWhatTheQueueIndexed() {
	jobs := []domain.Job{{ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning}}
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(jobs, nil)
	got, err := s.svc.ListTargetJobs(s.ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, jobs)
}

func (s *ListTargetJobsSuite) TestPassesTheQueueErrorThrough() {
	boom := errors.New("redis down")
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(nil, boom)
	_, err := s.svc.ListTargetJobs(s.ctx)
	assert.ErrorIs(s.T(), err, boom)
}
