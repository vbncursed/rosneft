package authhttp

import "context"

type ctxKey int

const (
	keyUserID ctxKey = iota
	keyPerms
	keyIsOwner
	keyOwningAdmin
)

func withPrincipal(ctx context.Context, userID string, perms []string, isOwner bool, owningAdmin string) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	ctx = context.WithValue(ctx, keyIsOwner, isOwner)
	ctx = context.WithValue(ctx, keyOwningAdmin, owningAdmin)
	return context.WithValue(ctx, keyPerms, perms)
}

func principalPerms(ctx context.Context) []string {
	p, _ := ctx.Value(keyPerms).([]string)
	return p
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
