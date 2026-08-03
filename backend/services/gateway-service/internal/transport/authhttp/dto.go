package authhttp

import (
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func credToJSON(c *passkeyv1.Credential) map[string]any {
	return map[string]any{
		"id":         c.GetId(),
		"name":       c.GetName(),
		"createdAt":  c.GetCreatedAt(),
		"lastUsedAt": c.GetLastUsedAt(),
	}
}

type userJSON struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	Username    string   `json:"username"`
	Status      string   `json:"status"`
	TOTPEnabled bool     `json:"totpEnabled"`
	RoleSlugs   []string `json:"roleSlugs"`
	// RoleTitles names each slug in RoleSlugs. The slug is not an abbreviation
	// of the title — slug "admin" is titled "Company Owner", while a different
	// role is slugged "owner" — so a UI that prints the slug names the wrong
	// role rather than the right one tersely.
	RoleTitles  map[string]string `json:"roleTitles,omitzero"`
	Permissions []string          `json:"permissions"`
	IsOwner     bool              `json:"isOwner"`
	// Ids of the first-run tours this user has finished or skipped.
	OnboardingToursSeen []string `json:"onboardingToursSeen,omitzero"`
	// CSRFToken is filled only by /api/auth/me. The SPA keeps it in memory, so a
	// page reload starts without one; this is where it comes back, and meQuery
	// already runs before anything can be mutated. Only listUsers and the other
	// admin handlers leave it empty, and they have no caller that wants it.
	CSRFToken string `json:"csrfToken,omitzero"`
}

func userToJSON(u *authv1.User) userJSON {
	return userJSON{
		ID:                  u.GetId(),
		Email:               u.GetEmail(),
		Username:            u.GetUsername(),
		Status:              u.GetStatus(),
		TOTPEnabled:         u.GetTotpEnabled(),
		RoleSlugs:           u.GetRoleSlugs(),
		RoleTitles:          u.GetRoleTitles(),
		Permissions:         u.GetPermissions(),
		IsOwner:             u.GetIsOwner(),
		OnboardingToursSeen: u.GetOnboardingToursSeen(),
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
