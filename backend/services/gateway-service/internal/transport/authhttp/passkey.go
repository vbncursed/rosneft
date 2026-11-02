package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// --- passkey login (public; orchestrated by auth-service) ---

func (h *Handlers) passkeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	opts, flowID, err := h.client.PasskeyLoginBegin(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"optionsJson": opts, "flowId": flowID})
}

func (h *Handlers) passkeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FlowID        string `json:"flowId"`
		AssertionJSON string `json:"assertionJson"`
	}
	if !decode(w, r, &req) {
		return
	}
	token, err := h.client.PasskeyLoginFinish(r.Context(), req.FlowID, req.AssertionJSON)
	if err != nil {
		h.recordLogin(r, "auth.login_passkey", "")
		fail(w, r, err)
		return
	}
	h.recordLogin(r, "auth.login_passkey", token)
	// passkeyRegisterFinish deliberately does not do this: enrolling a key is
	// done by an already-logged-in user and issues no new session.
	// No checkbox on the passkey path; it stays persistent.
	h.setSession(w, token, true)
	writeJSON(w, r, http.StatusOK, map[string]any{"token": token, "csrfToken": h.CSRFToken(token)})
}

// --- passkey enrollment + management (authenticated; passkey-service) ---

// passkeyRegisterBegin requires the same step-up as passkeyDelete: a stolen
// session must not be able to enrol the attacker's own key, which would bypass
// 2FA and outlive a password change. The gate sits at the entry, so the
// ceremony cannot start without it.
func (h *Handlers) passkeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	var req stepUpRequest
	if !decode(w, r, &req) || !h.stepUp(w, r, req) {
		return
	}
	// The principal carries no login, and authenticators display it. Begin is a
	// once-per-enrolment call, so one GetMe here costs far less than the one
	// passkey used to make on every management RPC.
	me, err := h.client.GetMe(r.Context(), sessionToken(r))
	if err != nil {
		fail(w, r, err)
		return
	}
	opts, flowID, err := h.passkey.BeginRegistration(r.Context(), principalUserID(r.Context()), me.GetUsername())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"optionsJson": opts, "flowId": flowID})
}

func (h *Handlers) passkeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FlowID         string `json:"flowId"`
		CredentialJSON string `json:"credentialJson"`
		Name           string `json:"name"`
	}
	if !decode(w, r, &req) {
		return
	}
	c, err := h.passkey.FinishRegistration(
		r.Context(), principalUserID(r.Context()), req.FlowID, req.CredentialJSON, req.Name,
	)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, credToJSON(c))
}

func (h *Handlers) passkeyList(w http.ResponseWriter, r *http.Request) {
	creds, err := h.passkey.ListCredentials(r.Context(), principalUserID(r.Context()))
	if err != nil {
		fail(w, r, err)
		return
	}
	out := make([]any, 0, len(creds))
	for _, c := range creds {
		out = append(out, credToJSON(c))
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"credentials": out})
}

// stepUpRequest is the body of every passkey call that re-authenticates.
type stepUpRequest struct{ Password, Code string }

// stepUp re-authenticates the caller: a TOTP code when the user has 2FA on,
// otherwise their password. The gateway picks the factor from the server-side
// 2FA state so a password can't stand in for a stronger factor. It writes the
// refusal itself and reports whether the caller may go on.
func (h *Handlers) stepUp(w http.ResponseWriter, r *http.Request, req stepUpRequest) bool {
	uid := principalUserID(r.Context())
	enabled, err := h.twofa.IsEnabled(r.Context(), uid)
	if err != nil {
		fail(w, r, err)
		return false
	}
	var ok bool
	if enabled {
		ok, err = h.twofa.Verify(r.Context(), uid, req.Code)
	} else {
		ok, err = h.client.VerifyPassword(r.Context(), sessionToken(r), req.Password)
	}
	if err != nil {
		fail(w, r, err)
		return false
	}
	if !ok {
		apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "re-authentication failed")
		return false
	}
	return true
}

// passkeyDelete requires step-up re-authentication, see stepUp.
func (h *Handlers) passkeyDelete(w http.ResponseWriter, r *http.Request) {
	var req stepUpRequest
	if !decode(w, r, &req) || !h.stepUp(w, r, req) {
		return
	}
	uid := principalUserID(r.Context())
	if err := h.passkey.DeleteCredential(r.Context(), uid, chi.URLParam(r, "id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
