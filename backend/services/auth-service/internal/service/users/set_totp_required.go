package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTPRequired records that an account must (or need not) carry a second
// factor. Owner-scoped like every other change to somebody else's account,
// and self-target is refused: nothing here plays the admin/last-admin
// machinery Freeze and SoftDelete do, but a scoped administrator (users:write
// without users:read_all or IsOwner) must not be able to strip a TOTP
// requirement Root imposed on them.
func (s *Service) SetTOTPRequired(ctx context.Context, actorID string, scopeAll bool, id string, required bool) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	if actorID == id {
		return domain.User{}, domain.ErrSelfTarget
	}
	return s.store.SetTOTPRequired(ctx, id, required)
}
