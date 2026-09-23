package authhttp

import (
	"context"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// territoryLister is the one catalog read the handlers make: which territories
// a scope can open. The password reset compares the target's set to the
// caller's (see password_scope.go). *catalog.Client satisfies it.
type territoryLister interface {
	ListTerritories(ctx context.Context, scopeAdminID string, withArtifacts bool) ([]domain.Territory, error)
}

// Handlers serves the /api/auth/* surface. Login/session go to auth-service;
// 2FA management goes to twofa-service; passkey management goes to
// passkey-service (passkey login is orchestrated by auth-service).
type Handlers struct {
	client  *auth.Client
	twofa   *twofa.Client
	passkey *passkey.Client
	audit   *audit.Client
	// territories answers the reset's territory comparison; auth-service
	// cannot, since territory grants live in the catalog.
	territories territoryLister
	logger      *slog.Logger
	cookie      CookieOptions
	// csrfSecret keys the HMAC behind the anti-CSRF token. Not a stored token:
	// see csrf.go for why the scheme needs no state at all.
	csrfSecret []byte
}

// New builds the auth HTTP handlers.
func New(
	client *auth.Client,
	twofa *twofa.Client,
	passkey *passkey.Client,
	audit *audit.Client,
	territories territoryLister,
	logger *slog.Logger,
	cookie CookieOptions,
	csrfSecret []byte,
) *Handlers {
	return &Handlers{
		client: client, twofa: twofa, passkey: passkey, audit: audit,
		territories: territories, logger: logger, cookie: cookie, csrfSecret: csrfSecret,
	}
}
