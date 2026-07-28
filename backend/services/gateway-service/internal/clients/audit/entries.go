package audit

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// tsOrNil keeps an unset bound unset. Sending a zero-time timestamp would ask
// the journal for entries after year 1 and silently start excluding rows.
func tsOrNil(t time.Time) *timestamppb.Timestamp {
	if t.IsZero() {
		return nil
	}
	return timestamppb.New(t)
}

// ListEntries returns one page of the journal plus the next cursor (0 = end).
func (c *Client) ListEntries(ctx context.Context, q domain.AuditQuery) ([]domain.AuditEntry, int64, error) {
	resp, err := c.cc.ListEntries(ctx, &auditv1.ListEntriesRequest{
		AllCompanies: q.AllCompanies,
		CompanyId:    q.CompanyID,
		ActorId:      q.ActorID,
		Action:       q.Action,
		Entity:       q.Entity,
		From:         tsOrNil(q.From),
		To:           tsOrNil(q.To),
		Cursor:       q.Cursor,
		Limit:        q.Limit,
	})
	if err != nil {
		// Без MapStatus сюда доезжает голый gRPC status, а isInvalid в
		// транспорте сверяется с сентинелом gateway'я — и отказ по невалидному
		// фильтру уходил бы наружу 500-й вместо 400-й.
		//
		// Сентинел NotFound — nil: у журнала нет такого случая, фильтр без
		// совпадений даёт пустую страницу, а не отсутствующий ресурс. Работает
		// только ветка InvalidArgument.
		return nil, 0, fmt.Errorf("audit.ListEntries: %w", grpcerr.MapStatus(err, nil))
	}
	out := make([]domain.AuditEntry, 0, len(resp.GetEntries()))
	for _, e := range resp.GetEntries() {
		out = append(out, domain.AuditEntry{
			ID:          e.GetId(),
			At:          e.GetAt().AsTime(),
			ActorID:     e.GetActorId(),
			CompanyID:   e.GetCompanyId(),
			Action:      e.GetAction(),
			Entity:      e.GetEntity(),
			EntityID:    e.GetEntityId(),
			EntityLabel: e.GetEntityLabel(),
			OldRow:      e.GetOldRow(),
			NewRow:      e.GetNewRow(),
			Result:      e.GetResult(),
		})
	}
	return out, resp.GetNextCursor(), nil
}

// Record appends one non-row event.
//
// Namesake asymmetry with ListEntries: no MapStatus here on purpose. Nothing
// branches on this error — the caller logs it and moves on, because the user's
// action has already happened — and its inputs come from the session and a
// hardcoded action map, never from the request.
func (c *Client) Record(ctx context.Context, e domain.AuditEvent) error {
	_, err := c.cc.Record(ctx, &auditv1.RecordRequest{
		ActorId:   e.ActorID,
		CompanyId: e.CompanyID,
		Action:    e.Action,
		Entity:    e.Entity,
		Result:    e.Result,
	})
	if err != nil {
		return fmt.Errorf("audit.Record: %w", err)
	}
	return nil
}
