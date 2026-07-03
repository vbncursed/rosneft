package service_test

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type UploadsJobsSuite struct {
	suite.Suite
	upload *mocks.UploadMock
	mesh   *mocks.MeshMock
	svc    *service.Gateway
	ctx    context.Context
}

func TestUploadsJobsSuite(t *testing.T) {
	suite.Run(t, new(UploadsJobsSuite))
}

func (s *UploadsJobsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.upload = mocks.NewUploadMock(mc)
	s.mesh = mocks.NewMeshMock(mc)
	s.svc = service.New(mocks.NewCatalogMock(mc), mocks.NewContentMock(mc), s.mesh, s.upload)
	s.ctx = s.T().Context()
}

func (s *UploadsJobsSuite) TestInitiateRejectsZeroSize() {
	_, err := s.svc.InitiateUpload(s.ctx, 0, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestInitiateRejectsNegativeSize() {
	_, err := s.svc.InitiateUpload(s.ctx, -1, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestInitiateForwardsToUploadService() {
	s.upload.InitiateMock.Expect(s.ctx, int64(100), "application/zip").
		Return(domain.UploadSession{ID: "sess-1", Size: 100, ContentType: "application/zip"}, nil)
	out, err := s.svc.InitiateUpload(s.ctx, 100, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.ID, "sess-1")
}

func (s *UploadsJobsSuite) TestAppendChunkRejectsEmptyID() {
	_, err := s.svc.AppendUploadChunk(s.ctx, "", 0, bytes.NewReader(nil))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestAppendChunkRejectsNegativeOffset() {
	_, err := s.svc.AppendUploadChunk(s.ctx, "sess-1", -1, bytes.NewReader(nil))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestAppendChunkForwards() {
	body := bytes.NewReader([]byte("hi"))
	s.upload.WriteChunkMock.Expect(s.ctx, "sess-1", int64(5), body).Return(int64(25), nil)
	off, err := s.svc.AppendUploadChunk(s.ctx, "sess-1", 5, body)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(25))
}

func (s *UploadsJobsSuite) TestStatusRejectsEmptyID() {
	_, err := s.svc.GetUploadStatus(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestFinalizeRejectsEmptyID() {
	_, err := s.svc.FinalizeUpload(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestFinalizeForwards() {
	s.upload.FinalizeMock.Expect(s.ctx, "sess-1").Return(domain.FinalizedBlob{Hash: "abc", Size: 100}, nil)
	out, err := s.svc.FinalizeUpload(s.ctx, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "abc")
}

func (s *UploadsJobsSuite) TestAbortIsNoOpOnEmptyID() {
	// tus DELETE is documented as idempotent — empty ID should not be an error
	// and should not reach the upload-service (AbortMock is left unmocked).
	err := s.svc.AbortUpload(s.ctx, "")
	assert.NilError(s.T(), err)
}

func (s *UploadsJobsSuite) TestAbortForwardsValidID() {
	s.upload.AbortMock.Expect(s.ctx, "sess-1").Return(nil)
	assert.NilError(s.T(), s.svc.AbortUpload(s.ctx, "sess-1"))
}

func (s *UploadsJobsSuite) TestGetJobRejectsEmptyID() {
	_, err := s.svc.GetJob(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *UploadsJobsSuite) TestGetJobReturnsKnown() {
	s.mesh.GetJobMock.Expect(s.ctx, "job-7").Return(domain.Job{ID: "job-7", Status: domain.JobStatusSucceeded}, nil)
	got, err := s.svc.GetJob(s.ctx, "job-7")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Status, domain.JobStatusSucceeded)
}

func (s *UploadsJobsSuite) TestGetJobReturnsNotFound() {
	s.mesh.GetJobMock.Expect(s.ctx, "missing").Return(domain.Job{}, domain.ErrJobNotFound)
	_, err := s.svc.GetJob(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
}
