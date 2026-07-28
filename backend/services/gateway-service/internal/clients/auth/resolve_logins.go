package auth

import (
	"context"
	"fmt"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
)

// ResolveUserLogins maps user ids to logins for labelling the audit journal.
//
// MapStatus is not decoration: without it the bare gRPC status arrives at the
// HTTP layer, isInvalid() compares it against the gateway's own sentinel, misses,
// and a rejected request answers 500. The audit client shipped without this call
// and did exactly that. NotFound has no meaning here — an unresolved id is simply
// absent from the map — so the sentinel is nil and only InvalidArgument matters.
func (c *Client) ResolveUserLogins(
	ctx context.Context, token string, ids []string,
) (map[string]string, error) {
	resp, err := c.cc.ResolveUserLogins(ctx, &authv1.ResolveUserLoginsRequest{
		Token: token, Ids: ids,
	})
	if err != nil {
		return nil, fmt.Errorf("auth.ResolveUserLogins: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetLogins(), nil
}
