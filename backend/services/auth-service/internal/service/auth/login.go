package auth

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Login authenticates by email-or-username + password. Returns a session token
// directly when 2FA is off, or a challenge token (token empty) when on.
func (s *Service) Login(ctx context.Context, identifier, plain string) (string, string, error) {
	// Fold once, and before the empty check rather than after it. The session
	// store keys throttling on this string, and an unfolded key gives every case
	// variant its own attempt counter against the same account. GetByIdentifier
	// compares through citext and would match either way — folding it too keeps
	// one variable rather than two, and makes a whitespace-padded paste resolve.
	//
	// Folding after the guard let a whitespace-only identifier past it and then
	// keyed the throttle on "", so every such submission shared one bucket. The
	// password is deliberately not folded: trimming a password changes it.
	identifier = domain.Fold(identifier)
	if identifier == "" || plain == "" {
		return "", "", fmt.Errorf("auth.Login: %w: identifier and password required", domain.ErrInvalidInput)
	}

	// The attempt is counted before the password is checked, so concurrent
	// guesses cannot all pass a check made before any of them was counted.
	allowed, err := s.sessions.TakeAttempt(ctx, identifier)
	if err != nil {
		return "", "", err
	}
	if !allowed {
		return "", "", domain.ErrLoginThrottled
	}

	u, err := s.authenticate(ctx, identifier, plain)
	if err != nil {
		return "", "", err
	}
	// A right password gives the attempt back, even for an account that is
	// frozen: the attempt was not a guess.
	_ = s.sessions.ClearFails(ctx, identifier)
	if err := checkActive(u); err != nil {
		return "", "", err
	}
	metricLogins.WithLabelValues("succeeded").Inc()

	return s.startSession(ctx, u)
}

// authenticate resolves the user and checks the password. Every credential
// failure registers against the throttle and answers ErrInvalidCredential.
func (s *Service) authenticate(ctx context.Context, identifier, plain string) (domain.User, error) {
	u, err := s.users.GetByIdentifier(ctx, identifier)
	if err != nil {
		// Unknown user is an auth failure, not a 404 — don't leak existence.
		// The verify below is for time alone: without it this path returns in
		// microseconds and a known user's takes tens of ms, which gives the
		// existence away.
		_, _ = s.verify(plain, s.dummyHash())
		return domain.User{}, s.failCredential()
	}
	ok, err := s.verify(plain, u.PasswordHash)
	if err != nil {
		return domain.User{}, fmt.Errorf("auth.Login: verify: %w", err)
	}
	if !ok {
		return domain.User{}, s.failCredential()
	}
	return u, nil
}

// failCredential answers a failed attempt, which TakeAttempt already counted.
func (s *Service) failCredential() error {
	metricLogins.WithLabelValues("failed").Inc()
	return domain.ErrInvalidCredential
}

// startSession hands out the session token, or the 2FA challenge (token empty)
// when the account has a second factor.
func (s *Service) startSession(ctx context.Context, u domain.User) (string, string, error) {
	enabled, err := s.twofa.IsEnabled(ctx, u.ID)
	if err != nil {
		return "", "", err
	}
	if enabled {
		challenge, err := s.sessions.PutPending(ctx, u.ID)
		if err != nil {
			return "", "", err
		}
		return "", challenge, nil
	}
	token, err := s.issue(ctx, u)
	return token, "", err
}

// issue creates a session proving the login is live. Authorization is re-read
// from the database on each ValidateToken, so nothing role-derived is stored.
func (s *Service) issue(ctx context.Context, u domain.User) (string, error) {
	return s.sessions.Create(ctx, domain.Session{
		UserID:         u.ID,
		Status:         u.Status,
		AbsoluteExpiry: time.Now().Add(s.absoluteTTL),
	})
}

// scopeOwningAdmin picks a user's territory-visibility key. Guests see only
// territories assigned directly to them, so their key is their own id; everyone
// else inherits their tenant admin resolved from the created_by chain.
func scopeOwningAdmin(roleSlugs []string, resolvedAdmin, selfID string) string {
	if slices.Contains(roleSlugs, "guest") {
		return selfID
	}
	return resolvedAdmin
}

// checkActive is the one rule for who may be given a session: every login
// path (password, 2FA step, passkey) asks it.
func checkActive(u domain.User) error {
	switch u.Status {
	case domain.StatusFrozen:
		return domain.ErrAccountFrozen
	case domain.StatusDeleted:
		return domain.ErrAccountDeleted
	}
	return nil
}
