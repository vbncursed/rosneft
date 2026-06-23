package authhttp

import "context"

type ctxKey int

const (
	keyUserID ctxKey = iota
	keyPerms
)

func withPrincipal(ctx context.Context, userID string, perms []string) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	return context.WithValue(ctx, keyPerms, perms)
}

func principalPerms(ctx context.Context) []string {
	p, _ := ctx.Value(keyPerms).([]string)
	return p
}
