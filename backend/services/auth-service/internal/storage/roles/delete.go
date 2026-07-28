package roles

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
)

// Delete removes a role. Refused for system roles and for roles outside the
// actor's group (see assertMutable). A role still assigned to users fails on the
// user_roles FK (RESTRICT) — surfaced wrapped.
//
// Wrapped in audittx.Run: the row is gone afterwards, so the journal snapshot
// is the only remaining record of what the role granted.
func (s *Store) Delete(ctx context.Context, slug, scopeAdminID string, allAccess bool) error {
	if err := s.assertMutable(ctx, slug, scopeAdminID, allAccess); err != nil {
		return err
	}
	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		_, execErr := tx.Exec(ctx, `DELETE FROM roles WHERE slug = $1`, slug)
		return execErr
	})
	if err != nil {
		return fmt.Errorf("roles.Delete: %w", err)
	}
	return nil
}
