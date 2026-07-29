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
// token is the caller's bearer, forwarded to auth so the actor ids in the result
// can be turned into logins. It carries no authority of its own here: the tenant
// scope above is what limits the rows, and the token only proves to auth that a
// real session is asking.
// wantRefs asks for the dictionary naming the ids inside the row snapshots. The
// CSV export passes false: it prints no snapshots, and it pages the whole result
// 200 rows at a time, so it would buy a dictionary per page and throw each away.
// A read_own caller has their actor filter OVERWRITTEN rather than merged: the
// pin is the boundary, and honouring ?actor= alongside it would let them ask
// about somebody else.
func (g *Gateway) ListAudit(
	ctx context.Context, q domain.AuditQuery, p domain.AuditPrincipal, token string, wantRefs bool,
) ([]domain.AuditEntry, int64, map[string]string, error) {
	sc, err := AuditScope(p)
	if err != nil {
		return nil, 0, nil, err
	}
	q.AllCompanies = sc.All
	q.CompanyID = sc.Company
	if sc.Actor != "" {
		q.ActorID = sc.Actor
	}
	entries, next, err := g.audit.ListEntries(ctx, q)
	if err != nil {
		return nil, 0, nil, err
	}
	entries = g.labelAuditEntries(ctx, token, entries)
	if !wantRefs {
		return entries, next, nil, nil
	}
	return entries, next, g.resolveRowRefs(ctx, token, entries), nil
}

// RecordAuditEvent appends an event no trigger can see (login, logout, password
// change).
func (g *Gateway) RecordAuditEvent(ctx context.Context, e domain.AuditEvent) error {
	return g.audit.Record(ctx, e)
}
