package catalog

import (
	"context"
	"fmt"
	"strconv"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ResolveLabels names territory, model and panorama ids for the audit journal.
//
// A ref whose id is not a number is dropped here rather than sent: catalog ids
// are BIGSERIAL, so a non-numeric value means the snapshot held something other
// than an id, and the far side would only drop it after a round trip.
func (c *Client) ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error) {
	out := make([]*catalogv1.LabelRef, 0, len(refs))
	for _, r := range refs {
		id, err := strconv.ParseInt(r.ID, 10, 64)
		if err != nil {
			continue
		}
		out = append(out, &catalogv1.LabelRef{Kind: r.Kind, Id: id})
	}
	if len(out) == 0 {
		return map[string]string{}, nil
	}
	resp, err := c.cc.ResolveLabels(ctx, &catalogv1.ResolveLabelsRequest{Refs: out})
	if err != nil {
		return nil, fmt.Errorf("catalog.ResolveLabels: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetLabels(), nil
}
