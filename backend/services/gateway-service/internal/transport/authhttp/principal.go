package authhttp

import "context"

type ctxKey int

const (
	keyUserID ctxKey = iota
	keyPerms
	keyIsOwner
)

func withPrincipal(ctx context.Context, userID string, perms []string, isOwner bool) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	ctx = context.WithValue(ctx, keyIsOwner, isOwner)
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
