package authhttp

import (
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

// Handlers serves the /api/auth/* surface. Login/session go to auth-service;
// 2FA management goes to twofa-service; passkey management goes to
// passkey-service (passkey login is orchestrated by auth-service).
type Handlers struct {
	client  *auth.Client
	twofa   *twofa.Client
	passkey *passkey.Client
	audit   *audit.Client
	logger  *slog.Logger
	cookie  CookieOptions
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
	logger *slog.Logger,
	cookie CookieOptions,
	csrfSecret []byte,
) *Handlers {
	return &Handlers{
		client: client, twofa: twofa, passkey: passkey, audit: audit,
		logger: logger, cookie: cookie, csrfSecret: csrfSecret,
	}
}
