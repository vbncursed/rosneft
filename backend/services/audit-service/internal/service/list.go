package service

import (
	"context"
	"fmt"
	"uuid"

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
// A malformed actor is refused for a plainer reason: actor_id is a UUID column,
// so the cast used to fail inside Postgres and surface as a 500 carrying the
// raw SQLSTATE. Filters are user input, and this is the one place both HTTP
// endpoints — the JSON page and the CSV export — pass through, so checking here
// covers both and needs no new plumbing.
//
// The store is asked for limit+1 rows; the extra row only signals that another
// page exists and is dropped before returning.
func (s *Service) List(ctx context.Context, f domain.Filter) ([]domain.Entry, int64, error) {
	if !f.AllCompanies && f.CompanyID == "" {
		return nil, 0, fmt.Errorf("audit.List: %w: company id required for a scoped read", domain.ErrInvalidInput)
	}
	if f.ActorID != "" {
		if _, err := uuid.Parse(f.ActorID); err != nil {
			return nil, 0, fmt.Errorf("audit.List: %w: actor id must be a uuid", domain.ErrInvalidInput)
		}
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
