package service_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// PanoramaPhasesSuite covers the gateway's guard in front of content: an empty
// or oversized id list, or a phase that is not one of the three, never costs
// an RPC. Ids are content's to judge; they come back as NotFound.
type PanoramaPhasesSuite struct {
	suite.Suite
	con *mocks.ContentMock
	svc *service.Gateway
	ctx context.Context
}

func TestPanoramaPhasesSuite(t *testing.T) { suite.Run(t, new(PanoramaPhasesSuite)) }

func (s *PanoramaPhasesSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.con = mocks.NewContentMock(mc)
	s.svc = service.New(mocks.NewCatalogMock(mc), s.con, mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

func (s *PanoramaPhasesSuite) TestBulkWritesAreBoundedBeforeContentIsAsked() {
	for _, ids := range [][]int64{nil, make([]int64, 1001)} {
		_, err := s.svc.SetPanoramasHidden(s.ctx, "yard", ids, true)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		assert.ErrorContains(s.T(), err, "panoramas")
		_, err = s.svc.SetPanoramasPhase(s.ctx, "yard", ids, domain.PhasePost)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

// The phase is exact: case and whitespace are not forgiven, and "" is not
// prior on a move or a flag (only on create, where it is the default).
func (s *PanoramaPhasesSuite) TestAnUnknownPhaseIsRefusedBeforeContentIsAsked() {
	for _, phase := range []string{"", "Prior", " post", "during"} {
		_, err := s.svc.SetPanoramasPhase(s.ctx, "yard", []int64{1}, phase)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		_, err = s.svc.SetPanoramaPhaseHidden(s.ctx, "yard", phase, true)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
	for _, phase := range []string{"Prior", "during"} {
		_, err := s.svc.CreatePanorama(s.ctx, domain.Panorama{
			TerritorySlug: "yard", Title: "North", SourceBlobHash: "h", Phase: phase,
		}, domain.BlobScope{AllAccess: true})
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

// No phase on create is prior, and content fills it in: the gateway sends "".
func (s *PanoramaPhasesSuite) TestCreateWithoutAPhaseReachesContent() {
	p := domain.Panorama{TerritorySlug: "yard", Title: "North", SourceBlobHash: "h"}
	s.con.CreatePanoramaMock.Expect(s.ctx, p).Return(domain.Panorama{ID: 1, Phase: "prior"}, nil)
	got, err := s.svc.CreatePanorama(s.ctx, p, domain.BlobScope{AllAccess: true})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Phase, "prior")
}

func (s *PanoramaPhasesSuite) TestWritesReachContent() {
	s.con.SetPanoramasHiddenMock.Expect(s.ctx, "yard", []int64{1, 2}, true).Return(2, nil)
	n, err := s.svc.SetPanoramasHidden(s.ctx, "yard", []int64{1, 2}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)

	s.con.SetPanoramasPhaseMock.Expect(s.ctx, "yard", []int64{3}, "current").Return(1, nil)
	n, err = s.svc.SetPanoramasPhase(s.ctx, "yard", []int64{3}, "current")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)

	want := domain.PanoramaPhase{Phase: "post", Hidden: true}
	s.con.SetPanoramaPhaseHiddenMock.Expect(s.ctx, "yard", "post", true).Return(want, nil)
	got, err := s.svc.SetPanoramaPhaseHidden(s.ctx, "yard", "post", true)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, want)
}

func (s *PanoramaPhasesSuite) TestARefusalFromContentPassesThrough() {
	s.con.SetPanoramasHiddenMock.Return(0, domain.ErrPanoramaNotFound)
	_, err := s.svc.SetPanoramasHidden(s.ctx, "yard", []int64{9}, true)
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
}
