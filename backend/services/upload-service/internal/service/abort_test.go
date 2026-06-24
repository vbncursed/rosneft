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

type AbortStatusSuite struct {
	suite.Suite
	store *mocks.SessionStoreMock
	svc   *service.Upload
	ctx   context.Context
}

func TestAbortStatusSuite(t *testing.T) {
	suite.Run(t, new(AbortStatusSuite))
}

func (s *AbortStatusSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewSessionStoreMock(mc)
	s.svc = service.New(service.Config{Store: s.store, Blobs: mocks.NewBlobsMock(mc)})
	s.ctx = s.T().Context()
}

func (s *AbortStatusSuite) TestAbortRejectsEmptyID() {
	err := s.svc.Abort(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestAbortIsIdempotentOnUnknownID() {
	// store.Abort is delete-or-noop, so an unknown id is not an error.
	s.store.AbortMock.Expect(s.ctx, "missing").Return(nil)
	err := s.svc.Abort(s.ctx, "missing")
	assert.NilError(s.T(), err)
}

func (s *AbortStatusSuite) TestAbortRemovesExisting() {
	s.store.AbortMock.Expect(s.ctx, "sess-1").Return(nil)
	assert.NilError(s.T(), s.svc.Abort(s.ctx, "sess-1"))
}

func (s *AbortStatusSuite) TestGetStatusRejectsEmptyID() {
	_, err := s.svc.GetStatus(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusReturnsNotFoundForUnknown() {
	s.store.GetStatusMock.Expect(s.ctx, "missing").Return(domain.Session{}, domain.ErrSessionNotFound)
	_, err := s.svc.GetStatus(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusReportsCurrentOffset() {
	s.store.GetStatusMock.Expect(s.ctx, "sess-1").
		Return(domain.Session{ID: "sess-1", Offset: 5, Size: 100}, nil)
	got, err := s.svc.GetStatus(s.ctx, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Offset, int64(5))
	assert.Equal(s.T(), got.Size, int64(100))
}
