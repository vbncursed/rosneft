package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ResolveLabels names roles and permissions for the audit journal. The token is
// validated so the call needs a real session rather than only network reach;
// its company scope is deliberately not applied, as on ResolveUserLogins.
func (s *Server) ResolveLabels(
	ctx context.Context, req *authv1.ResolveLabelsRequest,
) (*authv1.ResolveLabelsResponse, error) {
	if _, _, _, err := s.roleActor(ctx, req.GetToken()); err != nil {
		return nil, mapError(err)
	}
	refs := make([]domain.LabelRef, 0, len(req.GetRefs()))
	for _, r := range req.GetRefs() {
		refs = append(refs, domain.LabelRef{Kind: r.GetKind(), ID: r.GetId()})
	}
	labels, err := s.roles.ResolveLabels(ctx, refs)
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.ResolveLabelsResponse{Labels: labels}, nil
}
