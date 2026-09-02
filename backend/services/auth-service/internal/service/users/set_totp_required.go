package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTPRequired records that an account must (or need not) carry a second
// factor. Owner-scoped like every other change to somebody else's account.
//
// No self-target guard, unlike Freeze and SoftDelete: those exist because an
// admin can lock themselves or the last admin out, while requiring a second
// factor of yourself locks nobody out — the enrollment path stays open to a
// required-but-not-enrolled session by design.
func (s *Service) SetTOTPRequired(ctx context.Context, actorID string, scopeAll bool, id string, required bool) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetTOTPRequired(ctx, id, required)
}
