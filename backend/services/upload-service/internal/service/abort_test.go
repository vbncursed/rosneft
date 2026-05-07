package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
)

type AbortStatusSuite struct {
	suite.Suite
	store *fakeStore
	svc   *service.Upload
}

func TestAbortStatusSuite(t *testing.T) {
	suite.Run(t, new(AbortStatusSuite))
}

func (s *AbortStatusSuite) SetupTest() {
	s.store = newFakeStore()
	s.svc = service.New(service.Config{
		Store: s.store,
		Blobs: &fakeBlobs{},
		IDGen: func() string { return "sess-1" },
	})
}

func (s *AbortStatusSuite) TestAbortRejectsEmptyID() {
	err := s.svc.Abort(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestAbortIsIdempotentOnUnknownID() {
	// The store's Abort is a delete-or-noop, so the service does not care
	// that the session does not exist (the contract is documented as
	// idempotent in abort.go).
	err := s.svc.Abort(s.T().Context(), "missing")
	assert.NilError(s.T(), err)
}

func (s *AbortStatusSuite) TestAbortRemovesExisting() {
	ctx := s.T().Context()
	_, err := s.svc.Initiate(ctx, 100, "application/zip")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.svc.Abort(ctx, "sess-1"))

	_, err = s.svc.GetStatus(ctx, "sess-1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusRejectsEmptyID() {
	_, err := s.svc.GetStatus(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusReturnsNotFoundForUnknown() {
	_, err := s.svc.GetStatus(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrSessionNotFound))
}

func (s *AbortStatusSuite) TestGetStatusReportsCurrentOffset() {
	ctx := s.T().Context()
	_, err := s.svc.Initiate(ctx, 100, "application/zip")
	assert.NilError(s.T(), err)
	_, err = s.svc.WriteChunk(ctx, "sess-1", 0, []byte("12345"))
	assert.NilError(s.T(), err)

	got, err := s.svc.GetStatus(ctx, "sess-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Offset, int64(5))
	assert.Equal(s.T(), got.Size, int64(100))
}
