package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *Handlers) listUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	list, err := h.client.ListUsers(r.Context(), bearer(r), q.Get("status"), q.Get("includeDeleted") == "true")
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, usersToJSON(list))
}

func (h *Handlers) createUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email, Username, Password string
		RoleSlugs                 []string
	}
	if !decode(w, r, &req) {
		return
	}
	u, err := h.client.CreateUser(r.Context(), bearer(r), req.Email, req.Username, req.Password, req.RoleSlugs)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, userToJSON(u))
}

func (h *Handlers) getUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetUser(r.Context(), bearer(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userToJSON(u))
}

func (h *Handlers) updateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RoleSlugs       []string
		Email, Username string
	}
	if !decode(w, r, &req) {
		return
	}
	u, err := h.client.UpdateUser(r.Context(), bearer(r), chi.URLParam(r, "id"), req.RoleSlugs, req.Email, req.Username)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userToJSON(u))
}

func (h *Handlers) freezeUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.FreezeUser(r.Context(), bearer(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userToJSON(u))
}

func (h *Handlers) unfreezeUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.UnfreezeUser(r.Context(), bearer(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userToJSON(u))
}

func (h *Handlers) softDeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := h.client.SoftDeleteUser(r.Context(), bearer(r), chi.URLParam(r, "id")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) restoreUser(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.RestoreUser(r.Context(), bearer(r), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userToJSON(u))
}
