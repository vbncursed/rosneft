package twofa

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

func (c *Client) Setup(ctx context.Context, token string) (secret, url string, err error) {
	resp, err := c.cc.Setup(ctx, &twofav1.SetupRequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return resp.GetSecret(), resp.GetOtpauthUrl(), nil
}

func (c *Client) Enable(ctx context.Context, token, code string) ([]string, error) {
	resp, err := c.cc.Enable(ctx, &twofav1.EnableRequest{Token: token, Code: code})
	if err != nil {
		return nil, err
	}
	return resp.GetRecoveryCodes(), nil
}

func (c *Client) Disable(ctx context.Context, token, code string) error {
	_, err := c.cc.Disable(ctx, &twofav1.DisableRequest{Token: token, Code: code})
	return err
}

func (c *Client) Regenerate(ctx context.Context, token, code string) ([]string, error) {
	resp, err := c.cc.RegenerateRecoveryCodes(ctx, &twofav1.RegenerateRequest{Token: token, Code: code})
	if err != nil {
		return nil, err
	}
	return resp.GetRecoveryCodes(), nil
}

func (c *Client) IsEnabled(ctx context.Context, userID string) (bool, error) {
	resp, err := c.cc.IsEnabled(ctx, &twofav1.IsEnabledRequest{UserId: userID})
	if err != nil {
		return false, err
	}
	return resp.GetEnabled(), nil
}

// Verify checks a TOTP/recovery code for a user (step-up factor). Wraps the
// internal Verify RPC; twofa-service rate-limits failed attempts.
func (c *Client) Verify(ctx context.Context, userID, code string) (bool, error) {
	resp, err := c.cc.Verify(ctx, &twofav1.VerifyRequest{UserId: userID, Code: code})
	if err != nil {
		return false, err
	}
	return resp.GetValid(), nil
}
