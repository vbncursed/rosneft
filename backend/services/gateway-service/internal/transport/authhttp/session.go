package authhttp

import "net/http"

// Session lifecycle: the two ways in and the one way out. Everything here
// either issues the session cookie or clears it; nothing else in the package
// touches it.

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) {
	var req struct{ Identifier, Password string }
	if !decode(w, r, &req) {
		return
	}
	token, challenge, twoFA, err := h.client.Login(r.Context(), req.Identifier, req.Password)
	if err != nil {
		h.recordLogin(r, "auth.login", "")
		fail(w, err)
		return
	}
	// A 2FA challenge is not a completed login: the cookie is issued only once a
	// session token exists, which for the 2FA path happens in login2FA.
	if token != "" {
		h.recordLogin(r, "auth.login", token)
		h.setSession(w, token)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token, "twoFactorRequired": twoFA, "challengeToken": challenge,
		// Empty on the 2FA path: there is no session yet to derive one from.
		"csrfToken": h.CSRFToken(token),
	})
}

func (h *Handlers) login2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ ChallengeToken, Code string }
	if !decode(w, r, &req) {
		return
	}
	token, err := h.client.LoginVerify2FA(r.Context(), req.ChallengeToken, req.Code)
	if err != nil {
		h.recordLogin(r, "auth.login_2fa", "")
		fail(w, err)
		return
	}
	h.recordLogin(r, "auth.login_2fa", token)
	h.setSession(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "csrfToken": h.CSRFToken(token)})
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) {
	// Cleared BEFORE the revocation call, and unconditionally.
	//
	// On success the server-side session is already gone and a stale cookie
	// would send one doomed request per page load until it expired. On failure
	// the session may still be live — and the browser holds the only copy of it
	// that matters, since JavaScript cannot delete an httpOnly cookie and the
	// SPA's logout() swallows the error and redirects to /login regardless.
	// Returning early would leave a user who believes they are signed out still
	// carrying a working session for the cookie's full Max-Age.
	//
	// That failure window is narrow, and worth stating precisely so nobody
	// widens the claim: this handler sits behind Authenticate, so a
	// wholly-unavailable auth-service or Redis is rejected upstream and never
	// arrives here. What reaches this line is the case where ValidateToken
	// succeeded and the delete then did not — a transient error or deadline
	// landing between the two calls. Rare, but the guard is one line and the
	// alternative failure is silent and lasts a month.
	//
	// Set-Cookie survives the error response: fail() writes a status and body,
	// not a fresh header map. handlers_test.go pins both halves.
	h.clearSession(w)
	if err := h.client.Logout(r.Context(), sessionToken(r)); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
