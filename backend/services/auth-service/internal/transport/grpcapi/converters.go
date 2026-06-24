package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func userToProto(u domain.User) *authv1.User {
	return &authv1.User{
		Id:          u.ID,
		Email:       u.Email,
		Username:    u.Username,
		Status:      u.Status,
		TotpEnabled: u.TOTPEnabled,
		RoleSlugs:   u.RoleSlugs,
		Permissions: u.Permissions,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		UpdatedAt:   timestamppb.New(u.UpdatedAt),
		IsOwner:     u.IsOwner,
	}
}

func roleToProto(r domain.Role) *authv1.Role {
	return &authv1.Role{Slug: r.Slug, Title: r.Title, IsSystem: r.IsSystem, PermissionSlugs: r.PermissionSlugs}
}

func permissionToProto(p domain.Permission) *authv1.Permission {
	return &authv1.Permission{Slug: p.Slug, Description: p.Description}
}
