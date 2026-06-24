package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service/mocks"
)

// WriteChunk forwards to SessionStore.AppendChunk; offset tracking, mismatch,
// and size-overflow are the store's contract, so each test stubs the store's
// answer for the call the service makes.
type WriteChunkSuite struct {
	suite.Suite
	store *mocks.SessionStoreMock
	svc   *service.Upload
	ctx   context.Context
}

func TestWriteChunkSuite(t *testing.T) {
	suite.Run(t, new(WriteChunkSuite))
}

func (s *WriteChunkSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewSessionStoreMock(mc)
	s.svc = service.New(service.Config{Store: s.store, Blobs: mocks.NewBlobsMock(mc)})
	s.ctx = s.T().Context()
}

func (s *WriteChunkSuite) TestRejectsEmptyID() {
	_, err := s.svc.WriteChunk(s.ctx, "", 0, []byte("x"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *WriteChunkSuite) TestRejectsUnknownID() {
	s.store.AppendChunkMock.Expect(s.ctx, "missing", int64(0), []byte("x")).
		Return(int64(0), domain.ErrSessionNotFound)
	_, err := s.svc.WriteChunk(s.ctx, "missing", 0, []byte("x"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *WriteChunkSuite) TestAppendsAtCorrectOffset() {
	s.store.AppendChunkMock.Expect(s.ctx, "sess-1", int64(0), []byte("hello")).Return(int64(5), nil)
	off, err := s.svc.WriteChunk(s.ctx, "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(5))
}

func (s *WriteChunkSuite) TestRejectsOutOfOrderOffset() {
	s.store.AppendChunkMock.Expect(s.ctx, "sess-1", int64(10), []byte("x")).
		Return(int64(0), domain.ErrOffsetMismatch)
	_, err := s.svc.WriteChunk(s.ctx, "sess-1", 10, []byte("x"))
	assert.Assert(s.T(), errors.Is(err, domain.ErrOffsetMismatch))
}

func (s *WriteChunkSuite) TestRejectsWriteBeyondDeclaredSize() {
	s.store.AppendChunkMock.Expect(s.ctx, "sess-1", int64(0), make([]byte, 200)).
		Return(int64(0), domain.ErrSizeExceeded)
	_, err := s.svc.WriteChunk(s.ctx, "sess-1", 0, make([]byte, 200))
	assert.Assert(s.T(), errors.Is(err, domain.ErrSizeExceeded))
}

func (s *WriteChunkSuite) TestSequentialWritesAccumulateOffset() {
	s.store.AppendChunkMock.When(s.ctx, "sess-1", int64(0), []byte("hello")).Then(int64(5), nil)
	s.store.AppendChunkMock.When(s.ctx, "sess-1", int64(5), []byte(" world")).Then(int64(11), nil)

	off, err := s.svc.WriteChunk(s.ctx, "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(5))

	off, err = s.svc.WriteChunk(s.ctx, "sess-1", 5, []byte(" world"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), off, int64(11))
}
