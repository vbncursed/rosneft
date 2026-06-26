package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type DocumentsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestDocumentsSuite(t *testing.T) {
	suite.Run(t, new(DocumentsSuite))
}

func (s *DocumentsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *DocumentsSuite) TestCreateRejectsMissingTitle() {
	_, err := s.svc.CreateDocument(s.ctx, domain.Document{TerritorySlug: "site-a", SourceBlobHash: "abc"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *DocumentsSuite) TestCreateRejectsMissingBlobHash() {
	_, err := s.svc.CreateDocument(s.ctx, domain.Document{TerritorySlug: "site-a", Title: "Spec"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *DocumentsSuite) TestCreatePersistsValid() {
	in := domain.Document{TerritorySlug: "site-a", Title: "Spec", SourceBlobHash: "abc"}
	want := domain.Document{ID: 7, TerritorySlug: "site-a", Title: "Spec", SourceBlobHash: "abc"}
	s.repo.CreateDocumentMock.Expect(minimock.AnyContext, in).Return(want, nil)

	got, err := s.svc.CreateDocument(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), want, got)
}

func (s *DocumentsSuite) TestListRejectsEmptySlug() {
	_, err := s.svc.ListDocuments(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *DocumentsSuite) TestListDelegates() {
	want := []domain.Document{{ID: 1, TerritorySlug: "site-a", Title: "Spec"}}
	s.repo.ListDocumentsMock.Expect(minimock.AnyContext, "site-a").Return(want, nil)

	got, err := s.svc.ListDocuments(s.ctx, "site-a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), want, got)
}

func (s *DocumentsSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeleteDocument(s.ctx, 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *DocumentsSuite) TestDeleteDelegates() {
	s.repo.DeleteDocumentMock.Expect(minimock.AnyContext, int64(7)).Return(nil)
	err := s.svc.DeleteDocument(s.ctx, 7)
	assert.NilError(s.T(), err)
}
