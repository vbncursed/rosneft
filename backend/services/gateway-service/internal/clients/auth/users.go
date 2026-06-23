package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (c *Client) CreateUser(ctx context.Context, email, username, password string, roles []string) (*authv1.User, error) {
	return c.cc.CreateUser(ctx, &authv1.CreateUserRequest{
		Email: email, Username: username, Password: password, RoleSlugs: roles,
	})
}

func (c *Client) ListUsers(ctx context.Context, status string, includeDeleted bool) ([]*authv1.User, error) {
	resp, err := c.cc.ListUsers(ctx, &authv1.ListUsersRequest{Status: status, IncludeDeleted: includeDeleted})
	if err != nil {
		return nil, err
	}
	return resp.GetUsers(), nil
}

func (c *Client) GetUser(ctx context.Context, id string) (*authv1.User, error) {
	return c.cc.GetUser(ctx, &authv1.GetUserRequest{Id: id})
}

func (c *Client) UpdateUser(ctx context.Context, id string, roles []string, email, username string) (*authv1.User, error) {
	return c.cc.UpdateUser(ctx, &authv1.UpdateUserRequest{Id: id, RoleSlugs: roles, Email: email, Username: username})
}

// FreezeUser passes the actor's session token; the auth-service resolves the
// acting user from it (actor is never trusted from the client).
func (c *Client) FreezeUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.FreezeUser(ctx, &authv1.FreezeUserRequest{Token: token, Id: id})
}

func (c *Client) UnfreezeUser(ctx context.Context, id string) (*authv1.User, error) {
	return c.cc.UnfreezeUser(ctx, &authv1.UnfreezeUserRequest{Id: id})
}

func (c *Client) SoftDeleteUser(ctx context.Context, token, id string) error {
	_, err := c.cc.SoftDeleteUser(ctx, &authv1.SoftDeleteUserRequest{Token: token, Id: id})
	return err
}

func (c *Client) RestoreUser(ctx context.Context, id string) (*authv1.User, error) {
	return c.cc.RestoreUser(ctx, &authv1.RestoreUserRequest{Id: id})
}
