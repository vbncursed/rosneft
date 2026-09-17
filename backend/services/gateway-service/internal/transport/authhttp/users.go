package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *Handlers) listUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	list, err := h.client.ListUsers(r.Context(), sessionToken(r), q.Get("status"), q.Get("includeDeleted") == "true")
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.usersJSON(r.Context(), list))
}

func (h *Handlers) createUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email, Username, Password string
		RoleSlugs                 []string
	}
	if !decode(w, r, &req) {
		return
	}
	u, err := h.client.CreateUser(r.Context(), sessionToken(r), req.Email, req.Username, req.Password, req.RoleSlugs)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, h.userJSON(r.Context(), u))
}

func (h *Handlers) getUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetUser(r.Context(), sessionToken(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}

func (h *Handlers) updateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RoleSlugs       []string
		Email, Username string
	}
	if !decode(w, r, &req) {
		return
	}
	u, err := h.client.UpdateUser(r.Context(), sessionToken(r), chi.URLParam(r, "id"), req.RoleSlugs, req.Email, req.Username)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}

func (h *Handlers) freezeUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.FreezeUser(r.Context(), sessionToken(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}

func (h *Handlers) unfreezeUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.UnfreezeUser(r.Context(), sessionToken(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}

func (h *Handlers) requireUser2FA(w http.ResponseWriter, r *http.Request) {
	h.setUser2FARequired(w, r, true)
}

func (h *Handlers) unrequireUser2FA(w http.ResponseWriter, r *http.Request) {
	h.setUser2FARequired(w, r, false)
}

func (h *Handlers) setUser2FARequired(w http.ResponseWriter, r *http.Request, required bool) {
	u, err := h.client.SetUserTOTPRequired(r.Context(), sessionToken(r), chi.URLParam(r, "id"), required)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}

func (h *Handlers) softDeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := h.client.SoftDeleteUser(r.Context(), sessionToken(r), chi.URLParam(r, "id")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) restoreUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.RestoreUser(r.Context(), sessionToken(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}

func (h *Handlers) setUserOwner(w http.ResponseWriter, r *http.Request) {
	var req struct{ IsOwner bool }
	if !decode(w, r, &req) {
		return
	}
	u, err := h.client.SetUserOwner(r.Context(), sessionToken(r), chi.URLParam(r, "id"), req.IsOwner)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}
