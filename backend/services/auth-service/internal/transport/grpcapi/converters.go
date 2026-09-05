package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func userToProto(u domain.User) *authv1.User {
	return &authv1.User{
		Id:       u.ID,
		Email:    u.Email,
		Username: u.Username,
		Status:   u.Status,
		// totp_enabled is owned by twofa-service and stays zero here; the gateway
		// overlays the real value via twofa.EnabledFor when composing the user
		// DTO. Leaving it unset is why every consumer must go through that
		// overlay — reading this field directly reports "off" for everyone.
		RoleSlugs:           u.RoleSlugs,
		RoleTitles:          u.RoleTitles,
		Permissions:         u.Permissions,
		CreatedAt:           timestamppb.New(u.CreatedAt),
		UpdatedAt:           timestamppb.New(u.UpdatedAt),
		IsOwner:             u.IsOwner,
		OnboardingToursSeen: u.OnboardingToursSeen,
		TotpRequired:        u.TOTPRequired,
	}
}

func roleToProto(r domain.Role) *authv1.Role {
	return &authv1.Role{Slug: r.Slug, Title: r.Title, IsSystem: r.IsSystem, PermissionSlugs: r.PermissionSlugs}
}

func permissionToProto(p domain.Permission) *authv1.Permission {
	return &authv1.Permission{Slug: p.Slug, Description: p.Description}
}
