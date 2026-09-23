package bootstrap

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/summary"
)

// ConsoleCountsSuite pins that each card counts only what its screen would
// show this caller. The auth and Prometheus clients are nil: the cards under
// test never reach them.
type ConsoleCountsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
}

func TestConsoleCountsSuite(t *testing.T) { suite.Run(t, new(ConsoleCountsSuite)) }

func (s *ConsoleCountsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
}

// tenant-a's owner counts tenant-a's territories, never tenant-b's.
func (s *ConsoleCountsSuite) TestContentCountsOnlyTheCallersTerritories() {
	ctx := authhttp.NewTestContext(s.T().Context(), false, "admin-a")
	s.cat.ListTerritoriesMock.Expect(ctx, "admin-a").Return([]domain.Territory{{Slug: "tenant-a-scene"}}, nil)
	s.cat.ListModelsMock.Expect(ctx).Return([]domain.Model{{Slug: "pump"}, {Slug: "tank"}}, nil)

	got, err := consoleCounts(s.svc, nil, nil)["content"](ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, summary.Content{Territories: 1, Models: 2})
}

// An empty scope means "every territory" to the catalog, so a non-Root caller
// without one must count none, exactly as GET /api/territories answers [].
func (s *ConsoleCountsSuite) TestContentFailsClosedOnAnEmptyScope() {
	ctx := authhttp.NewTestContext(s.T().Context(), false, "")
	s.cat.ListModelsMock.Expect(ctx).Return([]domain.Model{{Slug: "pump"}}, nil)

	got, err := consoleCounts(s.svc, nil, nil)["content"](ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, summary.Content{Territories: 0, Models: 1})
}

func (s *ConsoleCountsSuite) TestAccessSumsEveryTerritorysGrants() {
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")
	s.cat.ListTerritoriesMock.Expect(ctx, "").Return([]domain.Territory{{Slug: "a"}, {Slug: "b"}}, nil)
	s.cat.ListTerritoryAdminsMock.Expect(ctx, []string{"a", "b"}).
		Return(map[string][]string{"a": {"u1", "u2"}, "b": {"u1"}}, nil)

	got, err := consoleCounts(s.svc, nil, nil)["access"](ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, 3)
}

// Access is a Root card, but its source fails closed on its own: a scoped
// caller with no admin id counts nothing, and the catalog is never asked.
func (s *ConsoleCountsSuite) TestAccessFailsClosedOnAnEmptyScope() {
	ctx := authhttp.NewTestContext(s.T().Context(), false, "")

	got, err := consoleCounts(s.svc, nil, nil)["access"](ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, 0)
}

func (s *ConsoleCountsSuite) TestUsersCountsTheFrozenAmongTheLive() {
	got := countUsers([]*authv1.User{{Status: "active"}, {Status: "frozen"}, {Status: "active"}})
	assert.DeepEqual(s.T(), got, summary.Users{Total: 3, Frozen: 1})
}
