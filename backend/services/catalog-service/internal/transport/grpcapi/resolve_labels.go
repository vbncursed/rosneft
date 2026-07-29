package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ResolveLabels names catalog rows for the audit journal.
func (s *Server) ResolveLabels(
	ctx context.Context, req *catalogv1.ResolveLabelsRequest,
) (*catalogv1.ResolveLabelsResponse, error) {
	refs := make([]domain.LabelRef, 0, len(req.GetRefs()))
	for _, r := range req.GetRefs() {
		refs = append(refs, domain.LabelRef{Kind: r.GetKind(), ID: r.GetId()})
	}
	labels, err := s.svc.ResolveLabels(ctx, refs)
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.ResolveLabelsResponse{Labels: labels}, nil
}
