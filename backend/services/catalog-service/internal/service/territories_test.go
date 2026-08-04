package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

// validBlobHash is a syntactically valid 64-character lowercase-hex SHA-256
// digest, the shape upload-service.Finalize always emits
// (hex.EncodeToString of a sha256.Sum). Shared with models_test.go — both
// files are package service_test.
const validBlobHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type TerritoriesSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestTerritoriesSuite(t *testing.T) {
	suite.Run(t, new(TerritoriesSuite))
}

func (s *TerritoriesSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *TerritoriesSuite) TestCreateRejectsEmptyTitle() {
	_, err := s.svc.UpsertTerritory(s.ctx, domain.Territory{SourceBlobHash: validBlobHash})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestUpsertRejectsEmptySourceHash() {
	_, err := s.svc.UpsertTerritory(s.ctx, domain.Territory{Slug: "t1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// TestUpsertRejectsNonHexSourceHash guards the write boundary a caller with
// territory:create can otherwise reach: a hash that isn't hex can never
// name a real blob, but nothing stopped it from landing in the column.
func (s *TerritoriesSuite) TestUpsertRejectsNonHexSourceHash() {
	_, err := s.svc.UpsertTerritory(s.ctx, domain.Territory{
		Slug: "t1", Title: "Site",
		SourceBlobHash: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
	})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestUpsertRejectsShortSourceHash() {
	_, err := s.svc.UpsertTerritory(s.ctx, domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "abc123"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// TestUpsertRejectsShellMetacharactersInSourceHash is the case that connects
// this validation to the command injection it exists to prevent: this exact
// value used to be interpolated straight into a root `sh -c` by
// ops/backup/dump.sh once it came back out of the database.
func (s *TerritoriesSuite) TestUpsertRejectsShellMetacharactersInSourceHash() {
	_, err := s.svc.UpsertTerritory(s.ctx, domain.Territory{
		Slug: "t1", Title: "Site", SourceBlobHash: `aa";rm -rf /;#`,
	})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestUpsertForwardsValidInput() {
	in := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: validBlobHash}
	s.repo.UpsertTerritoryMock.Expect(s.ctx, in).Return(in, nil)
	out, err := s.svc.UpsertTerritory(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "t1")
}

func (s *TerritoriesSuite) TestCreateGeneratesSlugFromTitle() {
	in := domain.Territory{Title: "Москва", SourceBlobHash: validBlobHash}
	s.repo.CreateTerritoryMock.
		Expect(s.ctx, domain.Territory{Slug: "moskva", Title: "Москва", SourceBlobHash: validBlobHash}).
		Return(domain.Territory{Slug: "moskva"}, nil)
	out, err := s.svc.UpsertTerritory(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "moskva")
}

func (s *TerritoriesSuite) TestCreateResolvesSlugCollision() {
	taken := domain.Territory{Slug: "moskva", Title: "Москва", SourceBlobHash: validBlobHash}
	free := domain.Territory{Slug: "moskva-2", Title: "Москва", SourceBlobHash: validBlobHash}
	s.repo.CreateTerritoryMock.When(s.ctx, taken).Then(domain.Territory{}, domain.ErrSlugConflict)
	s.repo.CreateTerritoryMock.When(s.ctx, free).Then(domain.Territory{Slug: "moskva-2"}, nil)

	out, err := s.svc.UpsertTerritory(s.ctx, domain.Territory{Title: "Москва", SourceBlobHash: validBlobHash})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "moskva-2")
}

func (s *TerritoriesSuite) TestUpsertPropagatesRepoError() {
	in := domain.Territory{Slug: "t1", SourceBlobHash: validBlobHash}
	s.repo.UpsertTerritoryMock.Expect(s.ctx, in).Return(domain.Territory{}, errors.New("db down"))
	_, err := s.svc.UpsertTerritory(s.ctx, in)
	assert.ErrorContains(s.T(), err, "db down")
}

func (s *TerritoriesSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetTerritory(s.ctx, "", "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestGetReturnsNotFoundForUnknown() {
	s.repo.GetTerritoryMock.Expect(s.ctx, "missing", "").Return(domain.Territory{}, domain.ErrTerritoryNotFound)
	_, err := s.svc.GetTerritory(s.ctx, "missing", "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestGetReturnsExisting() {
	s.repo.GetTerritoryMock.Expect(s.ctx, "t1", "").Return(domain.Territory{Slug: "t1"}, nil)
	got, err := s.svc.GetTerritory(s.ctx, "t1", "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "t1")
}

func (s *TerritoriesSuite) TestGetScopedForwardsAdminID() {
	s.repo.GetTerritoryMock.Expect(s.ctx, "t1", "admin-1").Return(domain.Territory{Slug: "t1"}, nil)
	got, err := s.svc.GetTerritory(s.ctx, "t1", "admin-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "t1")
}

func (s *TerritoriesSuite) TestListReturnsEverything() {
	s.repo.ListTerritoriesMock.Expect(s.ctx, "").Return([]domain.Territory{{Slug: "a"}, {Slug: "b"}, {Slug: "c"}}, nil)
	got, err := s.svc.ListTerritories(s.ctx, "")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 3))
}

func (s *TerritoriesSuite) TestListScopedForwardsAdminID() {
	s.repo.ListTerritoriesMock.Expect(s.ctx, "admin-1").Return([]domain.Territory{{Slug: "a"}}, nil)
	got, err := s.svc.ListTerritories(s.ctx, "admin-1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 1))
}

func (s *TerritoriesSuite) TestSetTerritoryAdminsRejectsEmptySlug() {
	err := s.svc.SetTerritoryAdmins(s.ctx, "", []string{"admin-1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestSetTerritoryAdminsForwards() {
	s.repo.SetTerritoryAdminsMock.Expect(s.ctx, "t1", []string{"admin-1"}).Return(nil)
	err := s.svc.SetTerritoryAdmins(s.ctx, "t1", []string{"admin-1"})
	assert.NilError(s.T(), err)
}

func (s *TerritoriesSuite) TestGetTerritoryAdminsRejectsEmptySlug() {
	_, err := s.svc.GetTerritoryAdmins(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestGetTerritoryAdminsForwards() {
	s.repo.GetTerritoryAdminsMock.Expect(s.ctx, "t1").Return([]string{"admin-1", "admin-2"}, nil)
	got, err := s.svc.GetTerritoryAdmins(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 2))
}

func (s *TerritoriesSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteTerritory(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestDeleteReturnsNotFoundForUnknown() {
	s.repo.DeleteTerritoryMock.Expect(s.ctx, "missing").Return(domain.ErrTerritoryNotFound)
	err := s.svc.DeleteTerritory(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestDeleteRemovesExisting() {
	s.repo.DeleteTerritoryMock.Expect(s.ctx, "t1").Return(nil)
	assert.NilError(s.T(), s.svc.DeleteTerritory(s.ctx, "t1"))
}
