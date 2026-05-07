package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
)

type WriteChunkSuite struct {
	suite.Suite
	store *fakeStore
	svc   *service.Upload
}

func TestWriteChunkSuite(t *testing.T) {
	suite.Run(t, new(WriteChunkSuite))
}

func (s *WriteChunkSuite) SetupTest() {
	s.store = newFakeStore()
	s.svc = service.New(service.Config{
		Store: s.store,
		Blobs: &fakeBlobs{},
		IDGen: func() string { return "sess-1" },
	})
	_, err := s.svc.Initiate(s.T().Context(), 100, "application/zip")
	assert.NilError(s.T(), err)
}

func (s *WriteChunkSuite) TestRejectsEmptyID() {
	_, err := s.svc.WriteChunk(s.T().Context(), "", 0, []byte("x"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *WriteChunkSuite) TestRejectsUnknownID() {
	_, err := s.svc.WriteChunk(s.T().Context(), "missing", 0, []byte("x"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *WriteChunkSuite) TestAppendsAtCorrectOffset() {
	off, err := s.svc.WriteChunk(s.T().Context(), "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(5))
}

func (s *WriteChunkSuite) TestRejectsOutOfOrderOffset() {
	_, err := s.svc.WriteChunk(s.T().Context(), "sess-1", 10, []byte("x"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrOffsetMismatch))
}

func (s *WriteChunkSuite) TestRejectsWriteBeyondDeclaredSize() {
	_, err := s.svc.WriteChunk(s.T().Context(), "sess-1", 0, make([]byte, 200))
	assert.Assert(s.T(), errors.Is(err, domain.ErrSizeExceeded))
}

func (s *WriteChunkSuite) TestSequentialWritesAccumulateOffset() {
	ctx := s.T().Context()
	off, err := s.svc.WriteChunk(ctx, "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(5))

	off, err = s.svc.WriteChunk(ctx, "sess-1", 5, []byte(" world"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(11))
}
