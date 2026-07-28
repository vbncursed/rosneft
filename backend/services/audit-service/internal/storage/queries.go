package storage

import (
	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// entryColumns is the projection every entry scan expects, in order.
const entryColumns = `id, at, actor_id, company_id, action, entity, entity_id,
	entity_label, old_row, new_row, request_id, result`

// scanEntry maps one row onto domain.Entry. Every nullable column becomes an
// empty string rather than a pointer — a system change reads as "no actor", and
// the transport has no null to special-case.
func scanEntry(row pgx.Row) (domain.Entry, error) {
	var (
		e                                                        domain.Entry
		actor, company, entityID, label, oldRow, newRow, request *string
	)
	if err := row.Scan(&e.ID, &e.At, &actor, &company, &e.Action, &e.Entity,
		&entityID, &label, &oldRow, &newRow, &request, &e.Result); err != nil {
		return domain.Entry{}, err
	}
	e.ActorID = deref(actor)
	e.CompanyID = deref(company)
	e.EntityID = deref(entityID)
	e.EntityLabel = deref(label)
	e.OldRow = deref(oldRow)
	e.NewRow = deref(newRow)
	e.RequestID = deref(request)
	return e, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
