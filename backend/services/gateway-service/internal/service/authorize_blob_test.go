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

// rootScope is Root's blob scope: it attaches any hash, as it reads any blob.
var rootScope = domain.BlobScope{AllAccess: true}

const (
	foreignHash = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"
	ownHash     = "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a"
)

// AuthorizeBlobSuite pins H-1: a blob hash in a request body is accepted only
// from a caller who uploaded it or can already read it. Anything else — a hash
// learned from someone else, or one that exists nowhere — gets the same 400,
// and nothing is written.
type AuthorizeBlobSuite struct {
	suite.Suite
	cat     *mocks.CatalogMock
	content *mocks.ContentMock
	upload  *mocks.UploadMock
	svc     *service.Gateway
	ctx     context.Context
	company domain.BlobScope
}

func TestAuthorizeBlobSuite(t *testing.T) { suite.Run(t, new(AuthorizeBlobSuite)) }

func (s *AuthorizeBlobSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.content = mocks.NewContentMock(mc)
	s.upload = mocks.NewUploadMock(mc)
	s.svc = service.New(s.cat, s.content, mocks.NewMeshMock(mc), s.upload, mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
	s.company = domain.BlobScope{AdminID: "company-1"}
}

// unknown makes foreignHash neither uploaded by the caller nor visible to them.
func (s *AuthorizeBlobSuite) unknown() {
	s.upload.HasUploadedMock.When(s.ctx, foreignHash).Then(false, nil)
	s.cat.ResolveBlobAccessMock.When(s.ctx, foreignHash, "company-1").Then(false, nil)
}

// Every route that takes a hash refuses a foreign one before writing: the
// mocks carry no write expectation, so reaching a write fails the test.
func (s *AuthorizeBlobSuite) TestEveryRouteRefusesAForeignHash() {
	cases := []struct {
		name string
		call func() error
	}{
		{name: "create territory", call: func() error {
			_, _, err := s.svc.CreateTerritory(s.ctx, domain.Territory{Title: "t", SourceBlobHash: foreignHash}, s.company)
			return err
		}},
		{name: "replace territory source", call: func() error {
			_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "yard", foreignHash, s.company)
			return err
		}},
		{name: "create model", call: func() error {
			_, _, err := s.svc.CreateModel(s.ctx, domain.Model{Title: "m", SourceBlobHash: foreignHash}, s.company)
			return err
		}},
		{name: "update model thumbnail", call: func() error {
			_, err := s.svc.UpdateModel(s.ctx, "pump", domain.ModelUpdate{ThumbnailBlobHash: new(foreignHash)}, s.company)
			return err
		}},
		{name: "create panorama", call: func() error {
			_, err := s.svc.CreatePanorama(s.ctx, domain.Panorama{TerritorySlug: "yard", Title: "p", SourceBlobHash: foreignHash}, s.company)
			return err
		}},
		{name: "create document", call: func() error {
			_, err := s.svc.CreateDocument(s.ctx, domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: foreignHash}, s.company)
			return err
		}},
	}
	s.unknown()
	for _, tc := range cases {
		s.Run(tc.name, func() {
			err := tc.call()
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
			assert.ErrorContains(s.T(), err, "unknown blob hash")
		})
	}
}

// The thumbnail is a hash in the same body; a legitimate source does not
// launder a foreign thumbnail.
func (s *AuthorizeBlobSuite) TestCreateModelChecksTheThumbnailToo() {
	s.upload.HasUploadedMock.When(s.ctx, ownHash).Then(true, nil)
	s.unknown()
	_, _, err := s.svc.CreateModel(s.ctx, domain.Model{
		Title: "m", SourceBlobHash: ownHash, ThumbnailBlobHash: foreignHash,
	}, s.company)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *AuthorizeBlobSuite) TestTheUploaderMayAttachTheirHash() {
	in := domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: ownHash}
	s.upload.HasUploadedMock.Expect(s.ctx, ownHash).Return(true, nil)
	s.content.CreateDocumentMock.Expect(s.ctx, in).Return(in, nil)

	_, err := s.svc.CreateDocument(s.ctx, in, s.company)
	assert.NilError(s.T(), err)
}

// Re-using a blob the caller can already read (their own territory's, or a
// shared model's) is not an escalation.
func (s *AuthorizeBlobSuite) TestAHashTheCallerCanReadMayBeAttached() {
	in := domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: ownHash}
	s.upload.HasUploadedMock.Expect(s.ctx, ownHash).Return(false, nil)
	s.cat.ResolveBlobAccessMock.Expect(s.ctx, ownHash, "company-1").Return(true, nil)
	s.content.CreateDocumentMock.Expect(s.ctx, in).Return(in, nil)

	_, err := s.svc.CreateDocument(s.ctx, in, s.company)
	assert.NilError(s.T(), err)
}

// Root reads every blob, so it attaches any hash without a lookup.
func (s *AuthorizeBlobSuite) TestRootIsNotAsked() {
	in := domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: foreignHash}
	s.content.CreateDocumentMock.Expect(s.ctx, in).Return(in, nil)

	_, err := s.svc.CreateDocument(s.ctx, in, rootScope)
	assert.NilError(s.T(), err)
}

// A non-Root caller with no scope is an upstream bug. An empty scope would
// make the catalog look across every tenant, so it is refused outright.
func (s *AuthorizeBlobSuite) TestAnEmptyScopeFailsClosed() {
	s.upload.HasUploadedMock.Return(false, nil)
	_, err := s.svc.CreateDocument(s.ctx,
		domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: foreignHash}, domain.BlobScope{})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// A lookup that failed is not the caller's mistake: 500, not 400.
func (s *AuthorizeBlobSuite) TestLookupFailuresAreNotInvalidInput() {
	doc := domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: foreignHash}
	s.Run("upload service down", func() {
		s.upload.HasUploadedMock.When(s.ctx, foreignHash).Then(false, errors.New("unavailable"))
		_, err := s.svc.CreateDocument(s.ctx, doc, s.company)
		assert.Assert(s.T(), err != nil && !errors.Is(err, domain.ErrInvalidInput))
	})
}

func (s *AuthorizeBlobSuite) TestCatalogFailureIsNotInvalidInput() {
	s.upload.HasUploadedMock.Return(false, nil)
	s.cat.ResolveBlobAccessMock.Return(false, errors.New("catalog down"))
	_, err := s.svc.CreateDocument(s.ctx,
		domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: foreignHash}, s.company)
	assert.Assert(s.T(), err != nil && !errors.Is(err, domain.ErrInvalidInput))
}

// Clearing the thumbnail sends an empty hash; there is nothing to check.
func (s *AuthorizeBlobSuite) TestClearingTheThumbnailNeedsNoLookup() {
	s.cat.UpdateModelMock.Expect(s.ctx, "pump", domain.ModelUpdate{ThumbnailBlobHash: new("")}).
		Return(domain.Model{Slug: "pump"}, nil)

	_, err := s.svc.UpdateModel(s.ctx, "pump", domain.ModelUpdate{ThumbnailBlobHash: new("")}, s.company)
	assert.NilError(s.T(), err)
}

// A hash that is not 64 lowercase hex characters can name no blob. It gets the
// same answer as any other unknown hash — not upload-service's internal
// wording — and costs no lookup (the mocks expect none).
func (s *AuthorizeBlobSuite) TestAMalformedHashIsUnknownWithoutALookup() {
	for _, hash := range []string{
		"zz",
		"../x",
		foreignHash[:63],
		foreignHash + "0",
		"F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0",
	} {
		_, err := s.svc.CreateDocument(s.ctx,
			domain.Document{TerritorySlug: "yard", Title: "d", SourceBlobHash: hash}, s.company)
		assert.Error(s.T(), err, "invalid input: unknown blob hash", "hash %q", hash)
	}
}
