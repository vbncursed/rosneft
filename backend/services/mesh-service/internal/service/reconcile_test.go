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

type ReconcileSuite struct {
	suite.Suite
	queue   *mocks.QueueMock
	catalog *mocks.CatalogMock
	svc     *service.Mesh
	ctx     context.Context
}

func TestReconcileSuite(t *testing.T) {
	suite.Run(t, new(ReconcileSuite))
}

func (s *ReconcileSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.catalog = mocks.NewCatalogMock(mc)
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: s.catalog,
		Blobs:   mocks.NewBlobStoreMock(mc),
		IDGen:   func() string { return "id" },
	})
	s.ctx = s.T().Context()
}

// allowSubmit stubs the SubmitConversion fan-out (save → enqueue → get) so
// reconcile can queue missing targets; reconcile only counts the submits.
func (s *ReconcileSuite) allowSubmit() {
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{}, nil)
}

func (s *ReconcileSuite) TestNothingToReconcileWhenAllHaveLOD0() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t1").Then(true, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindModel, "m1").Then(true, nil)

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestQueuesOnlyMissingTargets() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
		{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t1").Then(true, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t2").Then(false, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindModel, "m1").Then(false, nil)
	s.allowSubmit()

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 2)
}

func (s *ReconcileSuite) TestStopsOnListTargetsError() {
	s.catalog.ListTargetsMock.Return(nil, errors.New("catalog down"))
	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "catalog down")
}

func (s *ReconcileSuite) TestSurfaceLOD0CheckErrorOnFirstFailure() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, errors.New("db blip"))
	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "db blip")
}

func (s *ReconcileSuite) TestStopsOnSubmitFailure() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestRespectsCancelledContext() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	ctx, cancel := context.WithCancel(s.ctx)
	cancel()
	_, err := s.svc.ReconcileMissingArtifacts(ctx)
	assert.Assert(s.T(), err != nil)
}
