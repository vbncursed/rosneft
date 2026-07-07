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
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"optionsJson": opts, "flowId": flowID})
}

func (h *Handlers) passkeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	var req struct{ FlowId, AssertionJson string }
	if !decode(w, r, &req) {
		return
	}
	token, err := h.client.PasskeyLoginFinish(r.Context(), req.FlowId, req.AssertionJson)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token})
}

// --- passkey enrollment + management (authenticated; passkey-service) ---

func (h *Handlers) passkeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	opts, flowID, err := h.passkey.BeginRegistration(r.Context(), bearer(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"optionsJson": opts, "flowId": flowID})
}

func (h *Handlers) passkeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	var req struct{ FlowId, CredentialJson, Name string }
	if !decode(w, r, &req) {
		return
	}
	c, err := h.passkey.FinishRegistration(r.Context(), bearer(r), req.FlowId, req.CredentialJson, req.Name)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, credToJSON(c))
}

func (h *Handlers) passkeyList(w http.ResponseWriter, r *http.Request) {
	creds, err := h.passkey.ListCredentials(r.Context(), bearer(r))
	if err != nil {
		fail(w, err)
		return
	}
	out := make([]any, 0, len(creds))
	for _, c := range creds {
		out = append(out, credToJSON(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"credentials": out})
}

// passkeyDelete requires step-up re-authentication: a TOTP code when the user
// has 2FA on, otherwise their password. The gateway picks the factor from the
// server-side 2FA state so a password can't stand in for a stronger factor.
func (h *Handlers) passkeyDelete(w http.ResponseWriter, r *http.Request) {
	var req struct{ Password, Code string }
	if !decode(w, r, &req) {
		return
	}
	uid := principalUserID(r.Context())
	enabled, err := h.twofa.IsEnabled(r.Context(), uid)
	if err != nil {
		fail(w, err)
		return
	}
	var ok bool
	if enabled {
		ok, err = h.twofa.Verify(r.Context(), uid, req.Code)
	} else {
		ok, err = h.client.VerifyPassword(r.Context(), bearer(r), req.Password)
	}
	if err != nil {
		fail(w, err)
		return
	}
	if !ok {
		apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "re-authentication failed")
		return
	}
	if err := h.passkey.DeleteCredential(r.Context(), bearer(r), chi.URLParam(r, "id")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
