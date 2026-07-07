package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
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

func (h *Handlers) passkeyDelete(w http.ResponseWriter, r *http.Request) {
	if err := h.passkey.DeleteCredential(r.Context(), bearer(r), chi.URLParam(r, "id")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
