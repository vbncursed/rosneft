package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
)

// ResolveBlobAccess reports whether the caller may read the bytes behind a hash.
//
// A transport error comes back as an error, never as a plain false: the gate
// answers a refusal with 404 and a failure with 503, and folding the two would
// tell a caller their own asset had vanished every time the catalog hiccuped.
func (c *Client) ResolveBlobAccess(
	ctx context.Context, hash, scopeAdminID string,
) (bool, error) {
	resp, err := c.cc.ResolveBlobAccess(ctx, &catalogv1.ResolveBlobAccessRequest{
		Hash:         hash,
		ScopeAdminId: scopeAdminID,
	})
	if err != nil {
		return false, fmt.Errorf("catalog.ResolveBlobAccess: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetAllowed(), nil
}
