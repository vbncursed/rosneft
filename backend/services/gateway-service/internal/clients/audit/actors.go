package audit

import (
	"context"
	"fmt"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListActors returns the actor ids present in the caller's slice of the journal.
//
// MapStatus for the same reason as ListEntries: a scope the service refuses must
// arrive at the HTTP layer as the gateway's own sentinel, or it answers 500 to
// what is a bad request.
func (c *Client) ListActors(ctx context.Context, q domain.AuditQuery) ([]string, error) {
	resp, err := c.cc.ListActors(ctx, &auditv1.ListActorsRequest{
		AllCompanies: q.AllCompanies,
		CompanyId:    q.CompanyID,
	})
	if err != nil {
		return nil, fmt.Errorf("audit.ListActors: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetActorIds(), nil
}
