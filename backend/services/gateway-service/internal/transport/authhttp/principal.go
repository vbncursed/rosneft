package authhttp

import "context"

type ctxKey int

const (
	keyUserID ctxKey = iota
	keyPerms
	keyIsOwner
	keyOwningAdmin
	keyAuditCompany
	keyToken
)

func withPrincipal(ctx context.Context, userID string, perms []string, isOwner bool, owningAdmin, auditCompany string) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	ctx = context.WithValue(ctx, keyIsOwner, isOwner)
	ctx = context.WithValue(ctx, keyOwningAdmin, owningAdmin)
	ctx = context.WithValue(ctx, keyAuditCompany, auditCompany)
	return context.WithValue(ctx, keyPerms, perms)
}

func principalPerms(ctx context.Context) []string {
	p, _ := ctx.Value(keyPerms).([]string)
	return p
}

// principalUserID returns the authenticated caller's user id (set by
// Authenticate). Empty when unauthenticated.
func principalUserID(ctx context.Context) string {
	id, _ := ctx.Value(keyUserID).(string)
	return id
}

// principalIsOwner reports whether the caller is an owner (root of trust), who
// bypasses every route permission gate.
func principalIsOwner(ctx context.Context) bool {
	o, _ := ctx.Value(keyIsOwner).(bool)
	return o
}

func principalOwningAdmin(ctx context.Context) string {
	a, _ := ctx.Value(keyOwningAdmin).(string)
	return a
}

// Scope returns the territory visibility scope for the caller. allAccess (Root)
// means "see everything" and pairs with an empty adminID, so the catalog gets
// no filter. A non-Root caller yields a non-empty adminID.
func Scope(ctx context.Context) (adminID string, allAccess bool) {
	if principalIsOwner(ctx) {
		return "", true
	}
	return principalOwningAdmin(ctx), false
}

// IsOwner reports whether the caller is Root. Used to gate Root-only endpoints
// in the httpapi package.
func IsOwner(ctx context.Context) bool {
	return principalIsOwner(ctx)
}

// AuditCompany returns the caller's real tenant id — the audit journal's
// company key. Empty for a Root, whose actions belong to no company. This is
// NOT the same as the territory scope: Scope() mangles a guest's key to its own
// id, which would file that guest's changes under a company of one.
func AuditCompany(ctx context.Context) string {
	c, _ := ctx.Value(keyAuditCompany).(string)
	return c
}

// withToken carries the caller's bearer for handlers that must forward it to a
// service. The authhttp handlers read it off the request directly; the
// oapi-codegen ones in httpapi only ever see a context, and the audit journal
// needs the token to ask auth for the logins behind the actor ids it returns.
//
// Request-scoped and never logged: it is the same secret the request already
// arrived with, not a new one, and it dies with the context.
func withToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, keyToken, token)
}

// Token returns the caller's bearer, empty when unauthenticated.
func Token(ctx context.Context) string {
	t, _ := ctx.Value(keyToken).(string)
	return t
}
