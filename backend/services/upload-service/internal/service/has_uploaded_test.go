package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service/mocks"
)

type HasUploadedSuite struct {
	suite.Suite
	store *mocks.SessionStoreMock
	svc   *service.Upload
	ctx   context.Context
}

func TestHasUploadedSuite(t *testing.T) { suite.Run(t, new(HasUploadedSuite)) }

func (s *HasUploadedSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewSessionStoreMock(mc)
	s.svc = service.New(service.Config{Store: s.store, Blobs: mocks.NewBlobsMock(mc)})
	s.ctx = s.T().Context()
}

func (s *HasUploadedSuite) TestAsksTheStoreForThisAuthor() {
	s.store.HasUploadMock.Expect(s.ctx, "cafef00d", author).Return(true, nil)
	got, err := s.svc.HasUploaded(s.ctx, author, "cafef00d")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got)
}

// No identity, no uploads: the store is not even asked.
func (s *HasUploadedSuite) TestACallerWithoutIdentityUploadedNothing() {
	got, err := s.svc.HasUploaded(s.ctx, "", "cafef00d")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !got)
}

func (s *HasUploadedSuite) TestAnEmptyHashWasNeverUploaded() {
	got, err := s.svc.HasUploaded(s.ctx, author, "")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !got)
}

func (s *HasUploadedSuite) TestPropagatesStoreError() {
	s.store.HasUploadMock.Return(false, errors.New("io error"))
	_, err := s.svc.HasUploaded(s.ctx, author, "cafef00d")
	assert.ErrorContains(s.T(), err, "io error")
}
