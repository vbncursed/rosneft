package grpcapi_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

type CreatePlacementsSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
}

func TestCreatePlacementsSuite(t *testing.T) { suite.Run(t, new(CreatePlacementsSuite)) }

func (s *CreatePlacementsSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
}

func (s *CreatePlacementsSuite) TestItemsTravelUnderTheBatchTerritoryInOrder() {
	s.svc.CreatePlacementsMock.
		Expect(s.T().Context(), "yard", []domain.Placement{
			{TerritorySlug: "stray", ModelSlug: "pump"},
			{ModelSlug: "tank", Position: domain.Vec3{X: 2}, VisiblePanoramaIDs: []int64{7}},
		}).
		Return([]domain.Placement{{ID: 1, ModelSlug: "pump"}, {ID: 2, ModelSlug: "tank"}}, nil)

	out, err := grpcapi.New(s.svc).CreatePlacements(s.T().Context(), &catalogv1.CreatePlacementsRequest{
		TerritorySlug: "yard",
		Items: []*catalogv1.CreatePlacementRequest{
			{TerritorySlug: "stray", ModelSlug: "pump"},
			{ModelSlug: "tank", Position: &catalogv1.Vec3{X: 2}, VisiblePanoramaIds: []int64{7}},
		},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out.GetPlacements()), 2)
	assert.Equal(s.T(), out.GetPlacements()[1].GetModelSlug(), "tank")
}

func (s *CreatePlacementsSuite) TestAnUnknownModelIsNotFound() {
	s.svc.CreatePlacementsMock.Return(nil, domain.ErrTerritoryNotFound)
	_, err := grpcapi.New(s.svc).CreatePlacements(s.T().Context(), &catalogv1.CreatePlacementsRequest{TerritorySlug: "yard"})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}
