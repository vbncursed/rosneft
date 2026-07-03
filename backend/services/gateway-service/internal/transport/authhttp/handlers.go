package authhttp

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

// Handlers serves the /api/auth/* surface. Login/session go to auth-service;
// 2FA management goes to twofa-service.
type Handlers struct {
	client *auth.Client
	twofa  *twofa.Client
	logger *slog.Logger
}

// New builds the auth HTTP handlers.
func New(client *auth.Client, twofa *twofa.Client, logger *slog.Logger) *Handlers {
	return &Handlers{client: client, twofa: twofa, logger: logger}
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

		// Authenticated — any valid session.
		ar.Group(func(pr chi.Router) {
			pr.Use(h.Authenticate)
			pr.Post("/logout", h.logout)
			pr.Get("/me", h.me)
			pr.Post("/me/password", h.changePassword)
			pr.Post("/2fa/setup", h.setup2FA)
			pr.Post("/2fa/enable", h.enable2FA)
			pr.Post("/2fa/disable", h.disable2FA)
			pr.Post("/2fa/recovery/regenerate", h.regenerate2FA)

			// Admin — authenticated + per-route permission.
			pr.With(h.require("users:read")).Get("/users", h.listUsers)
			pr.With(h.require("users:write")).Post("/users", h.createUser)
			pr.With(h.require("users:read")).Get("/users/{id}", h.getUser)
			pr.With(h.require("users:write")).Patch("/users/{id}", h.updateUser)
			pr.With(h.require("users:freeze")).Post("/users/{id}/freeze", h.freezeUser)
			pr.With(h.require("users:freeze")).Post("/users/{id}/unfreeze", h.unfreezeUser)
			pr.With(h.require("users:delete")).Delete("/users/{id}", h.softDeleteUser)
			pr.With(h.require("users:delete")).Post("/users/{id}/restore", h.restoreUser)
			// The owner flag is granted owner-to-owner; this route gate is coarse,
			// the real "actor must be an owner" check lives in the auth service.
			pr.With(h.require("users:write")).Post("/users/{id}/owner", h.setUserOwner)
			pr.With(h.require("roles:read")).Get("/roles", h.listRoles)
			pr.With(h.require("roles:manage")).Post("/roles", h.createRole)
			pr.With(h.require("roles:manage")).Patch("/roles/{slug}", h.updateRole)
			pr.With(h.require("roles:manage")).Delete("/roles/{slug}", h.deleteRole)
			pr.With(h.require("roles:manage")).Put("/roles/{slug}/permissions", h.setRolePermissions)
			pr.With(h.require("permissions:read")).Get("/permissions", h.listPermissions)
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
		fail(w, err)
		return
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
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token})
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) {
	if err := h.client.Logout(r.Context(), bearer(r)); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetMe(r.Context(), bearer(r))
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
	if err := h.client.ChangePassword(r.Context(), bearer(r), req.OldPassword, req.NewPassword); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) setup2FA(w http.ResponseWriter, r *http.Request) {
	secret, url, err := h.twofa.Setup(r.Context(), bearer(r))
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
	codes, err := h.twofa.Enable(r.Context(), bearer(r), req.Code)
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
	if err := h.twofa.Disable(r.Context(), bearer(r), req.Code); err != nil {
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
	codes, err := h.twofa.Regenerate(r.Context(), bearer(r), req.Code)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}
