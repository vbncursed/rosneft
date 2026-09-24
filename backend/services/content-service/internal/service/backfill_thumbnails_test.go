package service_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
)

type BackfillSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
}

func TestBackfillSuite(t *testing.T) { suite.Run(t, new(BackfillSuite)) }

func (s *BackfillSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
}

var pending = []domain.Panorama{
	{ID: 1, SourceBlobHash: "a"},
	{ID: 2, SourceBlobHash: "undecodable"},
	{ID: 3, SourceBlobHash: "c"},
}

// recordSets makes SetPanoramaThumbnail succeed and returns every "id=hash" it
// was called with.
func (s *BackfillSuite) recordSets() *[]string {
	set := &[]string{}
	s.repo.SetPanoramaThumbnailMock.Set(func(_ context.Context, id int64, hash string) error {
		*set = append(*set, fmt.Sprintf("%d=%s", id, hash))
		return nil
	})
	return set
}

// A source that cannot be decoded is skipped, not fatal: the rest still get
// their thumbnails, and that row is tried again on the next boot.
func (s *BackfillSuite) TestMakesEveryMissingThumbnailAndSkipsAFailure() {
	s.repo.ListPanoramasWithoutThumbnailMock.Return(pending, nil)
	set := s.recordSets()
	thumb := func(_ context.Context, src string) (string, error) {
		if src == "undecodable" {
			return "", errors.New("image: unknown format")
		}
		return "t-" + src, nil
	}

	service.New(s.repo, thumb).BackfillThumbnails(s.T().Context())

	assert.DeepEqual(s.T(), *set, []string{"1=t-a", "3=t-c"})
}

// An empty hash is "no thumbnail yet". Writing it would be a no-op the
// journal still records, so a thumbnailer that answers "" is a failure.
func (s *BackfillSuite) TestNeverRecordsAnEmptyHash() {
	s.repo.ListPanoramasWithoutThumbnailMock.Return(pending, nil)
	set := s.recordSets()
	thumb := func(_ context.Context, src string) (string, error) {
		if src == "undecodable" {
			return "", nil
		}
		return "t-" + src, nil
	}

	service.New(s.repo, thumb).BackfillThumbnails(s.T().Context())

	assert.DeepEqual(s.T(), *set, []string{"1=t-a", "3=t-c"})
}

// Bounded by the service's lifetime: once the context ends, the next
// panorama is not started.
func (s *BackfillSuite) TestStopsWhenTheContextEnds() {
	ctx, cancel := context.WithCancel(s.T().Context())
	defer cancel()
	s.repo.ListPanoramasWithoutThumbnailMock.Return(pending, nil)
	s.repo.SetPanoramaThumbnailMock.Set(func(ctx context.Context, _ int64, _ string) error { return ctx.Err() })
	calls := 0
	thumb := func(context.Context, string) (string, error) {
		calls++
		cancel() // shutdown arrives while the first thumbnail is being made
		return "t", nil
	}

	service.New(s.repo, thumb).BackfillThumbnails(ctx)

	assert.Equal(s.T(), calls, 1)
}

// A context already dead between two panoramas must not start the next
// decode, even when every step before it answered without an error.
func (s *BackfillSuite) TestStartsNoDecodeOnADeadContext() {
	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()
	s.repo.ListPanoramasWithoutThumbnailMock.Return(pending, nil)
	// SetPanoramaThumbnail is left unset: minimock fails the test on any call.
	calls := 0
	thumb := func(context.Context, string) (string, error) {
		calls++
		return "t", nil
	}

	service.New(s.repo, thumb).BackfillThumbnails(ctx)

	assert.Equal(s.T(), calls, 0)
}
