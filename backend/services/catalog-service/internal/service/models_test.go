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

type ModelsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestModelsSuite(t *testing.T) {
	suite.Run(t, new(ModelsSuite))
}

func (s *ModelsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ModelsSuite) TestCreateRejectsEmptyTitle() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{SourceBlobHash: validBlobHash})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestUpsertRejectsEmptySourceHash() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{Slug: "m1"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// TestUpsertRejectsNonHexSourceHash guards the write boundary a caller with
// model:create can otherwise reach: a hash that isn't hex can never name a
// real blob, but nothing stopped it from landing in the column.
func (s *ModelsSuite) TestUpsertRejectsNonHexSourceHash() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{
		Slug: "m1", Title: "Box",
		SourceBlobHash: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
	})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestUpsertRejectsShortSourceHash() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: "abc123"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// TestUpsertRejectsShellMetacharactersInSourceHash is the case that connects
// this validation to the command injection it exists to prevent: this exact
// value used to be interpolated straight into a root `sh -c` by
// ops/backup/dump.sh once it came back out of the database.
func (s *ModelsSuite) TestUpsertRejectsShellMetacharactersInSourceHash() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{
		Slug: "m1", Title: "Box", SourceBlobHash: `aa";rm -rf /;#`,
	})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// TestUpsertAllowsEmptyThumbnailHash: unlike SourceBlobHash, ThumbnailBlobHash
// legitimately means "no thumbnail" when empty (see openapi.yaml's
// ModelUpdate.thumbnailBlobHash: "empty string clears it").
func (s *ModelsSuite) TestUpsertAllowsEmptyThumbnailHash() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: validBlobHash, Tag: campTag}
	s.repo.CreateModelMock.Expect(s.ctx, in).Return(in, nil)
	_, err := s.svc.UpsertModel(s.ctx, in)
	assert.NilError(s.T(), err)
}

func (s *ModelsSuite) TestUpsertRejectsMalformedThumbnailHash() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{
		Slug: "m1", Title: "Box", SourceBlobHash: validBlobHash, ThumbnailBlobHash: "not-hex",
	})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// An explicit slug is a plain insert under that slug (see the territory test).
func (s *ModelsSuite) TestUpsertForwardsValidInput() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: validBlobHash, Tag: campTag}
	s.repo.CreateModelMock.Expect(s.ctx, in).Return(in, nil)
	out, err := s.svc.UpsertModel(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "m1")
}

func (s *ModelsSuite) TestAnExplicitSlugTakenIsAConflict() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: validBlobHash, Tag: campTag}
	s.repo.CreateModelMock.Expect(s.ctx, in).Return(domain.Model{}, domain.ErrSlugConflict)
	_, err := s.svc.UpsertModel(s.ctx, in)
	assert.ErrorIs(s.T(), err, domain.ErrSlugConflict)
}

func (s *ModelsSuite) TestCreateGeneratesSlugFromTitle() {
	in := domain.Model{Title: "Насос K-200", SourceBlobHash: validBlobHash, Tag: campTag}
	s.repo.CreateModelMock.
		Expect(
			s.ctx,
			domain.Model{Slug: "nasos-k-200", Title: "Насос K-200", SourceBlobHash: validBlobHash, Tag: campTag},
		).
		Return(domain.Model{Slug: "nasos-k-200"}, nil)
	out, err := s.svc.UpsertModel(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "nasos-k-200")
}

func (s *ModelsSuite) TestCreateResolvesSlugCollision() {
	taken := domain.Model{Slug: "box", Title: "Box", SourceBlobHash: validBlobHash, Tag: campTag}
	free := domain.Model{Slug: "box-2", Title: "Box", SourceBlobHash: validBlobHash, Tag: campTag}
	s.repo.CreateModelMock.When(s.ctx, taken).Then(domain.Model{}, domain.ErrSlugConflict)
	s.repo.CreateModelMock.When(s.ctx, free).Then(domain.Model{Slug: "box-2"}, nil)

	out, err := s.svc.UpsertModel(s.ctx, domain.Model{Title: "Box", SourceBlobHash: validBlobHash, Tag: campTag})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "box-2")
}

func (s *ModelsSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetModel(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestGetReturnsNotFoundForUnknown() {
	s.repo.GetModelMock.Expect(s.ctx, "missing").Return(domain.Model{}, domain.ErrModelNotFound)
	_, err := s.svc.GetModel(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}

func (s *ModelsSuite) TestGetReturnsExisting() {
	s.repo.GetModelMock.Expect(s.ctx, "m1").Return(domain.Model{Slug: "m1"}, nil)
	got, err := s.svc.GetModel(s.ctx, "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "m1")
}

func (s *ModelsSuite) TestListReturnsEverything() {
	s.repo.ListModelsMock.Expect(s.ctx, true).Return([]domain.Model{{Slug: "a"}, {Slug: "b"}}, nil)
	got, err := s.svc.ListModels(s.ctx, true)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 2))
}

func (s *ModelsSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteModel(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ModelsSuite) TestDeleteReturnsNotFoundForUnknown() {
	s.repo.DeleteModelMock.Expect(s.ctx, "missing").Return(domain.ErrModelNotFound)
	err := s.svc.DeleteModel(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrModelNotFound))
}

func (s *ModelsSuite) TestDeleteRemovesExisting() {
	s.repo.DeleteModelMock.Expect(s.ctx, "m1").Return(nil)
	assert.NilError(s.T(), s.svc.DeleteModel(s.ctx, "m1"))
}

// An empty thumbnail is "no thumbnail", so clearing it is forwarded.
func (s *ModelsSuite) TestUpdateForwardsThePatchAsIs() {
	patch := domain.ModelPatch{Title: new("Crate"), ThumbnailBlobHash: new("")}
	s.repo.UpdateModelMock.Expect(s.ctx, "m1", patch).Return(domain.Model{Slug: "m1", Title: "Crate"}, nil)
	out, err := s.svc.UpdateModel(s.ctx, "m1", patch)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Title, "Crate")
}

func (s *ModelsSuite) TestUpdateRefusesBadInputBeforeWriting() {
	cases := []struct {
		name  string
		slug  string
		patch domain.ModelPatch
	}{
		{name: "empty slug", slug: "", patch: domain.ModelPatch{Title: new("x")}},
		{name: "blank title", slug: "m1", patch: domain.ModelPatch{Title: new("")}},
		{name: "non-hex thumbnail", slug: "m1", patch: domain.ModelPatch{ThumbnailBlobHash: new("not-hex")}},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			_, err := s.svc.UpdateModel(s.ctx, tc.slug, tc.patch)
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		})
	}
}

var campTag = domain.ModelTag{Slug: "camp", Title: "Camp & accommodation"}

func (s *ModelsSuite) TestUpsertModelRejectsMissingTag() {
	_, err := s.svc.UpsertModel(s.ctx, domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: validBlobHash})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "unknown model tag")
	assert.Equal(s.T(), s.repo.CreateModelAfterCounter(), uint64(0))
}

func (s *ModelsSuite) TestUpsertModelPassesTagSlug() {
	in := domain.Model{Slug: "m1", Title: "Box", SourceBlobHash: validBlobHash, Tag: domain.ModelTag{Slug: "camp"}}
	s.repo.CreateModelMock.Expect(s.ctx, in).Return(domain.Model{Slug: "m1", Tag: campTag}, nil)
	out, err := s.svc.UpsertModel(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Tag, campTag)
}

func (s *ModelsSuite) TestUpdateModelChangesTag() {
	patch := domain.ModelPatch{TagSlug: new("camp")}
	s.repo.UpdateModelMock.Expect(s.ctx, "m1", patch).Return(domain.Model{Slug: "m1", Tag: campTag}, nil)
	out, err := s.svc.UpdateModel(s.ctx, "m1", patch)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Tag.Slug, "camp")
}

func (s *ModelsSuite) TestUpdateModelEmptyTagRejected() {
	_, err := s.svc.UpdateModel(s.ctx, "m1", domain.ModelPatch{TagSlug: new("")})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "unknown model tag")
}

func (s *ModelsSuite) TestListModelTagsUngroupedLast() {
	s.repo.ListModelTagsMock.Expect(s.ctx).Return([]domain.ModelTag{
		{Slug: "ungrouped", Title: "Ungrouped"},
		{Slug: "power", Title: "Power generation"},
		{Slug: "camp", Title: "Camp & accommodation"},
	}, nil)
	got, err := s.svc.ListModelTags(s.ctx)
	assert.NilError(s.T(), err)
	slugs := make([]string, len(got))
	for i, t := range got {
		slugs[i] = t.Slug
	}
	assert.DeepEqual(s.T(), slugs, []string{"camp", "power", "ungrouped"})
}
