package service_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
)

type PanoramaPhasesSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Content
	ctx  context.Context
}

func TestPanoramaPhasesSuite(t *testing.T) { suite.Run(t, new(PanoramaPhasesSuite)) }

func (s *PanoramaPhasesSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo, nil)
	s.ctx = s.T().Context()
}

// Storage counts the rows it updated against the ids it was handed, so a
// repeated id would read as a missing one: the service hands each id once.
func (s *PanoramaPhasesSuite) TestBulkWritesHandEachIDOnce() {
	s.repo.SetPanoramasHiddenMock.Expect(s.ctx, "t1", []int64{1, 2}, true).Return(2, nil)
	n, err := s.svc.SetPanoramasHidden(s.ctx, "t1", []int64{2, 1, 2}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)

	s.repo.SetPanoramasPhaseMock.Expect(s.ctx, "t1", []int64{3}, domain.PhaseCurrent).Return(1, nil)
	n, err = s.svc.SetPanoramasPhase(s.ctx, "t1", []int64{3, 3}, "current")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

// Refused before storage is asked: minimock fails the test on any repo call.
// The bound applies to the list as sent, before de-duplication.
func (s *PanoramaPhasesSuite) TestBulkWritesRefuseAnEmptyOrOversizedList() {
	for _, tc := range []struct {
		name string
		slug string
		ids  []int64
	}{
		{"no territory", "", []int64{1}},
		{"no ids", "t1", nil},
		{"more than a thousand ids", "t1", make([]int64, 1001)},
	} {
		s.Run(tc.name, func() {
			_, err := s.svc.SetPanoramasHidden(s.ctx, tc.slug, tc.ids, true)
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
			_, err = s.svc.SetPanoramasPhase(s.ctx, tc.slug, tc.ids, "post")
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		})
	}
}

// The three phases are fixed and matched exactly.
func (s *PanoramaPhasesSuite) TestAnUnknownPhaseIsInvalid() {
	for _, phase := range []string{"", "during", "Prior"} {
		_, err := s.svc.SetPanoramasPhase(s.ctx, "t1", []int64{1}, phase)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		_, err = s.svc.SetPanoramaPhaseHidden(s.ctx, "t1", phase, true)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

func (s *PanoramaPhasesSuite) TestPhaseCallsNeedATerritory() {
	_, err := s.svc.SetPanoramaPhaseHidden(s.ctx, "", "post", true)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.ListPanoramaPhases(s.ctx, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *PanoramaPhasesSuite) TestThePhaseFlagForwardsTheParsedPhase() {
	want := domain.PanoramaPhaseVisibility{Phase: domain.PhasePost, Hidden: true}
	s.repo.SetPanoramaPhaseHiddenMock.Expect(s.ctx, "t1", domain.PhasePost, true).Return(want, nil)
	got, err := s.svc.SetPanoramaPhaseHidden(s.ctx, "t1", "post", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, want)

	three := []domain.PanoramaPhaseVisibility{{Phase: domain.PhasePrior}, {Phase: domain.PhaseCurrent}, want}
	s.repo.ListPanoramaPhasesMock.Expect(s.ctx, "t1").Return(three, nil)
	listed, err := s.svc.ListPanoramaPhases(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), listed, three)
}

func (s *PanoramaPhasesSuite) TestAForeignPanoramaIsNotFound() {
	s.repo.SetPanoramasHiddenMock.Return(0, domain.ErrPanoramaNotFound)
	_, err := s.svc.SetPanoramasHidden(s.ctx, "t1", []int64{9}, true)
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
}
