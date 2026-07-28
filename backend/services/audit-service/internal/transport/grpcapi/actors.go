package grpcapi

import (
	"context"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// ListActors returns the actors present in the caller's slice of the journal.
func (s *Server) ListActors(ctx context.Context, req *auditv1.ListActorsRequest) (*auditv1.ListActorsResponse, error) {
	ids, err := s.svc.Actors(ctx, domain.Filter{
		AllCompanies: req.GetAllCompanies(),
		CompanyID:    req.GetCompanyId(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &auditv1.ListActorsResponse{ActorIds: ids}, nil
}
