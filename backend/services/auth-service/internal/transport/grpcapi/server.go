// Package grpcapi exposes the auth service over gRPC. One method per file;
// this file holds the dependency interfaces, the Server, registration, and the
// central error mapper.
package grpcapi

import (
	"context"
	"slices"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// AuthFlow is the login/session surface.
type AuthFlow interface {
	Login(ctx context.Context, identifier, password string) (string, string, error)
	LoginVerify2FA(ctx context.Context, challenge, code string) (string, error)
	Logout(ctx context.Context, token string) error
	ValidateToken(ctx context.Context, token string) (string, []string, error)
}

// UsersSvc is the user surface (self + admin). The admin methods take the
// acting user id and whether it may see/manage every user (scopeAll).
type UsersSvc interface {
	Create(ctx context.Context, actorID, email, username, password string, roleSlugs []string) (domain.User, error)
	List(ctx context.Context, actorID string, scopeAll bool, status string, includeDeleted bool) ([]domain.User, error)
	Get(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	Update(ctx context.Context, actorID string, scopeAll bool, id string, roleSlugs []string, email, username string) (domain.User, error)
	Freeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	Unfreeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	SoftDelete(ctx context.Context, actorID string, scopeAll bool, id string) error
	Restore(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	SetOwner(ctx context.Context, actorID, id string, isOwner bool) (domain.User, error)
	ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error
}

// TwoFASvc is the 2FA surface.
type TwoFASvc interface {
	Setup(ctx context.Context, userID string) (string, string, error)
	Enable(ctx context.Context, userID, code string) ([]string, error)
	Disable(ctx context.Context, userID, code string) error
}

// RolesSvc is the roles/permissions surface.
type RolesSvc interface {
	List(ctx context.Context) ([]domain.Role, error)
	Create(ctx context.Context, actorID, slug, title string, permSlugs []string) (domain.Role, error)
	UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error)
	Delete(ctx context.Context, slug string) error
	SetPermissions(ctx context.Context, actorID, slug string, permSlugs []string) (domain.Role, error)
	ListPermissions(ctx context.Context) ([]domain.Permission, error)
}

// Server implements authv1.AuthServiceServer.
type Server struct {
	authv1.UnimplementedAuthServiceServer
	auth  AuthFlow
	users UsersSvc
	twofa TwoFASvc
	roles RolesSvc
}

// New builds the gRPC handler.
func New(auth AuthFlow, users UsersSvc, twofa TwoFASvc, roles RolesSvc) *Server {
	return &Server{auth: auth, users: users, twofa: twofa, roles: roles}
}

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { authv1.RegisterAuthServiceServer(srv, s) }

// userIDFromToken resolves a session token to a user id (self endpoints).
func (s *Server) userIDFromToken(ctx context.Context, token string) (string, error) {
	uid, _, err := s.auth.ValidateToken(ctx, token)
	return uid, err
}

// actor resolves a session token to (userID, scopeAll). scopeAll is true when
// the caller holds users:read_all (admin) — i.e. may see/manage every user.
func (s *Server) actor(ctx context.Context, token string) (string, bool, error) {
	uid, perms, err := s.auth.ValidateToken(ctx, token)
	if err != nil {
		return "", false, err
	}
	return uid, slices.Contains(perms, "users:read_all"), nil
}

// statusByCode lists, per gRPC code, the domain sentinels that surface as it.
var statusByCode = map[codes.Code][]error{
	codes.InvalidArgument: {domain.ErrInvalidInput, domain.ErrPermissionUnknown},
	codes.NotFound:        {domain.ErrUserNotFound, domain.ErrRoleNotFound},
	codes.Unauthenticated: {domain.ErrInvalidCredential, domain.ErrSessionInvalid, domain.Err2FAInvalidCode},
	codes.PermissionDenied: {
		domain.ErrAccountFrozen,
		domain.ErrAccountDeleted,
		domain.ErrLoginThrottled,
		domain.ErrAdminOwnerOnly,
		domain.ErrPrivilegeEscalation,
		domain.ErrOwnerOnly,
		domain.Err2FARequired,
	},
	codes.AlreadyExists: {
		domain.ErrEmailTaken,
		domain.ErrUsernameTaken,
		domain.ErrRoleSlugTaken,
		domain.Err2FAAlreadyEnabled,
	},
	codes.FailedPrecondition: {
		domain.ErrLastAdmin,
		domain.ErrSelfTarget,
		domain.ErrSystemRole,
		domain.Err2FANotEnabled,
	},
}

// mapError translates domain sentinels to gRPC status codes.
func mapError(err error) error { return apperr.ToStatus(err, statusByCode) }
