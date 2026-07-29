package authhttp

import "github.com/go-chi/chi/v5"

// Mount registers the auth routes on r. Only login + login/2fa are public.
// Self routes require a valid session (Authenticate). Admin routes additionally
// require a specific permission — enforced by middleware so a new admin route
// cannot be added without a gate.
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/auth", func(ar chi.Router) {
		// Public.
		ar.Post("/login", h.login)
		ar.Post("/login/2fa", h.login2FA)
		ar.Post("/passkey/login/begin", h.passkeyLoginBegin)
		ar.Post("/passkey/login/finish", h.passkeyLoginFinish)

		// Authenticated — any valid session.
		ar.Group(func(pr chi.Router) {
			pr.Use(h.Authenticate)
			// Records the security events listed in authAuditActions. Must run
			// after Authenticate so the principal is on ctx; the login routes
			// above are public and record themselves.
			pr.Use(h.AuditAuthEvents)
			// The public login routes above are deliberately outside this: they
			// have no session yet to derive a token from, and forging a login is
			// not a CSRF anyone benefits from.
			pr.Use(h.RequireCSRF)
			pr.Post("/logout", h.logout)
			pr.Get("/me", h.me)
			pr.Post("/me/password", h.changePassword)
			pr.Post("/me/onboarding/{tour}", h.markTourSeen)
			pr.Post("/2fa/setup", h.setup2FA)
			pr.Post("/2fa/enable", h.enable2FA)
			pr.Post("/2fa/disable", h.disable2FA)
			pr.Post("/2fa/recovery/regenerate", h.regenerate2FA)
			pr.Post("/passkey/register/begin", h.passkeyRegisterBegin)
			pr.Post("/passkey/register/finish", h.passkeyRegisterFinish)
			pr.Get("/passkey/credentials", h.passkeyList)
			pr.Delete("/passkey/credentials/{id}", h.passkeyDelete)

			// Admin — authenticated + per-route permission.
			pr.With(h.Require("users:read")).Get("/users", h.listUsers)
			pr.With(h.Require("users:write")).Post("/users", h.createUser)
			pr.With(h.Require("users:read")).Get("/users/{id}", h.getUser)
			pr.With(h.Require("users:write")).Patch("/users/{id}", h.updateUser)
			pr.With(h.Require("users:freeze")).Post("/users/{id}/freeze", h.freezeUser)
			pr.With(h.Require("users:freeze")).Post("/users/{id}/unfreeze", h.unfreezeUser)
			pr.With(h.Require("users:delete")).Delete("/users/{id}", h.softDeleteUser)
			pr.With(h.Require("users:delete")).Post("/users/{id}/restore", h.restoreUser)
			// The owner flag is granted owner-to-owner; this route gate is coarse,
			// the real "actor must be an owner" check lives in the auth service.
			pr.With(h.Require("users:write")).Post("/users/{id}/owner", h.setUserOwner)
			pr.With(h.Require("roles:read")).Get("/roles", h.listRoles)
			pr.With(h.Require("roles:manage")).Post("/roles", h.createRole)
			pr.With(h.Require("roles:manage")).Patch("/roles/{slug}", h.updateRole)
			pr.With(h.Require("roles:manage")).Delete("/roles/{slug}", h.deleteRole)
			pr.With(h.Require("roles:manage")).Put("/roles/{slug}/permissions", h.setRolePermissions)
			pr.With(h.Require("permissions:read")).Get("/permissions", h.listPermissions)
		})
	})
}
