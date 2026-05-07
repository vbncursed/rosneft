package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
)

type FinalizeSuite struct {
	suite.Suite
	store *fakeStore
	blobs *fakeBlobs
	svc   *service.Upload
}

func TestFinalizeSuite(t *testing.T) {
	suite.Run(t, new(FinalizeSuite))
}

func (s *FinalizeSuite) SetupTest() {
	s.store = newFakeStore()
	s.store.FinalizeHash = "cafef00d"
	s.blobs = &fakeBlobs{}
	s.svc = service.New(service.Config{
		Store: s.store,
		Blobs: s.blobs,
		IDGen: func() string { return "sess-1" },
	})
	_, err := s.svc.Initiate(s.T().Context(), 5, "application/zip")
	assert.NilError(s.T(), err)
}

func (s *FinalizeSuite) TestRejectsEmptyID() {
	_, err := s.svc.Finalize(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *FinalizeSuite) TestRejectsUnknownID() {
	_, err := s.svc.Finalize(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *FinalizeSuite) TestRejectsIncompleteSession() {
	// Session declared 5 bytes but no chunks were written — Finalize must
	// refuse to publish a partial blob.
	_, err := s.svc.Finalize(s.T().Context(), "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *FinalizeSuite) TestSucceedsOnCompleteSession() {
	ctx := s.T().Context()
	_, err := s.svc.WriteChunk(ctx, "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)

	out, err := s.svc.Finalize(ctx, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "cafef00d")
	assert.Equal(s.T(), out.Size, int64(5))
}

func (s *FinalizeSuite) TestForwardsContentTypeToBlobStore() {
	ctx := s.T().Context()
	_, err := s.svc.WriteChunk(ctx, "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)
	_, err = s.svc.Finalize(ctx, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.blobs.LastContentType, "application/zip")
	assert.Equal(s.T(), s.blobs.LastHash, "cafef00d")
}

func (s *FinalizeSuite) TestPropagatesBlobStoreError() {
	ctx := s.T().Context()
	_, err := s.svc.WriteChunk(ctx, "sess-1", 0, []byte("hello"))
	assert.NilError(s.T(), err)

	s.blobs.ErrPut = errors.New("blob store down")
	_, err = s.svc.Finalize(ctx, "sess-1")
	assert.ErrorContains(s.T(), err, "blob store down")
}
