package authhttp

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
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
}

// New builds the auth HTTP handlers.
func New(
	client *auth.Client,
	twofa *twofa.Client,
	passkey *passkey.Client,
	audit *audit.Client,
	logger *slog.Logger,
	cookie CookieOptions,
) *Handlers {
	return &Handlers{client: client, twofa: twofa, passkey: passkey, audit: audit, logger: logger, cookie: cookie}
}

// Mount registers the auth routes on r. Only login + login/2fa are public.
// Self routes require a valid session (Authenticate). Admin routes additionally
// require a specific permission — enforced by middleware so a new admin route
// cannot be added without a gate.
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/auth", func(ar chi.Router) {
		// Public.
		ar.Post("/login", h.login)
		ar.Post("/login/2fa", h.login2FA)
		ar.Post("/passkey/login/begin", h.passkeyLoginBegin)
		ar.Post("/passkey/login/finish", h.passkeyLoginFinish)

		// Authenticated — any valid session.
		ar.Group(func(pr chi.Router) {
			pr.Use(h.Authenticate)
			// Records the security events listed in authAuditActions. Must run
			// after Authenticate so the principal is on ctx; the login routes
			// above are public and record themselves.
			pr.Use(h.AuditAuthEvents)
			pr.Post("/logout", h.logout)
			pr.Get("/me", h.me)
			pr.Post("/me/password", h.changePassword)
			pr.Post("/me/onboarding/{tour}", h.markTourSeen)
			pr.Post("/2fa/setup", h.setup2FA)
			pr.Post("/2fa/enable", h.enable2FA)
			pr.Post("/2fa/disable", h.disable2FA)
			pr.Post("/2fa/recovery/regenerate", h.regenerate2FA)
			pr.Post("/passkey/register/begin", h.passkeyRegisterBegin)
			pr.Post("/passkey/register/finish", h.passkeyRegisterFinish)
			pr.Get("/passkey/credentials", h.passkeyList)
			pr.Delete("/passkey/credentials/{id}", h.passkeyDelete)

			// Admin — authenticated + per-route permission.
			pr.With(h.Require("users:read")).Get("/users", h.listUsers)
			pr.With(h.Require("users:write")).Post("/users", h.createUser)
			pr.With(h.Require("users:read")).Get("/users/{id}", h.getUser)
			pr.With(h.Require("users:write")).Patch("/users/{id}", h.updateUser)
			pr.With(h.Require("users:freeze")).Post("/users/{id}/freeze", h.freezeUser)
			pr.With(h.Require("users:freeze")).Post("/users/{id}/unfreeze", h.unfreezeUser)
			pr.With(h.Require("users:delete")).Delete("/users/{id}", h.softDeleteUser)
			pr.With(h.Require("users:delete")).Post("/users/{id}/restore", h.restoreUser)
			// The owner flag is granted owner-to-owner; this route gate is coarse,
			// the real "actor must be an owner" check lives in the auth service.
			pr.With(h.Require("users:write")).Post("/users/{id}/owner", h.setUserOwner)
			pr.With(h.Require("roles:read")).Get("/roles", h.listRoles)
			pr.With(h.Require("roles:manage")).Post("/roles", h.createRole)
			pr.With(h.Require("roles:manage")).Patch("/roles/{slug}", h.updateRole)
			pr.With(h.Require("roles:manage")).Delete("/roles/{slug}", h.deleteRole)
			pr.With(h.Require("roles:manage")).Put("/roles/{slug}/permissions", h.setRolePermissions)
			pr.With(h.Require("permissions:read")).Get("/permissions", h.listPermissions)
		})
	})
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "bad json")
		return false
	}
	return true
}

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) {
	var req struct{ Identifier, Password string }
	if !decode(w, r, &req) {
		return
	}
	token, challenge, twoFA, err := h.client.Login(r.Context(), req.Identifier, req.Password)
	if err != nil {
		h.recordLogin(r, "auth.login", "")
		fail(w, err)
		return
	}
	// A 2FA challenge is not a completed login: the cookie is issued only once a
	// session token exists, which for the 2FA path happens in login2FA.
	if token != "" {
		h.recordLogin(r, "auth.login", token)
		h.setSession(w, token)
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "twoFactorRequired": twoFA, "challengeToken": challenge})
}

func (h *Handlers) login2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ ChallengeToken, Code string }
	if !decode(w, r, &req) {
		return
	}
	token, err := h.client.LoginVerify2FA(r.Context(), req.ChallengeToken, req.Code)
	if err != nil {
		h.recordLogin(r, "auth.login_2fa", "")
		fail(w, err)
		return
	}
	h.recordLogin(r, "auth.login_2fa", token)
	h.setSession(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"token": token})
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) {
	// Cleared BEFORE the revocation call, and unconditionally.
	//
	// On success the server-side session is already gone and a stale cookie
	// would send one doomed request per page load until it expired. On failure
	// the session may still be live — and the browser holds the only copy of it
	// that matters, since JavaScript cannot delete an httpOnly cookie and the
	// SPA's logout() swallows the error and redirects to /login regardless.
	// Returning early would leave a user who believes they are signed out still
	// carrying a working session for the cookie's full Max-Age.
	//
	// That failure window is narrow, and worth stating precisely so nobody
	// widens the claim: this handler sits behind Authenticate, so a
	// wholly-unavailable auth-service or Redis is rejected upstream and never
	// arrives here. What reaches this line is the case where ValidateToken
	// succeeded and the delete then did not — a transient error or deadline
	// landing between the two calls. Rare, but the guard is one line and the
	// alternative failure is silent and lasts a month.
	//
	// Set-Cookie survives the error response: fail() writes a status and body,
	// not a fresh header map. handlers_test.go pins both halves.
	h.clearSession(w)
	if err := h.client.Logout(r.Context(), sessionToken(r)); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetMe(r.Context(), sessionToken(r))
	if err != nil {
		fail(w, err)
		return
	}
	// auth no longer owns 2FA state; overlay the real flag from twofa-service.
	out := userToJSON(u)
	if on, err := h.twofa.IsEnabled(r.Context(), u.GetId()); err == nil {
		out.TOTPEnabled = on
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handlers) changePassword(w http.ResponseWriter, r *http.Request) {
	var req struct{ OldPassword, NewPassword string }
	if !decode(w, r, &req) {
		return
	}
	if err := h.client.ChangePassword(r.Context(), sessionToken(r), req.OldPassword, req.NewPassword); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// markTourSeen takes no body: the caller is the subject, the tour is in the
// path, and the service is idempotent.
func (h *Handlers) markTourSeen(w http.ResponseWriter, r *http.Request) {
	if err := h.client.MarkTourSeen(r.Context(), sessionToken(r), chi.URLParam(r, "tour")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) setup2FA(w http.ResponseWriter, r *http.Request) {
	secret, url, err := h.twofa.Setup(r.Context(), sessionToken(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"secret": secret, "otpauthUrl": url})
}

func (h *Handlers) enable2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) {
		return
	}
	codes, err := h.twofa.Enable(r.Context(), sessionToken(r), req.Code)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (h *Handlers) disable2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) {
		return
	}
	if err := h.twofa.Disable(r.Context(), sessionToken(r), req.Code); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) regenerate2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) {
		return
	}
	codes, err := h.twofa.Regenerate(r.Context(), sessionToken(r), req.Code)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}
