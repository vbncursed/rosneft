package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *Handlers) listRoles(w http.ResponseWriter, r *http.Request) {
	list, err := h.client.ListRoles(r.Context(), bearer(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rolesToJSON(list))
}

func (h *Handlers) createRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Slug, Title     string
		PermissionSlugs []string
	}
	if !decode(w, r, &req) {
		return
	}
	role, err := h.client.CreateRole(r.Context(), bearer(r), req.Slug, req.Title, req.PermissionSlugs)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, roleToJSON(role))
}

func (h *Handlers) updateRole(w http.ResponseWriter, r *http.Request) {
	var req struct{ Title string }
	if !decode(w, r, &req) {
		return
	}
	role, err := h.client.UpdateRole(r.Context(), bearer(r), chi.URLParam(r, "slug"), req.Title)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roleToJSON(role))
}

func (h *Handlers) deleteRole(w http.ResponseWriter, r *http.Request) {
	if err := h.client.DeleteRole(r.Context(), bearer(r), chi.URLParam(r, "slug")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) setRolePermissions(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PermissionSlugs []string
	}
	if !decode(w, r, &req) {
		return
	}
	role, err := h.client.SetRolePermissions(r.Context(), bearer(r), chi.URLParam(r, "slug"), req.PermissionSlugs)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roleToJSON(role))
}

func (h *Handlers) listPermissions(w http.ResponseWriter, r *http.Request) {
	list, err := h.client.ListPermissions(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, permissionsToJSON(list))
}
