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

// Perms returns the caller's permission snapshot. Exported for the audit
// handlers: RequirePermissionForRoute only answers "may this caller in at all",
// and AuditScope/AuditOwnScope still need to see which grant they hold to build
// the filter behind it.
func Perms(ctx context.Context) []string {
	return principalPerms(ctx)
}

// UserID returns the authenticated caller's id, empty when unauthenticated.
// The journal pins a read_own caller to it.
func UserID(ctx context.Context) string {
	return principalUserID(ctx)
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

// TestPrincipal is what a test wants encoded into the context. A struct rather
// than six parameters: a caller that sets only Perms should not have to get the
// other five right by position.
type TestPrincipal struct {
	UserID       string
	Perms        []string
	IsOwner      bool
	OwningAdmin  string
	AuditCompany string
}

// NewTestContextFor builds a principal context outside a real request. It
// exists because the gates and handlers that need one live in another package
// and cannot reach the unexported context keys; keeping the construction here
// means their tests exercise the same encoding Authenticate writes, not a copy
// of it.
func NewTestContextFor(ctx context.Context, p TestPrincipal) context.Context {
	return withPrincipal(ctx, p.UserID, p.Perms, p.IsOwner, p.OwningAdmin, p.AuditCompany)
}

// NewTestContext is the territory/blob gates' shorthand: those care only about
// the scope, so the user id is a placeholder and the permissions are empty.
func NewTestContext(ctx context.Context, isOwner bool, owningAdmin string) context.Context {
	return NewTestContextFor(ctx, TestPrincipal{
		UserID: "test-user", IsOwner: isOwner,
		OwningAdmin: owningAdmin, AuditCompany: owningAdmin,
	})
}
