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
// The target's territories are ListTerritories scoped to its own id: the
// catalog's scope filter is exactly "assigned to this admin id", and only
// Guests and Company Owners, the self-keyed roles, are ever assigned any.
func (h *Handlers) assertCoversTerritories(ctx context.Context, token, targetID string) error {
	scope, allAccess := Scope(ctx)
	if allAccess {
		return nil
	}
	// Auth's own scope first: an id the caller cannot manage answers its 404,
	// never a 403 that would confirm the account exists.
	if _, err := h.client.GetUser(ctx, token, targetID); err != nil {
		return err
	}
	held, err := h.territories.ListTerritories(ctx, targetID, false)
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
	for _, t := range held {
		if !visible[t.Slug] {
			return errWiderTerritories
		}
	}
	return nil
}

// visibleSlugs is the set GET /api/territories lists for a non-Root scope. An
// empty scope sees nothing: to the catalog it would mean every territory.
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
