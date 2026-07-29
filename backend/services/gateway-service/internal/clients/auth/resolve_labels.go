package auth

import (
	"context"
	"fmt"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ResolveLabels names role and permission ids for the audit journal.
func (c *Client) ResolveLabels(
	ctx context.Context, token string, refs []domain.LabelRef,
) (map[string]string, error) {
	if len(refs) == 0 {
		return map[string]string{}, nil
	}
	out := make([]*authv1.LabelRef, 0, len(refs))
	for _, r := range refs {
		out = append(out, &authv1.LabelRef{Kind: r.Kind, Id: r.ID})
	}
	resp, err := c.cc.ResolveLabels(ctx, &authv1.ResolveLabelsRequest{Token: token, Refs: out})
	if err != nil {
		return nil, fmt.Errorf("auth.ResolveLabels: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetLabels(), nil
}
