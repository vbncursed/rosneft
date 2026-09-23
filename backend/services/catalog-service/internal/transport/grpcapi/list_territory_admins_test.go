package grpcapi_test

import (
	"cmp"
	"context"
	"slices"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

type TerritoryAdminsSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

func (s *TerritoryAdminsSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

// Every assignment goes out as one pair, and the order within a territory
// survives the flattening; the gateway regroups by slug in arrival order.
func (s *TerritoryAdminsSuite) TestEveryAssignmentBecomesAPairInOrder() {
	s.svc.ListTerritoryAdminsMock.Expect(s.ctx, []string{"a", "b"}).
		Return(map[string][]string{"a": {"u1", "u3"}, "b": {"u2"}}, nil)

	out, err := s.srv.ListTerritoryAdmins(s.ctx, &catalogv1.ListTerritoryAdminsRequest{Slugs: []string{"a", "b"}})
	assert.NilError(s.T(), err)
	pairs := make([][2]string, 0, len(out.GetAdmins()))
	for _, a := range out.GetAdmins() {
		pairs = append(pairs, [2]string{a.GetTerritorySlug(), a.GetAdminUserId()})
	}
	// Territories come out in map order; only the order inside one is contract.
	slices.SortStableFunc(pairs, func(x, y [2]string) int { return cmp.Compare(x[0], y[0]) })
	assert.DeepEqual(s.T(), pairs, [][2]string{{"a", "u1"}, {"a", "u3"}, {"b", "u2"}})
}
