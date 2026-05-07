package service_test

import (
	"bytes"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

type UploadsJobsSuite struct {
	suite.Suite
	upload *fakeUpload
	mesh   *fakeMesh
	svc    *service.Gateway
}

func TestUploadsJobsSuite(t *testing.T) {
	suite.Run(t, new(UploadsJobsSuite))
}

func (s *UploadsJobsSuite) SetupTest() {
	s.upload = &fakeUpload{
		InitiateResult: domain.UploadSession{ID: "sess-1", Size: 100, ContentType: "application/zip"},
		WriteResult:    25,
		StatusResult:   domain.UploadSession{ID: "sess-1", Size: 100, Offset: 25},
		FinalizeResult: domain.FinalizedBlob{Hash: "abc", Size: 100},
	}
	s.mesh = newFakeMesh()
	s.svc = service.New(newFakeCatalog(), s.mesh, s.upload)
}

func (s *UploadsJobsSuite) TestInitiateRejectsZeroSize() {
	_, err := s.svc.InitiateUpload(s.T().Context(), 0, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestInitiateRejectsNegativeSize() {
	_, err := s.svc.InitiateUpload(s.T().Context(), -1, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestInitiateForwardsToUploadService() {
	out, err := s.svc.InitiateUpload(s.T().Context(), 100, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.ID, "sess-1")
	assert.Equal(s.T(), s.upload.LastInitiateSize, int64(100))
	assert.Equal(s.T(), s.upload.LastInitiateContentType, "application/zip")
}

func (s *UploadsJobsSuite) TestAppendChunkRejectsEmptyID() {
	_, err := s.svc.AppendUploadChunk(s.T().Context(), "", 0, bytes.NewReader(nil))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestAppendChunkRejectsNegativeOffset() {
	_, err := s.svc.AppendUploadChunk(s.T().Context(), "sess-1", -1, bytes.NewReader(nil))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestAppendChunkForwards() {
	off, err := s.svc.AppendUploadChunk(s.T().Context(), "sess-1", 5, bytes.NewReader([]byte("hi")))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(25))
	assert.Equal(s.T(), s.upload.LastWriteID, "sess-1")
	assert.Equal(s.T(), s.upload.LastWriteOffset, int64(5))
}

func (s *UploadsJobsSuite) TestStatusRejectsEmptyID() {
	_, err := s.svc.GetUploadStatus(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestFinalizeRejectsEmptyID() {
	_, err := s.svc.FinalizeUpload(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestFinalizeForwards() {
	out, err := s.svc.FinalizeUpload(s.T().Context(), "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "abc")
	assert.Equal(s.T(), s.upload.LastFinalizeID, "sess-1")
}

func (s *UploadsJobsSuite) TestAbortIsNoOpOnEmptyID() {
	// tus DELETE is documented as idempotent — empty ID should not be an
	// error and should not reach the upload-service.
	err := s.svc.AbortUpload(s.T().Context(), "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.upload.LastAbortID, "")
}

func (s *UploadsJobsSuite) TestAbortForwardsValidID() {
	assert.NilError(s.T(), s.svc.AbortUpload(s.T().Context(), "sess-1"))
	assert.Equal(s.T(), s.upload.LastAbortID, "sess-1")
}

func (s *UploadsJobsSuite) TestGetJobRejectsEmptyID() {
	_, err := s.svc.GetJob(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestGetJobReturnsKnown() {
	s.mesh.GetByID["job-7"] = domain.Job{ID: "job-7", Status: domain.JobStatusSucceeded}
	got, err := s.svc.GetJob(s.T().Context(), "job-7")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Status, domain.JobStatusSucceeded)
}

func (s *UploadsJobsSuite) TestGetJobReturnsNotFound() {
	_, err := s.svc.GetJob(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
}
