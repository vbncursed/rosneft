package passkey

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// BeginLogin proxies the discoverable-login begin.
func (c *Client) BeginLogin(ctx context.Context) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.BeginLogin(ctx, &passkeyv1.BeginLoginRequest{})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

// FinishLogin verifies the assertion and returns the verified user id.
func (c *Client) FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error) {
	resp, err := c.cc.FinishLogin(ctx, &passkeyv1.FinishLoginRequest{FlowId: flowID, AssertionJson: assertionJSON})
	if err != nil {
		return "", err
	}
	return resp.GetUserId(), nil
}
