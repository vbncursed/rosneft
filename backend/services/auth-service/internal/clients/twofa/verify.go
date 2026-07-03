package twofa

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

// IsEnabled reports whether a user has 2FA turned on.
func (c *Client) IsEnabled(ctx context.Context, userID string) (bool, error) {
	resp, err := c.cc.IsEnabled(ctx, &twofav1.IsEnabledRequest{UserId: userID})
	if err != nil {
		return false, err
	}
	return resp.GetEnabled(), nil
}

// Verify checks a TOTP or recovery code for the user.
func (c *Client) Verify(ctx context.Context, userID, code string) (bool, error) {
	resp, err := c.cc.Verify(ctx, &twofav1.VerifyRequest{UserId: userID, Code: code})
	if err != nil {
		return false, err
	}
	return resp.GetValid(), nil
}
