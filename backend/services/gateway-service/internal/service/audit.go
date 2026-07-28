package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListAudit reads one page of the journal.
//
// The tenant filter is derived here from the principal, never taken from q —
// the handler fills in only the user-facing filters (actor, action, entity,
// time range, paging). Accepting a company id from the request would let one
// Company Owner read another's history.
func (g *Gateway) ListAudit(ctx context.Context, q domain.AuditQuery, isOwner bool, companyID string) ([]domain.AuditEntry, int64, error) {
	all, company, err := AuditScope(isOwner, companyID)
	if err != nil {
		return nil, 0, err
	}
	q.AllCompanies = all
	q.CompanyID = company
	return g.audit.ListEntries(ctx, q)
}

// RecordAuditEvent appends an event no trigger can see (login, logout, password
// change).
func (g *Gateway) RecordAuditEvent(ctx context.Context, e domain.AuditEvent) error {
	return g.audit.Record(ctx, e)
}
