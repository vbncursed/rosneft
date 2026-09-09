package service_test

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service/mocks"
)

type ProcessJobSuite struct {
	suite.Suite
	queue     *mocks.QueueMock
	catalog   *mocks.CatalogMock
	converter *mocks.ConverterMock
	blobs     *mocks.BlobStoreMock
	svc       *service.Mesh
	ctx       context.Context
	saved     []domain.Job
}

func TestProcessJobSuite(t *testing.T) { suite.Run(t, new(ProcessJobSuite)) }

func (s *ProcessJobSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.catalog = mocks.NewCatalogMock(mc)
	s.converter = mocks.NewConverterMock(mc)
	s.blobs = mocks.NewBlobStoreMock(mc)
	s.svc = service.New(service.Config{
		Queue:     s.queue,
		Catalog:   s.catalog,
		Converter: s.converter,
		Blobs:     s.blobs,
		IDGen:     func() string { return "id" },
	})
	s.ctx = s.T().Context()
	s.saved = nil
	s.queue.SaveJobMock.Set(func(_ context.Context, j domain.Job) error {
		s.saved = append(s.saved, j)
		return nil
	})
}

// TestUnlocksTargetOnConversionFailure is the regression check for the MINOR
// fix in this branch's final review: process_job.go used to release the
// reconciler's target claim only on success, leaving a failed conversion
// holding it for the full TTL — silently disagreeing with
// ReconcileMissingArtifacts, which releases on a submit failure so the
// reconciler can retry right away. ProcessJob must now do the same on a
// conversion failure.
func (s *ProcessJobSuite) TestUnlocksTargetOnConversionFailure() {
	job := domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.GetJobMock.Return(job, nil)
	s.catalog.GetTargetMock.Return(domain.ConversionTarget{}, errors.New("catalog down"))
	// QueueMock.UnlockTargetMock.Return sets a default expectation the
	// controller requires to be called at least once (see
	// QueueMock.MinimockUnlockTargetInspect) — this is what makes the
	// assertion, not just a stub.
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.ErrorContains(s.T(), err, "catalog down")
	assert.Assert(s.T(), len(s.saved) > 0)
	assert.Equal(s.T(), s.saved[len(s.saved)-1].Status, domain.JobStatusFailed)
}

// stubConversion stubs everything one successful model conversion needs: a
// ZIP holding a single .obj, a converter that returns one LOD, and a blob
// store that accepts the artifact. Models carry no placements, so the
// rescale pass is a no-op and needs no catalog stub.
func (s *ProcessJobSuite) stubConversion() {
	s.queue.GetJobMock.Return(domain.Job{ID: "job-1", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending}, nil)
	s.blobs.GetMock.Set(func(context.Context, string) (io.ReadCloser, blobstore.Blob, error) {
		return io.NopCloser(bytes.NewReader(objZip(s.T()))), blobstore.Blob{}, nil
	})
	s.converter.ConvertLODsMock.Return([]domain.ConversionResult{{ArtifactHash: "lod0"}}, nil)
	s.blobs.PutMock.Return(blobstore.Blob{}, nil)
	s.catalog.RegisterArtifactMock.Return(nil)
	s.queue.UnlockTargetMock.Return(nil)
}

// stubSourceHashes answers GetTarget with hashes in order, repeating the last.
func (s *ProcessJobSuite) stubSourceHashes(hashes ...string) {
	call := 0
	s.catalog.GetTargetMock.Set(func(context.Context, domain.Kind, string) (domain.ConversionTarget, error) {
		h := hashes[min(call, len(hashes)-1)]
		call++
		return domain.ConversionTarget{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: h}, nil
	})
}

func objZip(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("mesh.obj")
	assert.NilError(t, err)
	_, err = w.Write([]byte("v 0 0 0\n"))
	assert.NilError(t, err)
	assert.NilError(t, zw.Close())
	return buf.Bytes()
}

func (s *ProcessJobSuite) TestDoesNotReQueueWhenTheSourceIsUnchanged() {
	s.stubConversion()
	s.stubSourceHashes("h1")
	// TryLockTarget and EnqueueJob are unmocked: a second SubmitConversion
	// would reach them and fail the test.

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.saved[len(s.saved)-1].Status, domain.JobStatusSucceeded)
}

// A replace-source landing mid-conversion used to vanish: SubmitConversion
// hands the in-flight job back, that job publishes artifacts built from the
// old bytes, and HasLOD0 then stops the reconciler ever retrying.
func (s *ProcessJobSuite) TestReQueuesWhenTheSourceWasReplacedMidConversion() {
	s.stubConversion()
	s.stubSourceHashes("h1", "h2")
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "id").Return(nil)

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.NilError(s.T(), err)
	last := s.saved[len(s.saved)-1]
	assert.Equal(s.T(), last.ID, "id")
	assert.Equal(s.T(), last.Status, domain.JobStatusPending)
	assert.Equal(s.T(), s.saved[len(s.saved)-2].Status, domain.JobStatusSucceeded)
}

func (s *ProcessJobSuite) TestDoesNotReQueueATargetDeletedMidConversion() {
	s.stubConversion()
	call := 0
	s.catalog.GetTargetMock.Set(func(context.Context, domain.Kind, string) (domain.ConversionTarget, error) {
		call++
		if call > 1 {
			return domain.ConversionTarget{}, domain.ErrTargetNotFound
		}
		return domain.ConversionTarget{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h1"}, nil
	})

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.saved[len(s.saved)-1].Status, domain.JobStatusSucceeded)
}
