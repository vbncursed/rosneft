package domain

import (
	"fmt"
	"slices"
)

// AssertGrantable enforces no-privilege-escalation: a non-owner actor may only
// grant permissions that are a subset of its own. granted is the full set the
// operation would confer (a role's permissions, or the union across the roles
// assigned to a user). Owners are the root of trust and bypass the check.
func AssertGrantable(actorPerms, granted []string, actorIsOwner bool) error {
	if actorIsOwner {
		return nil
	}
	for _, g := range granted {
		if !slices.Contains(actorPerms, g) {
			return fmt.Errorf("%w: %s", ErrPrivilegeEscalation, g)
		}
	}
	return nil
}
