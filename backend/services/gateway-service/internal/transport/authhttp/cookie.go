package authhttp

import (
	"net/http"
	"time"
)

// sessionCookieName is the browser's copy of the session token.
const sessionCookieName = "andrey_session"

// CookieOptions is the deployment-dependent half of the cookie.
type CookieOptions struct {
	// Secure defaults to true in config: a misconfigured production is worse
	// than a broken local dev, and local compose turns it off explicitly
	// because dev runs over plain http.
	Secure bool
	// TTL should not exceed auth's absolute session TTL. Exceeding it is
	// harmless — the session expires first, ValidateToken returns 401 and the
	// client is sent to login — but it costs the user a pointless round trip.
	TTL time.Duration
}

// setSession hands the browser an httpOnly copy of the session token.
//
// httpOnly is the point: a token in localStorage is readable by any script that
// gets injected, and that is the one a persistent XSS exfiltrates. SameSite=Lax
// is what stands in for a CSRF token — a cross-site POST does not carry the
// cookie, and this API changes state only through POST/PUT/PATCH/DELETE, never
// through a GET that Lax would allow.
func (h *Handlers) setSession(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(h.cookie.TTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// clearSession deletes the cookie. The attributes must match the ones it was set
// with, or the browser keeps the original alongside the deletion.
func (h *Handlers) clearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}
