package authhttp

import (
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// factorSet holds the user ids for which one authentication factor is on.
//
// A nil set is NOT an empty one. Empty means "we asked and nobody has it"; nil
// means the owning service (twofa / passkey) never answered, so the state is
// unknown. Collapsing that to "off" is exactly the failure this type exists to
// prevent: the admin console printing an unverified "No".
type factorSet map[string]struct{}

// state answers tri-state: nil for unknown, otherwise a pointer to on/off.
func (f factorSet) state(userID string) *bool {
	if f == nil {
		return nil
	}
	// &ok, not new(ok): staticcheck does not yet model Go 1.26's new(expr) and
	// reports SA4006 "value never used" for it. This is an address-of on an
	// existing variable, not the pointer-to-literal case CLAUDE.md rules on.
	_, ok := f[userID]
	return &ok
}

func credToJSON(c *passkeyv1.Credential) map[string]any {
	return map[string]any{
		"id":         c.GetId(),
		"name":       c.GetName(),
		"createdAt":  c.GetCreatedAt(),
		"lastUsedAt": c.GetLastUsedAt(),
	}
}

type userJSON struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Status   string `json:"status"`
	// TOTPEnabled and PasskeyEnabled are tri-state on the wire: an absent key
	// means the owning service could not answer. They never come from the proto
	// user — auth-service does not own either factor and leaves both zero — so
	// they are filled from the overlaid factorSets and from nowhere else.
	TOTPEnabled    *bool    `json:"totpEnabled,omitempty"`
	PasskeyEnabled *bool    `json:"passkeyEnabled,omitempty"`
	RoleSlugs      []string `json:"roleSlugs"`
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

// userToJSON requires both factor sets by construction. There is deliberately
// no overload that omits them: eight handlers used to call a bare converter and
// every one of them shipped a hardcoded "2FA: off" for months. A route that
// cannot obtain the sets has to pass nil and say "unknown" out loud.
func userToJSON(u *authv1.User, totp, passkeys factorSet) userJSON {
	return userJSON{
		ID:                  u.GetId(),
		Email:               u.GetEmail(),
		Username:            u.GetUsername(),
		Status:              u.GetStatus(),
		TOTPEnabled:         totp.state(u.GetId()),
		PasskeyEnabled:      passkeys.state(u.GetId()),
		RoleSlugs:           u.GetRoleSlugs(),
		RoleTitles:          u.GetRoleTitles(),
		Permissions:         u.GetPermissions(),
		IsOwner:             u.GetIsOwner(),
		OnboardingToursSeen: u.GetOnboardingToursSeen(),
	}
}

func usersToJSON(in []*authv1.User, totp, passkeys factorSet) []userJSON {
	out := make([]userJSON, 0, len(in))
	for _, u := range in {
		out = append(out, userToJSON(u, totp, passkeys))
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
