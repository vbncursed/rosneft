package grpcapi_test

import (
	"fmt"
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

// A refused item answers with its index and the sentinel alone: the gateway
// forwards this message to the browser, so the layers' wrapping stays out.
func (s *CreatePlacementsSuite) TestARefusedItemNamesItsIndexAndNothingElse() {
	for _, tc := range []struct {
		name string
		err  error
		code codes.Code
		msg  string
	}{
		{
			name: "an unknown model",
			err:  fmt.Errorf("storage.CreatePlacements: %w", domain.ItemError{Index: 2, Err: domain.ErrModelNotFound}),
			code: codes.NotFound, msg: "item 2: model not found",
		},
		{
			name: "a bad scale",
			err: fmt.Errorf("service.CreatePlacements: %w",
				domain.ItemError{Index: 0, Err: fmt.Errorf("%w: scale components must be positive", domain.ErrInvalidInput)}),
			code: codes.InvalidArgument, msg: "item 0: invalid input: scale components must be positive",
		},
	} {
		s.Run(tc.name, func() {
			s.svc.CreatePlacementsMock.Return(nil, tc.err)
			_, err := grpcapi.New(s.svc).CreatePlacements(s.T().Context(), &catalogv1.CreatePlacementsRequest{TerritorySlug: "yard"})
			assert.Equal(s.T(), status.Code(err), tc.code)
			assert.Equal(s.T(), status.Convert(err).Message(), tc.msg)
		})
	}
}

func (s *CreatePlacementsSuite) TestAnUnknownTerritoryIsNotFound() {
	s.svc.CreatePlacementsMock.Return(nil, domain.ErrTerritoryNotFound)
	_, err := grpcapi.New(s.svc).CreatePlacements(s.T().Context(), &catalogv1.CreatePlacementsRequest{TerritorySlug: "yard"})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}
