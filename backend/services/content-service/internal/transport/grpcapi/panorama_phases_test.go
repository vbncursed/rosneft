package grpcapi_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

// PanoramaPhasesSuite drives the server over the real service and a mocked
// repository, so a request's fields, the validation and the sentinel → code
// mapping are exercised together.
type PanoramaPhasesSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	srv  *grpcapi.Server
	ctx  context.Context
}

func TestPanoramaPhasesSuite(t *testing.T) { suite.Run(t, new(PanoramaPhasesSuite)) }

func (s *PanoramaPhasesSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	noThumb := func(context.Context, string) (string, error) { return "", nil }
	s.srv = grpcapi.New(service.New(s.repo, noThumb))
	s.ctx = s.T().Context()
}

func (s *PanoramaPhasesSuite) TestBulkWritesAnswerTheCount() {
	s.repo.SetPanoramasHiddenMock.Expect(minimock.AnyContext, "t1", []int64{1, 2}, true).Return(2, nil)
	hidden, err := s.srv.SetPanoramasHidden(s.ctx, &contentv1.SetPanoramasHiddenRequest{
		TerritorySlug: "t1", Ids: []int64{2, 1}, Hidden: true,
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), hidden.GetUpdated(), int32(2))

	s.repo.SetPanoramasPhaseMock.Expect(minimock.AnyContext, "t1", []int64{1}, domain.PhasePost).Return(1, nil)
	moved, err := s.srv.SetPanoramasPhase(s.ctx, &contentv1.SetPanoramasPhaseRequest{
		TerritorySlug: "t1", Ids: []int64{1}, Phase: "post",
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), moved.GetUpdated(), int32(1))
}

func (s *PanoramaPhasesSuite) TestAForeignPanoramaIsNotFound() {
	s.repo.SetPanoramasPhaseMock.Return(0, domain.ErrPanoramaNotFound)
	_, err := s.srv.SetPanoramasPhase(s.ctx, &contentv1.SetPanoramasPhaseRequest{
		TerritorySlug: "t1", Ids: []int64{9}, Phase: "current",
	})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}

func (s *PanoramaPhasesSuite) TestAnUnknownPhaseIsInvalidArgument() {
	_, err := s.srv.SetPanoramasPhase(s.ctx, &contentv1.SetPanoramasPhaseRequest{
		TerritorySlug: "t1", Ids: []int64{1}, Phase: "during",
	})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
	// The message starts at the sentinel: the service's own "service.X: "
	// framing is not for the browser.
	assert.Assert(s.T(), strings.HasPrefix(status.Convert(err).Message(), "invalid input"), status.Convert(err).Message())
	_, err = s.srv.SetPanoramaPhaseHidden(s.ctx, &contentv1.SetPanoramaPhaseHiddenRequest{
		TerritorySlug: "t1", Phase: "during", Hidden: true,
	})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

func (s *PanoramaPhasesSuite) TestThePhaseFlagIsSetAndListed() {
	s.repo.SetPanoramaPhaseHiddenMock.Expect(minimock.AnyContext, "t1", domain.PhaseCurrent, true).
		Return(domain.PanoramaPhaseVisibility{Phase: domain.PhaseCurrent, Hidden: true}, nil)
	set, err := s.srv.SetPanoramaPhaseHidden(s.ctx, &contentv1.SetPanoramaPhaseHiddenRequest{
		TerritorySlug: "t1", Phase: "current", Hidden: true,
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), set.GetPhase().GetPhase(), "current")
	assert.Assert(s.T(), set.GetPhase().GetHidden())

	s.repo.ListPanoramaPhasesMock.Expect(minimock.AnyContext, "t1").Return([]domain.PanoramaPhaseVisibility{
		{Phase: domain.PhasePrior}, {Phase: domain.PhaseCurrent, Hidden: true}, {Phase: domain.PhasePost},
	}, nil)
	listed, err := s.srv.ListPanoramaPhases(s.ctx, &contentv1.ListPanoramaPhasesRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	phases := listed.GetPhases()
	assert.Equal(s.T(), len(phases), 3)
	assert.Equal(s.T(), phases[0].GetPhase(), "prior")
	assert.Assert(s.T(), phases[1].GetHidden())
	assert.Equal(s.T(), phases[2].GetPhase(), "post")
}

func (s *PanoramaPhasesSuite) TestThePhaseFlagOfAnUnknownTerritoryIsNotFound() {
	s.repo.SetPanoramaPhaseHiddenMock.Return(domain.PanoramaPhaseVisibility{}, domain.ErrTerritoryNotFound)
	_, err := s.srv.SetPanoramaPhaseHidden(s.ctx, &contentv1.SetPanoramaPhaseHiddenRequest{
		TerritorySlug: "nowhere", Phase: "prior", Hidden: true,
	})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}

func (s *PanoramaPhasesSuite) TestAPanoramaCarriesPhaseAndHidden() {
	s.repo.ListPanoramasMock.Expect(minimock.AnyContext, "t1").Return([]domain.Panorama{
		{ID: 1, Phase: domain.PhasePost, Hidden: true},
	}, nil)
	out, err := s.srv.ListPanoramas(s.ctx, &contentv1.ListPanoramasRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.GetPanoramas()[0].GetPhase(), "post")
	assert.Assert(s.T(), out.GetPanoramas()[0].GetHidden())
}

// A create forwards its phase, and an empty one lands in prior.
func (s *PanoramaPhasesSuite) TestCreateForwardsThePhase() {
	s.repo.CreatePanoramaMock.Set(func(_ context.Context, p domain.Panorama) (domain.Panorama, error) { return p, nil })
	for phase, want := range map[string]string{"current": "current", "": "prior"} {
		out, err := s.srv.CreatePanorama(s.ctx, &contentv1.CreatePanoramaRequest{
			TerritorySlug: "t1", Title: "North", SourceBlobHash: "src", Phase: phase,
		})
		assert.NilError(s.T(), err)
		assert.Equal(s.T(), out.GetPanorama().GetPhase(), want)
	}
}
