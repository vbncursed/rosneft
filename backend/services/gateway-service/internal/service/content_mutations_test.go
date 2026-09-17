package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// ContentMutationsSuite covers the id-keyed panorama and document mutations:
// content scopes each row by the territory slug, so the gateway must refuse to
// send an empty one and must pass the one it has through unchanged.
type ContentMutationsSuite struct {
	suite.Suite
	content *mocks.ContentMock
	svc     *service.Gateway
	ctx     context.Context
}

func TestContentMutationsSuite(t *testing.T) {
	suite.Run(t, new(ContentMutationsSuite))
}

func (s *ContentMutationsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.content = mocks.NewContentMock(mc)
	s.svc = service.New(mocks.NewCatalogMock(mc), s.content, mocks.NewMeshMock(mc), mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

func (s *ContentMutationsSuite) TestUpdatePanoramaRejectsEmptyTerritory() {
	_, err := s.svc.UpdatePanorama(s.ctx, domain.Panorama{ID: 3, Title: "North"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ContentMutationsSuite) TestUpdatePanoramaForwardsTerritory() {
	p := domain.Panorama{ID: 3, TerritorySlug: "t1", Title: "North"}
	s.content.UpdatePanoramaMock.Expect(s.ctx, p).Return(p, nil)
	_, err := s.svc.UpdatePanorama(s.ctx, p)
	assert.NilError(s.T(), err)
}

func (s *ContentMutationsSuite) TestDeletePanoramaRejectsEmptyTerritory() {
	err := s.svc.DeletePanorama(s.ctx, "", 3)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ContentMutationsSuite) TestDeletePanoramaForwardsTerritory() {
	s.content.DeletePanoramaMock.Expect(s.ctx, "t1", int64(3)).Return(nil)
	assert.NilError(s.T(), s.svc.DeletePanorama(s.ctx, "t1", 3))
}

func (s *ContentMutationsSuite) TestDeleteDocumentRejectsEmptyTerritory() {
	err := s.svc.DeleteDocument(s.ctx, "", 7)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ContentMutationsSuite) TestDeleteDocumentForwardsTerritory() {
	s.content.DeleteDocumentMock.Expect(s.ctx, "t1", int64(7)).Return(nil)
	assert.NilError(s.T(), s.svc.DeleteDocument(s.ctx, "t1", 7))
}
