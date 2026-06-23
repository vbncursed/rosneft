package authhttp

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// Handlers serves the /api/auth/* surface over the auth gRPC client.
type Handlers struct {
	client *auth.Client
	logger *slog.Logger
}

// New builds the auth HTTP handlers.
func New(client *auth.Client, logger *slog.Logger) *Handlers {
	return &Handlers{client: client, logger: logger}
}

// Mount registers the auth routes on r. login + login/2fa are public; every
// other handler reads and validates the Bearer token via the client.
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/auth", func(ar chi.Router) {
		ar.Post("/login", h.login)
		ar.Post("/login/2fa", h.login2FA)
		ar.Post("/logout", h.logout)
		ar.Get("/me", h.me)
		ar.Post("/me/password", h.changePassword)
		ar.Post("/2fa/setup", h.setup2FA)
		ar.Post("/2fa/enable", h.enable2FA)
		ar.Post("/2fa/disable", h.disable2FA)
		// admin
		ar.Get("/users", h.listUsers)
		ar.Post("/users", h.createUser)
		ar.Get("/users/{id}", h.getUser)
		ar.Patch("/users/{id}", h.updateUser)
		ar.Post("/users/{id}/freeze", h.freezeUser)
		ar.Post("/users/{id}/unfreeze", h.unfreezeUser)
		ar.Delete("/users/{id}", h.softDeleteUser)
		ar.Post("/users/{id}/restore", h.restoreUser)
		ar.Get("/roles", h.listRoles)
		ar.Post("/roles", h.createRole)
		ar.Patch("/roles/{slug}", h.updateRole)
		ar.Delete("/roles/{slug}", h.deleteRole)
		ar.Put("/roles/{slug}/permissions", h.setRolePermissions)
		ar.Get("/permissions", h.listPermissions)
	})
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad json"})
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
	writeJSON(w, http.StatusOK, userToJSON(u))
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
	secret, url, err := h.client.Setup2FA(r.Context(), bearer(r))
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
	codes, err := h.client.Enable2FA(r.Context(), bearer(r), req.Code)
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
	if err := h.client.Disable2FA(r.Context(), bearer(r), req.Code); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
