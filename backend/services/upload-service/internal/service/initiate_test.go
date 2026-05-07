package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
)

type InitiateSuite struct {
	suite.Suite
	store *fakeStore
	blobs *fakeBlobs
	svc   *service.Upload
}

func TestInitiateSuite(t *testing.T) {
	suite.Run(t, new(InitiateSuite))
}

func (s *InitiateSuite) SetupTest() {
	s.store = newFakeStore()
	s.blobs = &fakeBlobs{}
	s.svc = service.New(service.Config{
		Store:          s.store,
		Blobs:          s.blobs,
		MaxUploadBytes: 1024,
		IDGen:          func() string { return "fixed-id" },
	})
}

func (s *InitiateSuite) TestRejectsZeroSize() {
	_, err := s.svc.Initiate(s.T().Context(), 0, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *InitiateSuite) TestRejectsNegativeSize() {
	_, err := s.svc.Initiate(s.T().Context(), -1, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *InitiateSuite) TestRejectsSizeAboveCap() {
	_, err := s.svc.Initiate(s.T().Context(), 2048, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *InitiateSuite) TestAcceptsExactlyMaxSize() {
	sess, err := s.svc.Initiate(s.T().Context(), 1024, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.Size, int64(1024))
}

func (s *InitiateSuite) TestAcceptsAnySizeWhenCapDisabled() {
	s.svc = service.New(service.Config{
		Store:          s.store,
		Blobs:          s.blobs,
		MaxUploadBytes: 0, // 0 means no cap
		IDGen:          func() string { return "fixed-id" },
	})
	sess, err := s.svc.Initiate(s.T().Context(), 9_999_999, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.Size, int64(9_999_999))
}

func (s *InitiateSuite) TestUsesIDGenerator() {
	sess, err := s.svc.Initiate(s.T().Context(), 100, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.ID, "fixed-id")
}

func (s *InitiateSuite) TestForwardsContentType() {
	sess, err := s.svc.Initiate(s.T().Context(), 100, "application/x-zip-compressed")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.ContentType, "application/x-zip-compressed")
}

func (s *InitiateSuite) TestPropagatesStoreError() {
	s.store.ErrInitiate = errors.New("disk full")
	_, err := s.svc.Initiate(s.T().Context(), 100, "application/zip")
	assert.ErrorContains(s.T(), err, "disk full")
}
