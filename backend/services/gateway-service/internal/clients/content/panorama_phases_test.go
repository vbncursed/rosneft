// In-package test: it substitutes the unexported gRPC stub on Client.
package content

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// phaseCC records the last request of each phase call and answers with fixed
// values, or with err.
type phaseCC struct {
	contentv1.ContentServiceClient
	err    error
	hidden *contentv1.SetPanoramasHiddenRequest
	moved  *contentv1.SetPanoramasPhaseRequest
	flag   *contentv1.SetPanoramaPhaseHiddenRequest
	create *contentv1.CreatePanoramaRequest
	phases []*contentv1.PanoramaPhase
}

func (p *phaseCC) SetPanoramasHidden(
	_ context.Context, in *contentv1.SetPanoramasHiddenRequest, _ ...grpc.CallOption,
) (*contentv1.SetPanoramasHiddenResponse, error) {
	p.hidden = in
	return &contentv1.SetPanoramasHiddenResponse{Updated: 2}, p.err
}

func (p *phaseCC) SetPanoramasPhase(
	_ context.Context, in *contentv1.SetPanoramasPhaseRequest, _ ...grpc.CallOption,
) (*contentv1.SetPanoramasPhaseResponse, error) {
	p.moved = in
	return &contentv1.SetPanoramasPhaseResponse{Updated: 1}, p.err
}

func (p *phaseCC) SetPanoramaPhaseHidden(
	_ context.Context, in *contentv1.SetPanoramaPhaseHiddenRequest, _ ...grpc.CallOption,
) (*contentv1.SetPanoramaPhaseHiddenResponse, error) {
	p.flag = in
	return &contentv1.SetPanoramaPhaseHiddenResponse{
		Phase: &contentv1.PanoramaPhase{Phase: in.GetPhase(), Hidden: in.GetHidden()},
	}, p.err
}

func (p *phaseCC) ListPanoramaPhases(
	context.Context, *contentv1.ListPanoramaPhasesRequest, ...grpc.CallOption,
) (*contentv1.ListPanoramaPhasesResponse, error) {
	if p.err != nil {
		return nil, p.err
	}
	return &contentv1.ListPanoramaPhasesResponse{Phases: p.phases}, nil
}

func (p *phaseCC) CreatePanorama(
	_ context.Context, in *contentv1.CreatePanoramaRequest, _ ...grpc.CallOption,
) (*contentv1.CreatePanoramaResponse, error) {
	p.create = in
	return &contentv1.CreatePanoramaResponse{Panorama: &contentv1.Panorama{Id: 9, Phase: in.GetPhase()}}, p.err
}

type PanoramaPhasesSuite struct{ suite.Suite }

func TestPanoramaPhasesSuite(t *testing.T) { suite.Run(t, new(PanoramaPhasesSuite)) }

func (s *PanoramaPhasesSuite) TestBulkWritesTravelUnderTheTerritory() {
	cc := &phaseCC{}
	c := &Client{cc: cc}
	ctx := s.T().Context()

	n, err := c.SetPanoramasHidden(ctx, "yard", []int64{1, 2}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)
	assert.Equal(s.T(), cc.hidden.GetTerritorySlug(), "yard")
	assert.DeepEqual(s.T(), cc.hidden.GetIds(), []int64{1, 2})
	assert.Assert(s.T(), cc.hidden.GetHidden())

	n, err = c.SetPanoramasPhase(ctx, "yard", []int64{3}, domain.PhasePost)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
	assert.Equal(s.T(), cc.moved.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), cc.moved.GetPhase(), "post")
}

func (s *PanoramaPhasesSuite) TestThePhaseFlagAnswersThePhase() {
	cc := &phaseCC{}
	c := &Client{cc: cc}

	got, err := c.SetPanoramaPhaseHidden(s.T().Context(), "yard", domain.PhaseCurrent, true)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.PanoramaPhase{Phase: "current", Hidden: true})
	assert.Equal(s.T(), cc.flag.GetTerritorySlug(), "yard")
}

func (s *PanoramaPhasesSuite) TestListingMapsEveryPhase() {
	c := &Client{cc: &phaseCC{phases: []*contentv1.PanoramaPhase{
		{Phase: "prior"}, {Phase: "current", Hidden: true}, {Phase: "post"},
	}}}

	got, err := c.ListPanoramaPhases(s.T().Context(), "yard")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []domain.PanoramaPhase{
		{Phase: "prior"}, {Phase: "current", Hidden: true}, {Phase: "post"},
	})
}

// A content-service that predates phases (the gateway deployed first, or
// content rolled back) answers Unimplemented. The scene must still load.
func (s *PanoramaPhasesSuite) TestListingOnAContentWithoutPhasesIsNoRows() {
	c := &Client{cc: &phaseCC{err: status.Error(codes.Unimplemented, "unknown method ListPanoramaPhases")}}
	got, err := c.ListPanoramaPhases(s.T().Context(), "yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *PanoramaPhasesSuite) TestAListingFailureOtherThanUnimplementedPassesThrough() {
	c := &Client{cc: &phaseCC{err: status.Error(codes.Unavailable, "content down")}}
	_, err := c.ListPanoramaPhases(s.T().Context(), "yard")
	assert.Equal(s.T(), status.Code(err), codes.Unavailable)
}

// Content's mapError keeps its layers' "service.X: " prefixes in the status
// message. The browser gets the refusal from its sentinel on, and the sentinel
// is the one the message names.
func (s *PanoramaPhasesSuite) TestARefusalStartsAtItsSentinel() {
	for _, tc := range []struct {
		name string
		err  error
		want error
		msg  string
	}{
		{
			"an unknown panorama", status.Error(codes.NotFound, "service.SetPanoramasPhase: panorama not found"),
			domain.ErrPanoramaNotFound, "panorama not found",
		},
		{
			"an unknown territory", status.Error(codes.NotFound, "service.SetPanoramaPhaseHidden: territory not found"),
			domain.ErrTerritoryNotFound, "territory not found",
		},
		{
			"a bad phase", status.Error(codes.InvalidArgument, `service.SetPanoramasPhase: invalid input: phase "during"`),
			domain.ErrInvalidInput, `invalid input: phase "during"`,
		},
		{
			"a message already at its sentinel", status.Error(codes.InvalidArgument, "invalid input: 0 ids"),
			domain.ErrInvalidInput, "invalid input: 0 ids",
		},
	} {
		s.Run(tc.name, func() {
			c := &Client{cc: &phaseCC{err: tc.err}}
			_, err := c.SetPanoramasPhase(s.T().Context(), "yard", []int64{1}, "post")
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), tc.msg)
			_, err = c.SetPanoramasHidden(s.T().Context(), "yard", []int64{1}, true)
			assert.ErrorIs(s.T(), err, tc.want)
			_, err = c.SetPanoramaPhaseHidden(s.T().Context(), "yard", "post", true)
			assert.ErrorIs(s.T(), err, tc.want)
		})
	}
}

// Anything but a refusal is a server fault: it keeps its status for the log
// and maps to no 4xx sentinel.
func (s *PanoramaPhasesSuite) TestAFaultIsNotARefusal() {
	c := &Client{cc: &phaseCC{err: status.Error(codes.Unavailable, "content down")}}
	_, err := c.SetPanoramasHidden(s.T().Context(), "yard", []int64{1}, true)
	assert.Equal(s.T(), status.Code(err), codes.Unavailable)
	assert.Assert(s.T(), !errors.Is(err, domain.ErrPanoramaNotFound))
	assert.ErrorContains(s.T(), err, "content.SetPanoramasHidden")
}

func (s *PanoramaPhasesSuite) TestAPanoramaCarriesItsPhaseAndHidden() {
	p := panoramaFromProto(&contentv1.Panorama{Id: 1, Phase: "post", Hidden: true})
	assert.Equal(s.T(), p.Phase, "post")
	assert.Assert(s.T(), p.Hidden)
	// A content-service that predates phases sends none; every panorama it
	// knows is in prior (spec D3).
	assert.Equal(s.T(), panoramaFromProto(&contentv1.Panorama{Id: 2}).Phase, domain.PhasePrior)
}

func (s *PanoramaPhasesSuite) TestCreateCarriesThePhase() {
	cc := &phaseCC{}
	c := &Client{cc: cc}
	got, err := c.CreatePanorama(s.T().Context(), domain.Panorama{TerritorySlug: "yard", Title: "North", Phase: "current"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.create.GetPhase(), "current")
	assert.Equal(s.T(), got.Phase, "current")
}
