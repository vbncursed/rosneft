package service

import (
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// AuditScope maps a principal onto the journal's filter.
//
// Root reads every row. A holder of audit:read is pinned to their own company,
// taken from the principal and never from the request — a client-supplied
// company id would let one Company Owner read another's history. A holder of
// only audit:read_own is pinned further, to their own actions.
//
// audit:read wins over audit:read_own when both are present: a Company Owner
// who also carries the narrower grant must not be narrowed by it.
//
// A caller who is neither Root nor attached to a company is refused rather than
// given an empty filter: an empty company with All=false matches the rows whose
// company_id IS NULL, which are precisely Root's and the system's actions.
// Failing closed turns an upstream bug into an error instead of a disclosure.
func AuditScope(p domain.AuditPrincipal) (domain.AuditScope, error) {
	if p.IsOwner {
		return domain.AuditScope{All: true}, nil
	}
	if p.Company == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if slices.Contains(p.Perms, "audit:read") {
		return domain.AuditScope{Company: p.Company}, nil
	}
	if slices.Contains(p.Perms, "audit:read_own") {
		return domain.AuditScope{Company: p.Company, Actor: p.UserID}, nil
	}
	return domain.AuditScope{}, domain.ErrForbidden
}
