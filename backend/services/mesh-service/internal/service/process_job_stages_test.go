package service_test

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// stubTargetWithHash loads a pending territory job whose target has hash.
func (s *ProcessJobSuite) stubTargetWithHash(hash string) {
	s.queue.GetJobMock.Return(
		domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending},
		nil,
	)
	s.catalog.GetTargetMock.Return(domain.ConversionTarget{SourceBlobHash: hash}, nil)
	s.queue.UnlockTargetMock.Return(nil)
}

func (s *ProcessJobSuite) lastSaved() domain.Job {
	s.T().Helper()
	last := s.saved[len(s.saved)-1]
	assert.Equal(s.T(), last.Status, domain.JobStatusFailed)
	return last
}

func (s *ProcessJobSuite) serveZip(body []byte) {
	s.blobs.GetMock.Set(func(context.Context, string) (io.ReadCloser, blobstore.Blob, error) {
		return io.NopCloser(bytes.NewReader(body)), blobstore.Blob{}, nil
	})
}

func (s *ProcessJobSuite) TestTargetNotFoundPassesThroughUnwrapped() {
	s.stubTargetWithHash("")
	s.catalog.GetTargetMock.Return(domain.ConversionTarget{}, domain.ErrTargetNotFound)

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Equal(s.T(), err, domain.ErrTargetNotFound)
	assert.Equal(s.T(), s.lastSaved().Stage, "fetching")
}

func (s *ProcessJobSuite) TestTargetLookupFailureIsWrapped() {
	s.stubTargetWithHash("")
	s.catalog.GetTargetMock.Return(domain.ConversionTarget{}, errors.New("catalog down"))

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Error(s.T(), err, "get target: catalog down")
}

func (s *ProcessJobSuite) TestTargetWithoutSourceIsABadSourceAndTouchesNoBlob() {
	s.stubTargetWithHash("")

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Assert(s.T(), errors.Is(err, domain.ErrBadSource))
	assert.ErrorContains(s.T(), err, "target has no source_blob_hash")
	assert.Assert(s.T(), s.lastSaved().FailedOnSource)
}

func (s *ProcessJobSuite) TestUnusableTempDirFailsBeforeFetching() {
	s.stubTargetWithHash("h")
	s.T().Setenv("TMPDIR", filepath.Join(s.T().TempDir(), "missing"))

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.ErrorContains(s.T(), err, "tmp dir: ")
	assert.Assert(s.T(), !s.lastSaved().FailedOnSource)
}

func (s *ProcessJobSuite) TestSourceFetchFailureIsWrappedAndStopsAtFetching() {
	s.stubTargetWithHash("h")
	s.blobs.GetMock.Return(nil, blobstore.Blob{}, errors.New("blob down"))

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Error(s.T(), err, "fetch/extract source: blob get: blob down")
	assert.Equal(s.T(), s.lastSaved().Stage, "fetching")
}

func (s *ProcessJobSuite) TestArchiveWithoutObjFailsAfterExtracting() {
	s.stubTargetWithHash("h")
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("readme.txt")
	assert.NilError(s.T(), err)
	_, err = w.Write([]byte("no mesh"))
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), zw.Close())
	s.serveZip(buf.Bytes())

	err = s.svc.ProcessJob(s.ctx, "job-1")

	assert.ErrorContains(s.T(), err, "locate obj: ")
	assert.Equal(s.T(), s.lastSaved().Stage, "extracting")
}

func (s *ProcessJobSuite) TestConverterReturningNothingFails() {
	s.stubTargetWithHash("h")
	s.serveZip(objZip(s.T()))
	s.converter.ConvertLODsMock.Return(nil, nil)

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Error(s.T(), err, "convert: no LOD results")
	assert.Equal(s.T(), s.lastSaved().Stage, "parsing")
}

func (s *ProcessJobSuite) TestConverterErrorIsWrappedAndLeavesNoWorkDir() {
	s.stubTargetWithHash("h")
	s.serveZip(objZip(s.T()))
	var root string
	s.converter.ConvertLODsMock.Set(func(_ context.Context, r, _ string) ([]domain.ConversionResult, error) {
		root = r
		return nil, errors.New("boom")
	})

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Error(s.T(), err, "convert: boom")
	_, statErr := os.Stat(root)
	assert.Assert(s.T(), errors.Is(statErr, os.ErrNotExist), "the work dir must be removed on failure")
}

// The progress ticks a successful two-LOD run saves, in order: the bar moves
// toward 1.0 and ends on "registering" once the job is marked succeeded.
func (s *ProcessJobSuite) TestProgressStagesOfASuccessfulRun() {
	s.stubTerritoryConversion(noErr, func() error { return nil })

	assert.NilError(s.T(), s.svc.ProcessJob(s.ctx, "job-1"))

	stages := make([]string, 0, len(s.saved))
	fractions := make([]float32, 0, len(s.saved))
	for _, j := range s.saved {
		stages = append(stages, j.Stage)
		fractions = append(fractions, j.Progress)
	}
	span := float32(0.30) / float32(2)
	assert.DeepEqual(s.T(), stages, []string{"", "fetching", "extracting", "parsing", "lod-0", "lod-1", "registering"})
	assert.DeepEqual(s.T(), fractions, []float32{0, 0.05, 0.20, 0.30, 0.70 + span*1, 0.70 + span*2, 1.0})
}
