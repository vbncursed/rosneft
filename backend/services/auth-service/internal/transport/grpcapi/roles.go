package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) ListRoles(ctx context.Context, _ *authv1.ListRolesRequest) (*authv1.ListRolesResponse, error) {
	list, err := s.roles.List(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*authv1.Role, 0, len(list))
	for _, r := range list {
		out = append(out, roleToProto(r))
	}
	return &authv1.ListRolesResponse{Roles: out}, nil
}

func (s *Server) CreateRole(ctx context.Context, req *authv1.CreateRoleRequest) (*authv1.Role, error) {
	actorID, _, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	r, err := s.roles.Create(ctx, actorID, req.GetSlug(), req.GetTitle(), req.GetPermissionSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}

func (s *Server) UpdateRole(ctx context.Context, req *authv1.UpdateRoleRequest) (*authv1.Role, error) {
	r, err := s.roles.UpdateTitle(ctx, req.GetSlug(), req.GetTitle())
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}

func (s *Server) DeleteRole(ctx context.Context, req *authv1.DeleteRoleRequest) (*authv1.DeleteRoleResponse, error) {
	if err := s.roles.Delete(ctx, req.GetSlug()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.DeleteRoleResponse{}, nil
}

func (s *Server) SetRolePermissions(ctx context.Context, req *authv1.SetRolePermissionsRequest) (*authv1.Role, error) {
	actorID, _, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	r, err := s.roles.SetPermissions(ctx, actorID, req.GetSlug(), req.GetPermissionSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}

func (s *Server) ListPermissions(ctx context.Context, _ *authv1.ListPermissionsRequest) (*authv1.ListPermissionsResponse, error) {
	list, err := s.roles.ListPermissions(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*authv1.Permission, 0, len(list))
	for _, p := range list {
		out = append(out, permissionToProto(p))
	}
	return &authv1.ListPermissionsResponse{Permissions: out}, nil
}
