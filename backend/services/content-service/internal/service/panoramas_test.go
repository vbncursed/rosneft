package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
)

// PanoramasSuite covers the id-keyed panorama mutations: both must carry the
// territory slug down to storage, which scopes the row by it.
type PanoramasSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Content
	ctx  context.Context

	thumbHash string
	thumbErr  error
	thumbSrcs []string // every source the thumbnailer was asked for
}

func TestPanoramasSuite(t *testing.T) {
	suite.Run(t, new(PanoramasSuite))
}

func (s *PanoramasSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.thumbHash, s.thumbErr, s.thumbSrcs = "", nil, nil
	s.svc = service.New(s.repo, func(_ context.Context, src string) (string, error) {
		s.thumbSrcs = append(s.thumbSrcs, src)
		return s.thumbHash, s.thumbErr
	})
	s.ctx = s.T().Context()
}

func (s *PanoramasSuite) TestUpdateRejectsEmptyTerritorySlug() {
	_, err := s.svc.UpdatePanorama(s.ctx, domain.Panorama{ID: 3, Title: "North"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramasSuite) TestUpdateForwardsTerritorySlug() {
	in := domain.Panorama{ID: 3, TerritorySlug: "site-a", Title: "North"}
	s.repo.UpdatePanoramaMock.Expect(minimock.AnyContext, in).Return(in, nil)
	got, err := s.svc.UpdatePanorama(s.ctx, in)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), in, got)
}

func (s *PanoramasSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeletePanorama(s.ctx, "site-a", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramasSuite) TestDeleteRejectsEmptyTerritorySlug() {
	err := s.svc.DeletePanorama(s.ctx, "", 3)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramasSuite) TestDeleteForwardsTerritorySlug() {
	s.repo.DeletePanoramaMock.Expect(minimock.AnyContext, "site-a", int64(3)).Return(domain.ErrPanoramaNotFound)
	err := s.svc.DeletePanorama(s.ctx, "site-a", 3)
	assert.Assert(s.T(), errors.Is(err, domain.ErrPanoramaNotFound))
}

func (s *PanoramasSuite) created() {
	s.repo.CreatePanoramaMock.Set(func(_ context.Context, p domain.Panorama) (domain.Panorama, error) { return p, nil })
}

var north = domain.Panorama{TerritorySlug: "site-a", Title: "North", SourceBlobHash: "src"}

func (s *PanoramasSuite) TestCreateStoresTheThumbnailMadeFromTheSource() {
	s.thumbHash = "t1"
	s.created()
	got, err := s.svc.CreatePanorama(s.ctx, north)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ThumbnailBlobHash, "t1")
	assert.DeepEqual(s.T(), s.thumbSrcs, []string{"src"})
}

// A thumbnail is a convenience: the row falls back to a glyph, and the
// startup backfill tries again. It must never cost the panorama.
func (s *PanoramasSuite) TestCreateWithoutAThumbnailStillCreatesThePanorama() {
	s.thumbErr = errors.New("undecodable source")
	s.created()
	got, err := s.svc.CreatePanorama(s.ctx, north)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ThumbnailBlobHash, "")
}

// The decode is the expensive part: a slug conflict must not repeat it.
func (s *PanoramasSuite) TestCreateMakesTheThumbnailOnceAcrossSlugRetries() {
	s.thumbHash = "t1"
	s.repo.CreatePanoramaMock.Set(func(_ context.Context, p domain.Panorama) (domain.Panorama, error) {
		if p.Slug == "north" {
			return domain.Panorama{}, domain.ErrSlugConflict
		}
		return p, nil
	})
	got, err := s.svc.CreatePanorama(s.ctx, north)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "north-2")
	assert.Equal(s.T(), len(s.thumbSrcs), 1)
}
