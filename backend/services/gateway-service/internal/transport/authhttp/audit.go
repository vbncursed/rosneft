package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// authAuditActions maps "METHOD <chi route pattern>" to the journal action it
// records. It deliberately mirrors routePerms in shape.
//
// Only events that change no table are listed. User and role mutations reach
// users / user_roles / roles / role_permissions, which audit_capture() already
// captures — listing them here would write each change twice. 2FA setup is
// absent for a related reason: it hands out a secret but changes no state, so
// there is nothing to record until enable or disable.
var authAuditActions = map[string]string{
	"POST /api/auth/login":                      "auth.login",
	"POST /api/auth/login/2fa":                  "auth.login_2fa",
	"POST /api/auth/passkey/login/finish":       "auth.login_passkey",
	"POST /api/auth/logout":                     "auth.logout",
	"POST /api/auth/me/password":                "auth.password_change",
	"POST /api/auth/2fa/enable":                 "auth.2fa_enable",
	"POST /api/auth/2fa/disable":                "auth.2fa_disable",
	"POST /api/auth/2fa/recovery/regenerate":    "auth.2fa_recovery_regenerate",
	"POST /api/auth/passkey/register/finish":    "auth.passkey_register",
	"DELETE /api/auth/passkey/credentials/{id}": "auth.passkey_delete",
}

// AuditAuthEvents records the outcome of an authenticated security action.
//
// It runs on the authenticated group only, where the principal is already on
// ctx. The three login routes record themselves instead: at that point there is
// no principal yet, and the identity has to be resolved from the token the
// response is about to carry.
func (h *Handlers) AuditAuthEvents(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		action, tracked := authAuditActions[r.Method+" "+chi.RouteContext(r.Context()).RoutePattern()]
		if !tracked {
			next.ServeHTTP(w, r)
			return
		}
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		result := "ok"
		if ww.Status() >= http.StatusBadRequest {
			result = "failed"
		}
		h.recordAuth(r, action, principalUserID(r.Context()), AuditCompany(r.Context()), result)
	})
}

// recordAuth writes one journal event.
//
// A failure to record is logged, never surfaced: the user's action has already
// happened, and failing the response afterwards would be worse than a missing
// line. That is a deliberate asymmetry with trigger-captured changes, which
// share the mutation's transaction and therefore cannot be lost.
func (h *Handlers) recordAuth(r *http.Request, action, actorID, companyID, result string) {
	err := h.audit.Record(r.Context(), domain.AuditEvent{
		ActorID:   actorID,
		CompanyID: companyID,
		Action:    action,
		Entity:    "session",
		Result:    result,
	})
	if err != nil {
		h.logger.Error("audit: record auth event failed", "action", action, "err", err)
	}
}

// recordLogin resolves who just signed in and records the event.
//
// The login response carries a token, not an identity, so the actor costs one
// extra ValidateToken round trip — on the login path only, and it is the sole
// way to answer "who signed in" rather than "someone signed in".
//
// A failed attempt is recorded with no actor and no company, so it is visible
// to Root alone. Resolving the company from the submitted identifier would leak
// whether that account exists, which the login flow deliberately hides.
func (h *Handlers) recordLogin(r *http.Request, action, token string) {
	if token == "" {
		h.recordAuth(r, action, "", "", "failed")
		return
	}
	actorID, companyID := "", ""
	if uid, _, _, _, company, err := h.client.ValidateToken(r.Context(), token); err == nil {
		actorID, companyID = uid, company
	}
	h.recordAuth(r, action, actorID, companyID, "ok")
}
