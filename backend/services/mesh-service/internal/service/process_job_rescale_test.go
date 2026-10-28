package service_test

import (
	"bytes"
	"context"
	"errors"
	"io"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// stubTerritoryConversion stubs a territory conversion with two LODs and
// records, in s.order, every catalog write that matters: "register:<lod>"
// and "rescale". registerErr/rescaleErr, when set for a call, fail it.
func (s *ProcessJobSuite) stubTerritoryConversion(registerErr func(lod uint32) error, rescaleErr func() error) *[]string {
	order := &[]string{}
	s.queue.GetJobMock.Return(domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}, nil)
	s.queue.UnlockTargetMock.Return(nil)
	s.catalog.GetTargetMock.Return(domain.ConversionTarget{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}, nil)
	s.blobs.GetMock.Set(func(context.Context, string) (io.ReadCloser, blobstore.Blob, error) {
		return io.NopCloser(bytes.NewReader(objZip(s.T()))), blobstore.Blob{}, nil
	})
	s.blobs.PutMock.Return(blobstore.Blob{}, nil)
	s.converter.ConvertLODsMock.Return([]domain.ConversionResult{
		{ArtifactHash: "lod0", BBoxMin: domain.Vec3{}, BBoxMax: domain.Vec3{X: 10, Y: 2, Z: 4}},
		{ArtifactHash: "lod1"},
	}, nil)
	s.catalog.RegisterArtifactMock.Set(func(_ context.Context, a domain.Artifact) error {
		*order = append(*order, "register:"+string(rune('0'+a.LOD)))
		return registerErr(a.LOD)
	})
	s.catalog.RescaleTerritoryPlacementsMock.Set(func(context.Context, string, float64, domain.Vec3) error {
		*order = append(*order, "rescale")
		return rescaleErr()
	})
	return order
}

func noErr(uint32) error { return nil }

// A replace-source job whose LOD0 never reached the catalog must leave the
// placements on the old scale: the old mesh is still the published one.
func (s *ProcessJobSuite) TestFailedPublishDoesNotRescalePlacements() {
	order := s.stubTerritoryConversion(func(uint32) error { return errors.New("catalog down") }, func() error { return nil })
	s.catalog.RescaleTerritoryPlacementsMock.Optional()

	assert.ErrorContains(s.T(), s.svc.ProcessJob(s.ctx, "job-1"), "register artifact lod=0")

	assert.DeepEqual(s.T(), *order, []string{"register:0"})
	last := s.saved[len(s.saved)-1]
	assert.Equal(s.T(), last.Status, domain.JobStatusFailed)
	assert.Assert(s.T(), !last.FailedOnSource, "an infrastructure failure must stay retryable")
}

// The rescale follows LOD0's registration and precedes the other LODs, so a
// later LOD failing leaves LOD0 and the placements on the same mesh.
func (s *ProcessJobSuite) TestRescalesRightAfterLOD0IsPublished() {
	order := s.stubTerritoryConversion(noErr, func() error { return nil })

	assert.NilError(s.T(), s.svc.ProcessJob(s.ctx, "job-1"))

	assert.DeepEqual(s.T(), *order, []string{"register:0", "rescale", "register:1"})
}

func (s *ProcessJobSuite) TestLaterLODFailureLeavesLOD0AndPlacementsConsistent() {
	order := s.stubTerritoryConversion(func(lod uint32) error {
		if lod == 1 {
			return errors.New("catalog down")
		}
		return nil
	}, func() error { return nil })

	assert.ErrorContains(s.T(), s.svc.ProcessJob(s.ctx, "job-1"), "register artifact lod=1")

	assert.DeepEqual(s.T(), *order, []string{"register:0", "rescale", "register:1"})
	last := s.saved[len(s.saved)-1]
	assert.Equal(s.T(), last.Status, domain.JobStatusFailed)
	assert.Assert(s.T(), !last.FailedOnSource)
}

// A failure between the publish and the rescale fails the job; the re-run
// publishes again and asks for the rescale again. The catalog applies a
// pending baseline once and clears it, so the repeat call is what makes the
// pair converge (a second call after success is its documented no-op).
func (s *ProcessJobSuite) TestRerunAfterRescaleFailureRescalesAgain() {
	fail := true
	order := s.stubTerritoryConversion(noErr, func() error {
		if fail {
			return errors.New("catalog down")
		}
		return nil
	})

	assert.ErrorContains(s.T(), s.svc.ProcessJob(s.ctx, "job-1"), "rescale placements")
	assert.Equal(s.T(), s.saved[len(s.saved)-1].Status, domain.JobStatusFailed)

	fail = false
	assert.NilError(s.T(), s.svc.ProcessJob(s.ctx, "job-1"))

	assert.DeepEqual(s.T(), *order, []string{"register:0", "rescale", "register:0", "rescale", "register:1"})
	assert.Equal(s.T(), s.saved[len(s.saved)-1].Status, domain.JobStatusSucceeded)
}
