package service

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// CountAuditDay counts the journal rows in the 24 hourly buckets the audit page
// draws, from the start of the hour 23 hours before now's, within sc. One row
// with IncludeTotal: the rows themselves are not wanted, only the count, so
// nothing is labelled and auth is not asked.
func (g *Gateway) CountAuditDay(ctx context.Context, sc domain.AuditScope, now time.Time) (int64, error) {
	page, err := g.audit.ListEntries(ctx, domain.AuditQuery{
		AllCompanies: sc.All,
		CompanyID:    sc.Company,
		ActorID:      sc.Actor,
		From:         now.Truncate(time.Hour).Add(-23 * time.Hour),
		Limit:        1,
		IncludeTotal: true,
	})
	if err != nil {
		return 0, err
	}
	return page.Total, nil
}
