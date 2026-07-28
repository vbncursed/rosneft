package users

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetRoles replaces the user's role set with roleSlugs.
//
// audittx.Run supplies the transaction the delete-then-insert already needed
// and publishes the actor with it, so every user_roles row removed and added
// lands in the journal under whoever changed the assignment.
func (s *Store) SetRoles(ctx context.Context, id string, roleSlugs []string) (domain.User, error) {
	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, id); err != nil {
			return fmt.Errorf("users.SetRoles: clear: %w", err)
		}
		return bindRoles(ctx, tx, id, roleSlugs)
	})
	if err != nil {
		return domain.User{}, err
	}
	return s.GetByID(ctx, id)
}
