package authhttp

import (
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

type userJSON struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	Username    string   `json:"username"`
	Status      string   `json:"status"`
	TOTPEnabled bool     `json:"totpEnabled"`
	RoleSlugs   []string `json:"roleSlugs"`
	Permissions []string `json:"permissions"`
}

func userToJSON(u *authv1.User) userJSON {
	return userJSON{
		ID:          u.GetId(),
		Email:       u.GetEmail(),
		Username:    u.GetUsername(),
		Status:      u.GetStatus(),
		TOTPEnabled: u.GetTotpEnabled(),
		RoleSlugs:   u.GetRoleSlugs(),
		Permissions: u.GetPermissions(),
	}
}

func usersToJSON(in []*authv1.User) []userJSON {
	out := make([]userJSON, 0, len(in))
	for _, u := range in {
		out = append(out, userToJSON(u))
	}
	return out
}

type roleJSON struct {
	Slug            string   `json:"slug"`
	Title           string   `json:"title"`
	IsSystem        bool     `json:"isSystem"`
	PermissionSlugs []string `json:"permissionSlugs"`
}

func roleToJSON(r *authv1.Role) roleJSON {
	return roleJSON{Slug: r.GetSlug(), Title: r.GetTitle(), IsSystem: r.GetIsSystem(), PermissionSlugs: r.GetPermissionSlugs()}
}

func rolesToJSON(in []*authv1.Role) []roleJSON {
	out := make([]roleJSON, 0, len(in))
	for _, r := range in {
		out = append(out, roleToJSON(r))
	}
	return out
}

type permissionJSON struct {
	Slug        string `json:"slug"`
	Description string `json:"description"`
}

func permissionsToJSON(in []*authv1.Permission) []permissionJSON {
	out := make([]permissionJSON, 0, len(in))
	for _, p := range in {
		out = append(out, permissionJSON{Slug: p.GetSlug(), Description: p.GetDescription()})
	}
	return out
}
