package storage

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// filterWhere renders the predicates List and Count share — everything in the
// filter except paging. Appended only when set, so the planner can use
// audit_log_company_idx for a scoped read, audit_log_actor_idx for one
// actor's, and audit_log_id_idx for the Root's. One builder for two queries:
// the count must answer for exactly the rows the pages walk.
func filterWhere(f domain.Filter) (string, []any) {
	q := ` WHERE 1=1`
	args := make([]any, 0, 8)
	add := func(clause string, v any) {
		args = append(args, v)
		q += fmt.Sprintf(clause, len(args))
	}
	if !f.AllCompanies {
		add(" AND company_id = $%d", f.CompanyID)
	}
	if f.ActorID != "" {
		add(" AND actor_id = $%d", f.ActorID)
	}
	if f.Action != "" {
		add(" AND action = $%d", f.Action)
	}
	if f.Entity != "" {
		add(" AND entity = $%d", f.Entity)
	}
	if !f.From.IsZero() {
		add(" AND at >= $%d", f.From)
	}
	if !f.To.IsZero() {
		add(" AND at <= $%d", f.To)
	}
	return q, args
}
