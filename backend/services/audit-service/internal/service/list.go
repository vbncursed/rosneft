package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

const (
	defaultLimit int32 = 50
	maxLimit     int32 = 200
)

// List returns one page of journal entries plus the cursor for the next page
// (0 when there is none).
//
// A scoped read with no company id is refused rather than executed: the query
// would degrade to "rows whose company_id IS NULL", which is exactly the set of
// Root and system actions a Company Owner must never see. Failing closed here
// means a bug upstream produces an error, not a privacy breach.
//
// The store is asked for limit+1 rows; the extra row only signals that another
// page exists and is dropped before returning.
func (s *Service) List(ctx context.Context, f domain.Filter) ([]domain.Entry, int64, error) {
	if !f.AllCompanies && f.CompanyID == "" {
		return nil, 0, fmt.Errorf("audit.List: %w: company id required for a scoped read", domain.ErrInvalidInput)
	}
	want := f.Limit
	if want <= 0 {
		want = defaultLimit
	}
	want = min(want, maxLimit)

	q := f
	q.Limit = want + 1
	rows, err := s.store.List(ctx, q)
	if err != nil {
		return nil, 0, err
	}
	if int32(len(rows)) <= want {
		return rows, 0, nil
	}
	rows = rows[:want]
	return rows, rows[len(rows)-1].ID, nil
}
