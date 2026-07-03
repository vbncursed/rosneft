package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// Resolve validates a session token and returns the caller's id + username
// (the username is the otpauth account label used at Setup).
func (c *Client) Resolve(ctx context.Context, token string) (userID, username string, err error) {
	u, err := c.cc.GetMe(ctx, &authv1.GetMeRequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return u.GetId(), u.GetUsername(), nil
}
