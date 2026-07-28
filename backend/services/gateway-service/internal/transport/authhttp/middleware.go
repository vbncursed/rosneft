package authhttp

import (
	"net/http"
	"slices"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

// Authenticate validates the Bearer token via the auth-service and injects the
// principal (user id + permission snapshot) into the request context. Requests
// without a valid token get 401.
func (h *Handlers) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			apperr.Write(w, http.StatusUnauthorized, apperr.SlugUnauthenticated, "missing bearer token")
			return
		}
		uid, perms, isOwner, owningAdmin, auditCompany, err := h.client.ValidateToken(r.Context(), token)
		if err != nil {
			fail(w, err) // maps Unauthenticated → 401
			return
		}
		ctx := withPrincipal(r.Context(), uid, perms, isOwner, owningAdmin, auditCompany)
		// The bearer travels on too: handlers in httpapi only ever see a
		// context, and the audit journal has to forward it to auth to turn the
		// actor ids it returns into logins.
		ctx = withToken(ctx, token)
		// Also publish the actor for outbound gRPC: the client interceptor in
		// grpcutil forwards it to catalog/content/auth, where it reaches the
		// audit trigger through the mutation's transaction.
		ctx = grpcutil.WithActor(ctx, grpcutil.Actor{ID: uid, Company: auditCompany})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Require gates a route on a single permission. It MUST run after Authenticate,
// which populates the principal's permission snapshot. 403 if the permission is
// absent.
//
// Exported because routes outside the /api JSON sub-router — where
// RequirePermissionForRoute reads the chi route pattern — have to apply their
// gate by hand. The audit CSV export is one such route.
func (h *Handlers) Require(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !principalIsOwner(r.Context()) && !slices.Contains(principalPerms(r.Context()), perm) {
				apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "permission denied: "+perm)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
