package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// ResolveBlobAccess answers the gateway's asset gate.
//
// A refusal comes back as allowed=false, not as a gRPC error: the caller turns
// a refusal into a 404 but a transport failure into a 503, and collapsing the
// two would make "the catalog is down" look like "the blob is not yours".
func (s *Server) ResolveBlobAccess(
	ctx context.Context, req *catalogv1.ResolveBlobAccessRequest,
) (*catalogv1.ResolveBlobAccessResponse, error) {
	allowed, err := s.svc.ResolveBlobAccess(ctx, req.GetHash(), req.GetScopeAdminId())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.ResolveBlobAccessResponse{Allowed: allowed}, nil
}
