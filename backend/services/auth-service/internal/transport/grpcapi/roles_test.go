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

// The flag is the whole difference between "rename" and "rename and strip every
// grant": an empty list with it set must reach the service as a replace, and a
// list without it must not.
func TestUpdateRolePassesReplacePermissionsThrough(t *testing.T) {
	for _, tc := range []struct {
		name string
		req  *authv1.UpdateRoleRequest
		want domain.RoleUpdate
	}{
		{
			name: "an empty replace strips the grants",
			req:  &authv1.UpdateRoleRequest{Token: "tok", Slug: "viewer", Title: "Viewer", ReplacePermissions: true},
			want: domain.RoleUpdate{Slug: "viewer", Title: "Viewer", ReplacePermissions: true},
		},
		{
			name: "a replace carries its slugs",
			req: &authv1.UpdateRoleRequest{
				Token: "tok", Slug: "viewer", Title: "Viewer",
				PermissionSlugs: []string{"territory:read"}, ReplacePermissions: true,
			},
			want: domain.RoleUpdate{
				Slug: "viewer", Title: "Viewer", PermissionSlugs: []string{"territory:read"}, ReplacePermissions: true,
			},
		},
		{
			name: "a title alone leaves the grants",
			req:  &authv1.UpdateRoleRequest{Token: "tok", Slug: "viewer", Title: "Viewer"},
			want: domain.RoleUpdate{Slug: "viewer", Title: "Viewer"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mc := minimock.NewController(t)
			auth, roles := mocks.NewAuthFlowMock(mc), mocks.NewRolesSvcMock(mc)
			auth.ValidateTokenMock.Expect(t.Context(), "tok").Return("u1", nil, false, "admin-1", "admin-1", false, nil)
			roles.UpdateMock.Expect(t.Context(), "u1", tc.want, "admin-1", false).
				Return(domain.Role{Slug: "viewer", Title: "Viewer"}, nil)

			out, err := grpcapi.New(auth, mocks.NewUsersSvcMock(mc), roles).UpdateRole(t.Context(), tc.req)
			assert.NilError(t, err)
			assert.Equal(t, out.GetSlug(), "viewer")
		})
	}
}
