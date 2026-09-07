package twofa

import (
	"context"
	"time"

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

// Status is the caller's 2FA posture, as the account screen needs it.
type Status struct {
	Enabled           bool
	EnabledAt         time.Time // zero when unknown; the handler then omits it
	RecoveryRemaining int
	RecoveryTotal     int
}

func (c *Client) Status(ctx context.Context, token string) (Status, error) {
	resp, err := c.cc.Status(ctx, &twofav1.StatusRequest{Token: token})
	if err != nil {
		return Status{}, err
	}
	st := Status{
		Enabled:           resp.GetEnabled(),
		RecoveryRemaining: int(resp.GetRecoveryRemaining()),
		RecoveryTotal:     int(resp.GetRecoveryTotal()),
	}
	if at := resp.GetEnabledAt(); at > 0 {
		st.EnabledAt = time.Unix(at, 0).UTC()
	}
	return st, nil
}

func (c *Client) IsEnabled(ctx context.Context, userID string) (bool, error) {
	resp, err := c.cc.IsEnabled(ctx, &twofav1.IsEnabledRequest{UserId: userID})
	if err != nil {
		return false, err
	}
	return resp.GetEnabled(), nil
}

// EnabledFor is the batch form of IsEnabled — one round trip for the whole
// admin user list instead of one per row.
func (c *Client) EnabledFor(ctx context.Context, userIDs []string) ([]string, error) {
	resp, err := c.cc.EnabledFor(ctx, &twofav1.EnabledForRequest{UserIds: userIDs})
	if err != nil {
		return nil, err
	}
	return resp.GetEnabledUserIds(), nil
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
