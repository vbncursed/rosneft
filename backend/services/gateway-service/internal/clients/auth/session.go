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

func (c *Client) ValidateToken(ctx context.Context, token string) (string, []string, error) {
	resp, err := c.cc.ValidateToken(ctx, &authv1.ValidateTokenRequest{Token: token})
	if err != nil {
		return "", nil, err
	}
	return resp.GetUserId(), resp.GetPermissions(), nil
}

func (c *Client) GetMe(ctx context.Context, token string) (*authv1.User, error) {
	return c.cc.GetMe(ctx, &authv1.GetMeRequest{Token: token})
}

func (c *Client) ChangePassword(ctx context.Context, token, oldPw, newPw string) error {
	_, err := c.cc.ChangePassword(ctx, &authv1.ChangePasswordRequest{Token: token, OldPassword: oldPw, NewPassword: newPw})
	return err
}

func (c *Client) Setup2FA(ctx context.Context, token string) (secret, url string, err error) {
	resp, err := c.cc.Setup2FA(ctx, &authv1.Setup2FARequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return resp.GetSecret(), resp.GetOtpauthUrl(), nil
}

func (c *Client) Enable2FA(ctx context.Context, token, code string) ([]string, error) {
	resp, err := c.cc.Enable2FA(ctx, &authv1.Enable2FARequest{Token: token, Code: code})
	if err != nil {
		return nil, err
	}
	return resp.GetRecoveryCodes(), nil
}

func (c *Client) Disable2FA(ctx context.Context, token, code string) error {
	_, err := c.cc.Disable2FA(ctx, &authv1.Disable2FARequest{Token: token, Code: code})
	return err
}
