package authhttp

import (
	"net/http"
	"time"
)

// TOTP enrolment and recovery codes, forwarded to twofa-service. Verifying a
// code at login is not here: that belongs to the login flow in session.go and
// is orchestrated by auth-service.

// twoFactorStatus answers what the account screen shows about 2FA. A GET, so
// no CSRF; there is nothing to parameterise — the user is the session's.
func (h *Handlers) twoFactorStatus(w http.ResponseWriter, r *http.Request) {
	st, err := h.twofa.Status(r.Context(), principalUserID(r.Context()))
	if err != nil {
		fail(w, r, err)
		return
	}
	body := map[string]any{
		"enabled":           st.Enabled,
		"recoveryRemaining": st.RecoveryRemaining,
		"recoveryTotal":     st.RecoveryTotal,
	}
	// Omitted rather than zero: the date is unknown for enrolments that predate
	// the enabled_at column, and a client cannot tell an epoch from a fact.
	if !st.EnabledAt.IsZero() {
		body["enabledAt"] = st.EnabledAt.Format(time.RFC3339)
	}
	writeJSON(w, r, http.StatusOK, body)
}

func (h *Handlers) setup2FA(w http.ResponseWriter, r *http.Request) {
	// The principal carries no login, and the authenticator labels the entry
	// with it. Setup is a once-per-enrolment call, so one GetMe here costs far
	// less than the one twofa used to make on every RPC.
	me, err := h.client.GetMe(r.Context(), sessionToken(r))
	if err != nil {
		fail(w, r, err)
		return
	}
	secret, url, err := h.twofa.Setup(r.Context(), principalUserID(r.Context()), me.GetUsername())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"secret": secret, "otpauthUrl": url})
}

func (h *Handlers) enable2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) {
		return
	}
	codes, err := h.twofa.Enable(r.Context(), principalUserID(r.Context()), req.Code)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (h *Handlers) disable2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) {
		return
	}
	if err := h.twofa.Disable(r.Context(), principalUserID(r.Context()), req.Code); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) regenerate2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) {
		return
	}
	codes, err := h.twofa.Regenerate(r.Context(), principalUserID(r.Context()), req.Code)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"recoveryCodes": codes})
}
