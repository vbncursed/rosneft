package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (c *Client) Login(ctx context.Context, identifier, password string) (token, challenge string, twoFA bool, err error) {
	resp, err := c.cc.Login(ctx, &authv1.LoginRequest{Identifier: identifier, Password: password})
	if err != nil {
		return "", "", false, err
	}
	return resp.GetToken(), resp.GetChallengeToken(), resp.GetTwoFactorRequired(), nil
}

func (c *Client) LoginVerify2FA(ctx context.Context, challenge, code string) (string, error) {
	resp, err := c.cc.LoginVerify2FA(ctx, &authv1.LoginVerify2FARequest{ChallengeToken: challenge, Code: code})
	if err != nil {
		return "", err
	}
	return resp.GetToken(), nil
}

func (c *Client) Logout(ctx context.Context, token string) error {
	_, err := c.cc.Logout(ctx, &authv1.LogoutRequest{Token: token})
	return err
}

// ValidateToken returns the caller's user id, permissions, owner flag,
// territory scope, audit company, and whether the session must enroll a
// second factor before doing anything else. The middle two differ for a
// guest: the territory scope is keyed to self, the audit company to the real
// tenant.
func (c *Client) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, string, bool, error) {
	resp, err := c.cc.ValidateToken(ctx, &authv1.ValidateTokenRequest{Token: token})
	if err != nil {
		return "", nil, false, "", "", false, err
	}
	return resp.GetUserId(), resp.GetPermissions(), resp.GetIsOwner(),
		resp.GetOwningAdminId(), resp.GetAuditCompanyId(), resp.GetMustEnrollTwoFactor(), nil
}

func (c *Client) GetMe(ctx context.Context, token string) (*authv1.User, error) {
	return c.cc.GetMe(ctx, &authv1.GetMeRequest{Token: token})
}

func (c *Client) ChangePassword(ctx context.Context, token, oldPw, newPw string) error {
	_, err := c.cc.ChangePassword(ctx, &authv1.ChangePasswordRequest{Token: token, OldPassword: oldPw, NewPassword: newPw})
	return err
}

func (c *Client) MarkTourSeen(ctx context.Context, token, tour string) error {
	_, err := c.cc.MarkTourSeen(ctx, &authv1.MarkTourSeenRequest{Token: token, Tour: tour})
	return err
}
