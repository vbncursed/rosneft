// Package session stores opaque session tokens, 2FA challenges, and login
// throttle counters in Redis. Keys: session:<token>, user_sessions:<uid>,
// 2fa_pending:<challenge>, login_fail:<identifier>, changepw_fail:<userID>.
package session

import (
	"time"

	"github.com/redis/go-redis/v9"
)

// Store is the Redis-backed session adapter.
type Store struct {
	rdb         *redis.Client
	idleTTL     time.Duration
	absoluteTTL time.Duration
	pendingTTL  time.Duration
	maxFails    int
	lockTTL     time.Duration
}

// New builds a session Store.
func New(rdb *redis.Client, idleTTL, absoluteTTL, pendingTTL time.Duration, maxFails int, lockTTL time.Duration) *Store {
	return &Store{rdb: rdb, idleTTL: idleTTL, absoluteTTL: absoluteTTL, pendingTTL: pendingTTL, maxFails: maxFails, lockTTL: lockTTL}
}

func sessionKey(token string) string { return "session:" + token }
func userKey(uid string) string      { return "user_sessions:" + uid }
func pendingKey(c string) string     { return "2fa_pending:" + c }

// failKeyPrefix and changePasswordFailKeyPrefix must stay disjoint: Login
// passes its identifier into failKey with no validation beyond non-empty
// (see auth.Login), so if the two throttle counters ever shared a top-level
// prefix, an attacker could pick an identifier that reproduces the other
// counter's key for an arbitrary userID — no session or credentials needed,
// since Login registers a failure before it knows whether the identifier
// resolves to a real account. See store_test.go for the property this
// guarantees. Do not build either key by concatenating the other's prefix
// into the value passed to it — that reintroduces exactly this hazard one
// level down.
const (
	failKeyPrefix               = "login_fail:"
	changePasswordFailKeyPrefix = "changepw_fail:"
)

func failKey(id string) string                   { return failKeyPrefix + id }
func changePasswordFailKey(userID string) string { return changePasswordFailKeyPrefix + userID }
