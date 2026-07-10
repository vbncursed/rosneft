package users

import (
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// maxToursSeen caps how far a client can grow the array. Tour ids live in the
// frontend, so the service validates their shape and count, never membership.
const maxToursSeen = 16

// MarkTourSeen records that the caller finished or skipped one first-run tour.
// Idempotent: the client fires this on both skip and finish, and a late finish
// must not append the same tour twice.
func (s *Service) MarkTourSeen(ctx context.Context, userID, tour string) error {
	if err := validate.TourID(tour); err != nil {
		return err
	}
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if slices.Contains(u.OnboardingToursSeen, tour) || len(u.OnboardingToursSeen) >= maxToursSeen {
		return nil
	}
	return s.store.MarkTourSeen(ctx, userID, tour)
}
