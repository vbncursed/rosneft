package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// The caller acting on their own account. Distinct from users.go, which is one
// admin acting on somebody else's — different permissions, different subject.

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
	// The SPA's only way back to a token after a page reload.
	out.CSRFToken = h.CSRFToken(sessionToken(r))
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
