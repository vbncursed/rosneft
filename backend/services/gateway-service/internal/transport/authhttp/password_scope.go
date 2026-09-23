package authhttp

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// errWiderTerritories refuses a reset whose target can open a territory the
// caller cannot. Worded as auth-service's ErrPrivilegeEscalation, which refuses
// the permission half of the same escalation, so both read alike.
var errWiderTerritories = status.Error(codes.PermissionDenied, "you cannot grant access you do not have yourself")

// assertCoversTerritories is the territory half of auth-service's assertCovers.
// Setting a password lets the caller sign in as the target, so a non-Root
// caller may reset only someone whose territories it can already open. Auth
// compares permissions but cannot see territory grants — they live in the
// catalog — which is why this runs here, the one place that talks to both.
//
// The target's territories are what its own session would list: the catalog
// scoped to its territory key, which auth computes as ValidateToken does — its
// own id for a guest, its Company Owner's for a member. Not its raw id: a
// users:read_all caller reaches members of other companies, whose own id holds
// no assignment while their company's territories are all open to them.
func (h *Handlers) assertCoversTerritories(ctx context.Context, token, targetID string) error {
	scope, allAccess := Scope(ctx)
	if allAccess {
		return nil
	}
	// Auth's own scope first: an id the caller cannot manage answers its 404,
	// never a 403 that would confirm the account exists.
	target, err := h.client.GetUser(ctx, token, targetID)
	if err != nil {
		return err
	}
	if target.GetIsOwner() {
		return errWiderTerritories // Root opens every territory
	}
	held, err := h.visibleSlugs(ctx, target.GetTerritoryScopeId())
	if err != nil {
		return status.Errorf(codes.Unavailable, "password reset: target territories: %v", err)
	}
	if len(held) == 0 {
		return nil
	}
	visible, err := h.visibleSlugs(ctx, scope)
	if err != nil {
		return status.Errorf(codes.Unavailable, "password reset: caller territories: %v", err)
	}
	for slug := range held {
		if !visible[slug] {
			return errWiderTerritories
		}
	}
	return nil
}

// visibleSlugs is the set GET /api/territories lists for a non-Root scope, the
// caller's or the target's. An empty scope sees nothing: to the catalog it
// would mean every territory.
func (h *Handlers) visibleSlugs(ctx context.Context, scope string) (map[string]bool, error) {
	visible := map[string]bool{}
	if scope == "" {
		return visible, nil
	}
	mine, err := h.territories.ListTerritories(ctx, scope, false)
	if err != nil {
		return nil, err
	}
	for _, t := range mine {
		visible[t.Slug] = true
	}
	return visible, nil
}
