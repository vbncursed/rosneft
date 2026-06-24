package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (c *Client) ListRoles(ctx context.Context) ([]*authv1.Role, error) {
	resp, err := c.cc.ListRoles(ctx, &authv1.ListRolesRequest{})
	if err != nil {
		return nil, err
	}
	return resp.GetRoles(), nil
}

func (c *Client) CreateRole(ctx context.Context, token, slug, title string, perms []string) (*authv1.Role, error) {
	return c.cc.CreateRole(ctx, &authv1.CreateRoleRequest{Token: token, Slug: slug, Title: title, PermissionSlugs: perms})
}

func (c *Client) UpdateRole(ctx context.Context, slug, title string) (*authv1.Role, error) {
	return c.cc.UpdateRole(ctx, &authv1.UpdateRoleRequest{Slug: slug, Title: title})
}

func (c *Client) DeleteRole(ctx context.Context, slug string) error {
	_, err := c.cc.DeleteRole(ctx, &authv1.DeleteRoleRequest{Slug: slug})
	return err
}

func (c *Client) SetRolePermissions(ctx context.Context, token, slug string, perms []string) (*authv1.Role, error) {
	return c.cc.SetRolePermissions(ctx, &authv1.SetRolePermissionsRequest{Token: token, Slug: slug, PermissionSlugs: perms})
}

func (c *Client) ListPermissions(ctx context.Context) ([]*authv1.Permission, error) {
	resp, err := c.cc.ListPermissions(ctx, &authv1.ListPermissionsRequest{})
	if err != nil {
		return nil, err
	}
	return resp.GetPermissions(), nil
}
