package service

import (
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// AuditScope maps a principal onto the company journal's filter.
//
// Root reads every row. A holder of audit:read is pinned to their own company,
// taken from the principal and never from the request — a client-supplied
// company id would let one Company Owner read another's history.
//
// audit:read_own does NOT reach here. It opens /api/audit/mine and nothing
// else: the two journals are separate routes, so "whose rows" is decided by
// which route was called rather than by which grant the caller happens to hold.
// Deciding it by grant is what let a Company Owner — who holds both — read the
// whole company under a heading that said "My activity".
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
	return domain.AuditScope{}, domain.ErrForbidden
}

// AuditOwnScope maps a principal onto their own actions.
//
// The actor is always the caller's own id — including for Root, who reads this
// route to see what they did rather than what everyone did. Either grant
// reaches it: audit:read_own by definition, and audit:read because a Company
// Owner carries that one too and must not lose their own account page.
//
// A principal with no user id is refused rather than left unpinned: without an
// actor the filter would fall back to the company, which is the opposite of
// what this route promises.
//
// Company rides along with Actor even though the actor alone already identifies
// the rows. It costs nothing and keeps the filter honest if a user id is ever
// reused across tenants.
func AuditOwnScope(p domain.AuditPrincipal) (domain.AuditScope, error) {
	if p.UserID == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if p.IsOwner {
		return domain.AuditScope{All: true, Actor: p.UserID}, nil
	}
	if p.Company == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if slices.ContainsFunc(p.Perms, isAuditReadGrant) {
		return domain.AuditScope{Company: p.Company, Actor: p.UserID}, nil
	}
	return domain.AuditScope{}, domain.ErrForbidden
}

func isAuditReadGrant(perm string) bool {
	return perm == "audit:read" || perm == "audit:read_own"
}
