package service_test

import (
	"context"
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

func (s *ReconcileSuite) TestForgetsIndexEntriesWhoseTargetTheCatalogNoLongerLists() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "kept", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j1", Kind: domain.KindTerritory, Slug: "kept", Status: domain.JobStatusSucceeded},
		{ID: "j2", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusFailed},
		{ID: "j3", Kind: domain.KindModel, Slug: "kept", Status: domain.JobStatusFailed},
	}, nil)
	// Only the two absent from the catalog: the territory "gone" and the
	// model "kept" — same slug as the territory, different kind.
	s.queue.ForgetTargetMock.When(s.ctx, domain.KindTerritory, "gone").Then(nil)
	s.queue.ForgetTargetMock.When(s.ctx, domain.KindModel, "kept").Then(nil)

	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(s.queue.ForgetTargetMock.Calls()), 2)
}

func (s *ReconcileSuite) TestASweepErrorDoesNotFailTheTick() {
	s.catalog.ListTargetsMock.Return(nil, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j2", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusFailed},
	}, nil)
	s.queue.ForgetTargetMock.Return(errors.New("redis blip"))

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestAnIndexReadErrorDoesNotFailTheTick() {
	s.catalog.ListTargetsMock.Return(nil, nil)
	s.queue.ListTargetJobsMock.Return(nil, errors.New("redis blip"))

	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
}

func (s *ReconcileSuite) TestNoSweepAfterALoopError() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, errors.New("db blip"))
	// ListTargetJobs and ForgetTarget are unmocked: reaching them fails the test.

	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "db blip")
}

func (s *ReconcileSuite) TestNoSweepWhenContextIsAlreadyCancelled() {
	s.catalog.ListTargetsMock.Return(nil, nil)
	ctx, cancel := context.WithCancel(s.ctx)
	cancel()
	// ListTargetJobs is unmocked: reaching it fails the test.

	queued, err := s.svc.ReconcileMissingArtifacts(ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 0)
}
