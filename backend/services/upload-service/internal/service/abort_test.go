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
	err := s.svc.Abort(s.ctx, author, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

// tus DELETE is idempotent: a session already gone is not an error, and there
// is nothing left to remove.
func (s *AbortStatusSuite) TestAbortIsIdempotentOnUnknownID() {
	s.store.GetStatusMock.Expect(s.ctx, "missing").Return(domain.Session{}, domain.ErrSessionNotFound)
	err := s.svc.Abort(s.ctx, author, "missing")
	assert.NilError(s.T(), err)
}

func (s *AbortStatusSuite) TestAbortRemovesOwnSession() {
	stubSession(s.ctx, s.store, "sess-1", author, 100, 5)
	s.store.AbortMock.Expect(s.ctx, "sess-1").Return(nil)
	assert.NilError(s.T(), s.svc.Abort(s.ctx, author, "sess-1"))
}

// Another user's session is left alone and answered as missing; the store's
// Abort is never reached (minimock fails on an unexpected call).
func (s *AbortStatusSuite) TestAbortRefusesAnotherAuthorsSession() {
	stubSession(s.ctx, s.store, "sess-1", author, 100, 5)
	err := s.svc.Abort(s.ctx, stranger, "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusRejectsEmptyID() {
	_, err := s.svc.GetStatus(s.ctx, author, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusReturnsNotFoundForUnknown() {
	s.store.GetStatusMock.Expect(s.ctx, "missing").Return(domain.Session{}, domain.ErrSessionNotFound)
	_, err := s.svc.GetStatus(s.ctx, author, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusReportsCurrentOffset() {
	stubSession(s.ctx, s.store, "sess-1", author, 100, 5)
	got, err := s.svc.GetStatus(s.ctx, author, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Offset, int64(5))
	assert.Equal(s.T(), got.Size, int64(100))
}

func (s *AbortStatusSuite) TestGetStatusHidesAnotherAuthorsSession() {
	stubSession(s.ctx, s.store, "sess-1", author, 100, 5)
	_, err := s.svc.GetStatus(s.ctx, stranger, "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

// A session written before sessions carried an author belongs to nobody, so
// nobody may resume it. Failing closed costs one re-upload at deploy time.
func (s *AbortStatusSuite) TestGetStatusHidesASessionWithoutAuthor() {
	stubSession(s.ctx, s.store, "sess-1", "", 100, 5)
	_, err := s.svc.GetStatus(s.ctx, author, "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

// A caller without an identity owns nothing, not the sessions that have none.
func (s *AbortStatusSuite) TestGetStatusRefusesACallerWithoutIdentity() {
	stubSession(s.ctx, s.store, "sess-1", "", 100, 5)
	_, err := s.svc.GetStatus(s.ctx, "", "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}
