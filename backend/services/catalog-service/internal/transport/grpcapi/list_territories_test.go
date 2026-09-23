package grpcapi_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

// ListsSuite pins that the list RPCs carry each row's LOD chain onto the wire;
// storage fills it, and a converter that dropped it would ship empty lods.
type ListsSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestListsSuite(t *testing.T) { suite.Run(t, new(ListsSuite)) }

func (s *ListsSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

var chain = []domain.Artifact{{Slug: "yard", LOD: 0, Hash: "h0"}, {Slug: "yard", LOD: 1, Hash: "h1"}}

func (s *ListsSuite) TestListTerritoriesCarriesEachChain() {
	s.svc.ListTerritoriesMock.Expect(s.ctx, "").Return([]domain.Territory{{Slug: "yard", Artifacts: chain}}, nil)
	out, err := s.srv.ListTerritories(s.ctx, &catalogv1.ListTerritoriesRequest{})
	assert.NilError(s.T(), err)
	arts := out.GetTerritories()[0].GetArtifacts()
	assert.Equal(s.T(), len(arts), 2)
	assert.Equal(s.T(), arts[1].GetLod(), uint32(1))
	assert.Equal(s.T(), arts[1].GetHash(), "h1")
	assert.Equal(s.T(), arts[1].GetTerritorySlug(), "yard")
}

func (s *ListsSuite) TestListModelsCarriesEachChain() {
	s.svc.ListModelsMock.Expect(s.ctx).Return([]domain.Model{{Slug: "yard", Artifacts: chain}}, nil)
	out, err := s.srv.ListModels(s.ctx, &catalogv1.ListModelsRequest{})
	assert.NilError(s.T(), err)
	arts := out.GetModels()[0].GetArtifacts()
	assert.Equal(s.T(), len(arts), 2)
	assert.Equal(s.T(), arts[0].GetHash(), "h0")
	assert.Equal(s.T(), arts[0].GetModelSlug(), "yard")
}
