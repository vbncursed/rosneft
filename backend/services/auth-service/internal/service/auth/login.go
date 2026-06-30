package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// Login authenticates by email-or-username + password. Returns a session token
// directly when 2FA is off, or a challenge token (token empty) when on.
func (s *Service) Login(ctx context.Context, identifier, plain string) (string, string, error) {
	if identifier == "" || plain == "" {
		return "", "", fmt.Errorf("auth.Login: %w: identifier and password required", domain.ErrInvalidInput)
	}
	locked, err := s.sessions.IsLocked(ctx, identifier)
	if err != nil {
		return "", "", err
	}
	if locked {
		return "", "", domain.ErrLoginThrottled
	}

	u, err := s.users.GetByIdentifier(ctx, identifier)
	if err != nil {
		// Unknown user is an auth failure, not a 404 — don't leak existence.
		_ = s.sessions.RegisterFail(ctx, identifier)
		return "", "", domain.ErrInvalidCredential
	}
	ok, err := password.Verify(plain, u.PasswordHash)
	if err != nil {
		return "", "", fmt.Errorf("auth.Login: verify: %w", err)
	}
	if !ok {
		_ = s.sessions.RegisterFail(ctx, identifier)
		return "", "", domain.ErrInvalidCredential
	}
	switch u.Status {
	case domain.StatusFrozen:
		return "", "", domain.ErrAccountFrozen
	case domain.StatusDeleted:
		return "", "", domain.ErrAccountDeleted
	}
	_ = s.sessions.ClearFails(ctx, identifier)

	if u.TOTPEnabled {
		challenge, err := s.sessions.PutPending(ctx, u.ID)
		if err != nil {
			return "", "", err
		}
		return "", challenge, nil
	}
	token, err := s.issue(ctx, u)
	return token, "", err
}

// issue creates a session carrying a permission snapshot and the caller's
// owning admin (resolved from the created_by chain) for territory scoping.
func (s *Service) issue(ctx context.Context, u domain.User) (string, error) {
	owningAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
	if err != nil {
		return "", fmt.Errorf("auth.issue: owning admin: %w", err)
	}
	return s.sessions.Create(ctx, domain.Session{
		UserID:         u.ID,
		Permissions:    u.Permissions,
		IsOwner:        u.IsOwner,
		OwningAdminID:  owningAdmin,
		Status:         u.Status,
		AbsoluteExpiry: time.Now().Add(s.absoluteTTL),
	})
}
