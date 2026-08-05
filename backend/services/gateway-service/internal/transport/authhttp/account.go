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
	// auth-service does not own 2FA state, so the proto flag is always zero;
	// overlay the real one. Passkey state is deliberately not fetched here —
	// see factors(): this route runs on every page load and nothing reads it.
	totp, _ := h.factors(r.Context(), []string{u.GetId()}, false)
	out := userToJSON(u, totp, nil)
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
