package grpcapi_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/transport/grpcapi/mocks"
)

// ListUsers hands the service the session's own Root flag, which is what lets
// the service skip looking the actor up. users:read_all widens the scope and
// must not pass for Root.
func TestListUsersPassesTheSessionsRootFlag(t *testing.T) {
	for _, tc := range []struct {
		name     string
		perms    []string
		isOwner  bool
		scopeAll bool
	}{
		{name: "root", isOwner: true, scopeAll: true},
		{name: "users:read_all is not root", perms: []string{"users:read_all"}, scopeAll: true},
		{name: "a scoped reader", perms: []string{"users:read"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mc := minimock.NewController(t)
			auth, users := mocks.NewAuthFlowMock(mc), mocks.NewUsersSvcMock(mc)
			auth.ValidateTokenMock.Expect(t.Context(), "tok").Return("u1", tc.perms, tc.isOwner, "", "", false, nil)
			users.ListMock.Expect(t.Context(), "u1", tc.isOwner, tc.scopeAll, "active", false).
				Return([]domain.User{{ID: "u2"}}, nil)

			out, err := grpcapi.New(auth, users, mocks.NewRolesSvcMock(mc)).
				ListUsers(t.Context(), &authv1.ListUsersRequest{Token: "tok", Status: "active"})
			assert.NilError(t, err)
			assert.Equal(t, len(out.GetUsers()), 1)
		})
	}
}

// GetUser carries the target's territory scope key, so the gateway can compare
// what signing in as it would open against what the caller can open.
func TestGetUserCarriesTheTerritoryScope(t *testing.T) {
	mc := minimock.NewController(t)
	auth, users := mocks.NewAuthFlowMock(mc), mocks.NewUsersSvcMock(mc)
	auth.ValidateTokenMock.Expect(t.Context(), "tok").Return("u1", []string{"users:read_all"}, false, "", "", false, nil)
	member := domain.User{ID: "m1", RoleSlugs: []string{"viewer"}}
	users.GetMock.Expect(t.Context(), "u1", true, "m1").Return(member, nil)
	auth.TerritoryScopeMock.Expect(t.Context(), member).Return("co-b", nil)

	out, err := grpcapi.New(auth, users, mocks.NewRolesSvcMock(mc)).
		GetUser(t.Context(), &authv1.GetUserRequest{Token: "tok", Id: "m1"})
	assert.NilError(t, err)
	assert.Equal(t, out.GetTerritoryScopeId(), "co-b")
}
