package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// VerifyPassword checks the caller's password without changing it (step-up).
func (c *Client) VerifyPassword(ctx context.Context, token, password string) (bool, error) {
	resp, err := c.cc.VerifyPassword(ctx, &authv1.VerifyPasswordRequest{Token: token, Password: password})
	if err != nil {
		return false, err
	}
	return resp.GetValid(), nil
}
