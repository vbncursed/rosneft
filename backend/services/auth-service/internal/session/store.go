// Package session stores opaque session tokens, 2FA challenges, and login
// throttle counters in Redis. Keys: session:<token>, user_sessions:<uid>,
// 2fa_pending:<challenge>, login_fail:<identifier>.
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
func failKey(id string) string       { return "login_fail:" + id }
