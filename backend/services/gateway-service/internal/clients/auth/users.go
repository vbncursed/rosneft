package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (c *Client) CreateUser(ctx context.Context, token, email, username, password string, roles []string) (*authv1.User, error) {
	return c.cc.CreateUser(ctx, &authv1.CreateUserRequest{
		Token: token, Email: email, Username: username, Password: password, RoleSlugs: roles,
	})
}

func (c *Client) ListUsers(ctx context.Context, token, status string, includeDeleted bool) ([]*authv1.User, error) {
	resp, err := c.cc.ListUsers(ctx, &authv1.ListUsersRequest{Token: token, Status: status, IncludeDeleted: includeDeleted})
	if err != nil {
		return nil, err
	}
	return resp.GetUsers(), nil
}

func (c *Client) GetUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.GetUser(ctx, &authv1.GetUserRequest{Token: token, Id: id})
}

func (c *Client) UpdateUser(ctx context.Context, token, id string, roles []string, email, username string) (*authv1.User, error) {
	return c.cc.UpdateUser(ctx, &authv1.UpdateUserRequest{Token: token, Id: id, RoleSlugs: roles, Email: email, Username: username})
}

// FreezeUser passes the actor's session token; the auth-service resolves the
// acting user from it (actor is never trusted from the client).
func (c *Client) FreezeUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.FreezeUser(ctx, &authv1.FreezeUserRequest{Token: token, Id: id})
}

func (c *Client) UnfreezeUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.UnfreezeUser(ctx, &authv1.UnfreezeUserRequest{Token: token, Id: id})
}

func (c *Client) SoftDeleteUser(ctx context.Context, token, id string) error {
	_, err := c.cc.SoftDeleteUser(ctx, &authv1.SoftDeleteUserRequest{Token: token, Id: id})
	return err
}

func (c *Client) RestoreUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.RestoreUser(ctx, &authv1.RestoreUserRequest{Token: token, Id: id})
}

func (c *Client) SetUserOwner(ctx context.Context, token, id string, isOwner bool) (*authv1.User, error) {
	return c.cc.SetUserOwner(ctx, &authv1.SetUserOwnerRequest{Token: token, Id: id, IsOwner: isOwner})
}
