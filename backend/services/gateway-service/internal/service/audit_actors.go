package service

import (
	"cmp"
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListAuditActors returns the actors present in the caller's slice of the
// journal, labelled and sorted by login.
//
// The filter dropdown needs this because the per-entry labels only cover the
// page on screen, and an actor whose entries sit further down the journal would
// otherwise be unselectable.
//
// Unlike the entry labels, a resolution failure here is returned rather than
// swallowed: an unlabelled dropdown is a list of uuids to pick from blindly,
// which is worse than an honest error.
func (g *Gateway) ListAuditActors(ctx context.Context, isOwner bool, companyID, token string) ([]domain.AuditActor, error) {
	all, company, err := AuditScope(isOwner, companyID)
	if err != nil {
		return nil, err
	}
	ids, err := g.audit.ListActors(ctx, domain.AuditQuery{AllCompanies: all, CompanyID: company})
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []domain.AuditActor{}, nil
	}
	// Batched: this list has no ceiling — it is every person who has ever
	// touched the company's data, and it only grows.
	logins, err := g.resolveLoginsBatched(ctx, token, ids)
	if err != nil {
		return nil, err
	}
	out := make([]domain.AuditActor, 0, len(ids))
	for _, id := range ids {
		out = append(out, domain.AuditActor{ID: id, Login: logins[id]})
	}
	// По логину, а не по свежести активности: список выбирают глазами, и
	// алфавит здесь полезнее хронологии.
	slices.SortFunc(out, func(a, b domain.AuditActor) int {
		return cmp.Compare(a.Login, b.Login)
	})
	return out, nil
}
