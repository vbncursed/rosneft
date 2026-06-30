package roles

import (
	"context"
	"fmt"
)

// Delete removes a role. Refused for system roles and for roles outside the
// actor's group (see assertMutable). A role still assigned to users fails on the
// user_roles FK (RESTRICT) — surfaced wrapped.
func (s *Store) Delete(ctx context.Context, slug, scopeAdminID string, allAccess bool) error {
	if err := s.assertMutable(ctx, slug, scopeAdminID, allAccess); err != nil {
		return err
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM roles WHERE slug = $1`, slug); err != nil {
		return fmt.Errorf("roles.Delete: %w", err)
	}
	return nil
}
