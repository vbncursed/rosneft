package service

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// AuditScope maps a principal onto the journal's tenant filter.
//
// Root reads every row. Everyone else is pinned to their own company, taken
// from the principal and never from the request — a client-supplied company id
// would let one Company Owner read another's history.
//
// A caller who is neither Root nor attached to a company is refused rather than
// given an empty filter: an empty company with allCompanies=false matches the
// rows whose company_id IS NULL, which are precisely Root's and the system's
// actions. Failing closed turns an upstream bug into an error instead of a
// disclosure.
func AuditScope(isOwner bool, companyID string) (allCompanies bool, company string, err error) {
	if isOwner {
		return true, "", nil
	}
	if companyID == "" {
		return false, "", domain.ErrForbidden
	}
	return false, companyID, nil
}
