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

type InitiateSuite struct {
	suite.Suite
	store *mocks.SessionStoreMock
	blobs *mocks.BlobsMock
	svc   *service.Upload
	ctx   context.Context
}

func TestInitiateSuite(t *testing.T) {
	suite.Run(t, new(InitiateSuite))
}

func (s *InitiateSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewSessionStoreMock(mc)
	s.blobs = mocks.NewBlobsMock(mc)
	s.svc = service.New(service.Config{
		Store:          s.store,
		Blobs:          s.blobs,
		MaxUploadBytes: 1024,
		IDGen:          func() string { return "fixed-id" },
	})
	s.ctx = s.T().Context()
}

func (s *InitiateSuite) TestRejectsZeroSize() {
	_, err := s.svc.Initiate(s.ctx, 0, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *InitiateSuite) TestRejectsNegativeSize() {
	_, err := s.svc.Initiate(s.ctx, -1, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *InitiateSuite) TestRejectsSizeAboveCap() {
	_, err := s.svc.Initiate(s.ctx, 2048, "application/zip")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *InitiateSuite) TestAcceptsExactlyMaxSize() {
	s.store.InitiateMock.Expect(s.ctx, "fixed-id", int64(1024), "application/zip").
		Return(domain.Session{ID: "fixed-id", Size: 1024}, nil)
	sess, err := s.svc.Initiate(s.ctx, 1024, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.Size, int64(1024))
}

func (s *InitiateSuite) TestAcceptsAnySizeWhenCapDisabled() {
	s.svc = service.New(service.Config{
		Store: s.store, Blobs: s.blobs, MaxUploadBytes: 0, // 0 means no cap
		IDGen: func() string { return "fixed-id" },
	})
	s.store.InitiateMock.Expect(s.ctx, "fixed-id", int64(9_999_999), "application/zip").
		Return(domain.Session{ID: "fixed-id", Size: 9_999_999}, nil)
	sess, err := s.svc.Initiate(s.ctx, 9_999_999, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.Size, int64(9_999_999))
}

func (s *InitiateSuite) TestUsesIDGenerator() {
	s.store.InitiateMock.Expect(s.ctx, "fixed-id", int64(100), "application/zip").
		Return(domain.Session{ID: "fixed-id"}, nil)
	sess, err := s.svc.Initiate(s.ctx, 100, "application/zip")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.ID, "fixed-id")
}

func (s *InitiateSuite) TestForwardsContentType() {
	s.store.InitiateMock.Expect(s.ctx, "fixed-id", int64(100), "application/x-zip-compressed").
		Return(domain.Session{ContentType: "application/x-zip-compressed"}, nil)
	sess, err := s.svc.Initiate(s.ctx, 100, "application/x-zip-compressed")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sess.ContentType, "application/x-zip-compressed")
}

func (s *InitiateSuite) TestPropagatesStoreError() {
	s.store.InitiateMock.Return(domain.Session{}, errors.New("disk full"))
	_, err := s.svc.Initiate(s.ctx, 100, "application/zip")
	assert.ErrorContains(s.T(), err, "disk full")
}
