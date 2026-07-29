package authhttp

import "net/http"

// TOTP enrolment and recovery codes, forwarded to twofa-service. Verifying a
// code at login is not here: that belongs to the login flow in session.go and
// is orchestrated by auth-service.

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
