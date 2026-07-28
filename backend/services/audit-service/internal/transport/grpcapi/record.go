package grpcapi

import (
	"context"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Record appends an event that changed no table — a login, a logout, a password
// change. Triggers cannot see these: sessions live in Redis.
func (s *Server) Record(ctx context.Context, req *auditv1.RecordRequest) (*auditv1.RecordResponse, error) {
	id, err := s.svc.Record(ctx, domain.Entry{
		ActorID:     req.GetActorId(),
		CompanyID:   req.GetCompanyId(),
		Action:      req.GetAction(),
		Entity:      req.GetEntity(),
		EntityID:    req.GetEntityId(),
		EntityLabel: req.GetEntityLabel(),
		RequestID:   req.GetRequestId(),
		Result:      req.GetResult(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &auditv1.RecordResponse{Id: id}, nil
}
