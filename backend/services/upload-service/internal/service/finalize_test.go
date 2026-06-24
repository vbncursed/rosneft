package service_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service/mocks"
)

type FinalizeSuite struct {
	suite.Suite
	store *mocks.SessionStoreMock
	blobs *mocks.BlobsMock
	svc   *service.Upload
	ctx   context.Context
}

func TestFinalizeSuite(t *testing.T) {
	suite.Run(t, new(FinalizeSuite))
}

func (s *FinalizeSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewSessionStoreMock(mc)
	s.blobs = mocks.NewBlobsMock(mc)
	s.svc = service.New(service.Config{Store: s.store, Blobs: s.blobs})
	s.ctx = s.T().Context()
}

// completeSession answers GetStatus with a finished 5-byte session.
func (s *FinalizeSuite) completeSession() {
	s.store.GetStatusMock.Expect(s.ctx, "sess-1").
		Return(domain.Session{ID: "sess-1", Size: 5, Offset: 5, ContentType: "application/zip"}, nil)
}

// finalizeYields stubs store.Finalize to invoke the publish callback (the only
// way to exercise the blobs.Put wiring — putBlob is a func arg, unmatchable).
func (s *FinalizeSuite) finalizeYields(hash string, size int64) {
	s.store.FinalizeMock.Set(func(ctx context.Context, _ string, putBlob func(context.Context, string, io.Reader) error) (string, int64, error) {
		if err := putBlob(ctx, hash, bytes.NewReader(nil)); err != nil {
			return "", 0, err
		}
		return hash, size, nil
	})
}

func (s *FinalizeSuite) TestRejectsEmptyID() {
	_, err := s.svc.Finalize(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *FinalizeSuite) TestRejectsUnknownID() {
	s.store.GetStatusMock.Expect(s.ctx, "missing").Return(domain.Session{}, domain.ErrSessionNotFound)
	_, err := s.svc.Finalize(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *FinalizeSuite) TestRejectsIncompleteSession() {
	// Declared 5 bytes, nothing written → Finalize must refuse a partial blob.
	s.store.GetStatusMock.Expect(s.ctx, "sess-1").
		Return(domain.Session{ID: "sess-1", Size: 5, Offset: 0}, nil)
	_, err := s.svc.Finalize(s.ctx, "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *FinalizeSuite) TestSucceedsOnCompleteSession() {
	s.completeSession()
	s.finalizeYields("cafef00d", 5)
	s.blobs.PutMock.Return(blobstore.Blob{Hash: "cafef00d"}, nil)

	out, err := s.svc.Finalize(s.ctx, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "cafef00d")
	assert.Equal(s.T(), out.Size, int64(5))
}

func (s *FinalizeSuite) TestForwardsContentTypeToBlobStore() {
	s.completeSession()
	s.finalizeYields("cafef00d", 5)
	s.blobs.PutMock.Inspect(func(_ context.Context, hash, contentType string, _ io.Reader) {
		assert.Equal(s.T(), hash, "cafef00d")
		assert.Equal(s.T(), contentType, "application/zip")
	}).Return(blobstore.Blob{}, nil)

	_, err := s.svc.Finalize(s.ctx, "sess-1")
	assert.NilError(s.T(), err)
}

func (s *FinalizeSuite) TestPropagatesBlobStoreError() {
	s.completeSession()
	s.finalizeYields("cafef00d", 5)
	s.blobs.PutMock.Return(blobstore.Blob{}, errors.New("blob store down"))

	_, err := s.svc.Finalize(s.ctx, "sess-1")
	assert.ErrorContains(s.T(), err, "blob store down")
}
