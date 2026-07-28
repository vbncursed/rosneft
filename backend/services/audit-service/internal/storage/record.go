package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Record inserts a non-row event. Empty ids are stored as NULL so they read
// back the same way trigger-captured system changes do.
func (r *PG) Record(ctx context.Context, e domain.Entry) (int64, error) {
	const q = `
		INSERT INTO audit_log (actor_id, company_id, action, entity, entity_id,
		                       entity_label, request_id, result)
		VALUES (NULLIF($1,'')::UUID, NULLIF($2,'')::UUID, $3, $4,
		        NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), $8)
		RETURNING id`

	var id int64
	err := r.pool.QueryRow(ctx, q, e.ActorID, e.CompanyID, e.Action, e.Entity,
		e.EntityID, e.EntityLabel, e.RequestID, e.Result).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("storage.Record: %w", err)
	}
	return id, nil
}
