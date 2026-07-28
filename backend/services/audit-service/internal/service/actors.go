package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Actors lists every actor present in the caller's slice of the journal, so the
// filter can offer the whole scope rather than whoever is on the loaded page.
//
// The same fail-closed check as List, for the same reason: a scoped read with no
// company id would degrade to "rows whose company_id IS NULL", which is exactly
// the Root and system actions a Company Owner must never see. Refusing means a
// bug upstream produces an error rather than a privacy breach.
func (s *Service) Actors(ctx context.Context, f domain.Filter) ([]string, error) {
	if !f.AllCompanies && f.CompanyID == "" {
		return nil, fmt.Errorf("audit.Actors: %w: company id required for a scoped read", domain.ErrInvalidInput)
	}
	return s.store.DistinctActors(ctx, f)
}
