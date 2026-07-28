package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Record appends an event that is not a row change — a login, a logout, a
// password change. Triggers cannot see these: sessions live in Redis, not in a
// table.
func (s *Service) Record(ctx context.Context, e domain.Entry) (int64, error) {
	if e.Action == "" {
		return 0, fmt.Errorf("audit.Record: %w: action required", domain.ErrInvalidInput)
	}
	if e.Result == "" {
		e.Result = "ok"
	}
	return s.store.Record(ctx, e)
}
