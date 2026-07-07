package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// PasskeyLoginBegin returns discoverable-login options + a flow id.
func (c *Client) PasskeyLoginBegin(ctx context.Context) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.PasskeyLoginBegin(ctx, &authv1.PasskeyLoginBeginRequest{})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

// PasskeyLoginFinish exchanges a signed assertion for a session token.
func (c *Client) PasskeyLoginFinish(ctx context.Context, flowID, assertionJSON string) (string, error) {
	resp, err := c.cc.PasskeyLoginFinish(ctx, &authv1.PasskeyLoginFinishRequest{FlowId: flowID, AssertionJson: assertionJSON})
	if err != nil {
		return "", err
	}
	return resp.GetToken(), nil
}
